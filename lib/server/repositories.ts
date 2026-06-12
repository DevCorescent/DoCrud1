import { ContactRequest, DocumentHistory, DocumentTemplate, BusinessSettings, SaasPlan } from '@/types/document';
import { getDbPool } from '@/lib/server/database';
import {
  businessSettingsPath,
  contactRequestsPath,
  customTemplatesPath,
  dropdownOptionsPath,
  historyFilePath,
  readJsonFile,
  saasPlansPath,
  usersPath,
  writeJsonFile,
} from '@/lib/server/storage';

type StoredUserRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
  organizationId?: string;
  passwordHash?: string;
  passwordSalt?: string;
  isActive?: boolean;
  createdAt?: string;
  lastLogin?: string;
};

type DropdownOptionMap = Record<string, string[]>;

function mapUserRow(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: unknown;
  organization_id: string | null;
  password_hash: string | null;
  password_salt: string | null;
  profile: StoredUserRecord | null;
  is_active: boolean;
  created_at: string | null;
  last_login: string | null;
}) {
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : {} as StoredUserRecord;
  return {
    ...profile,
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
    organizationId: row.organization_id ?? profile.organizationId,
    passwordHash: row.password_hash ?? profile.passwordHash,
    passwordSalt: row.password_salt ?? profile.passwordSalt,
    isActive: row.is_active,
    createdAt: profile.createdAt || row.created_at || undefined,
    lastLogin: profile.lastLogin || row.last_login || undefined,
  };
}

export async function getStoredUsersFromRepository<T extends StoredUserRecord>(fallback: T[]): Promise<T[]> {
  const pool = getDbPool();
  if (!pool) {
    return readJsonFile<T[]>(usersPath, fallback);
  }

  const result = await pool.query(`
    SELECT id, email, name, role, permissions, organization_id, password_hash, password_salt, profile, is_active, created_at, last_login
    FROM users
    ORDER BY created_at ASC, id ASC
  `);
  if (result.rows.length === 0) {
    return fallback;
  }

  return result.rows.map((row) => mapUserRow(row as never) as T);
}

export async function saveStoredUsersToRepository<T extends StoredUserRecord>(users: T[]) {
  const pool = getDbPool();
  if (!pool) {
    await writeJsonFile(usersPath, users);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM users');
    for (const user of users) {
      await client.query(
        `INSERT INTO users (
          id, email, name, role, permissions, organization_id, password_hash, password_salt,
          profile, is_active, created_at, last_login, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10, COALESCE($11::timestamptz, NOW()), $12::timestamptz, NOW()
        )`,
        [
          user.id,
          String(user.email).toLowerCase(),
          user.name,
          user.role,
          JSON.stringify(user.permissions || []),
          user.organizationId || null,
          user.passwordHash || null,
          user.passwordSalt || null,
          JSON.stringify(user),
          Boolean(user.isActive ?? true),
          user.createdAt || null,
          user.lastLogin || null,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getBusinessSettingsFromRepository(): Promise<BusinessSettings[]> {
  const pool = getDbPool();
  if (!pool) {
    return readJsonFile<BusinessSettings[]>(businessSettingsPath, []);
  }

  const result = await pool.query(`
    SELECT id, name, settings, updated_at
    FROM organizations
    ORDER BY updated_at DESC, id ASC
  `);
  return result.rows.map((row) => ({
    ...(row.settings && typeof row.settings === 'object' ? row.settings : {}),
    organizationId: String(row.id),
    organizationName: String((row.settings as Record<string, unknown>)?.organizationName || row.name || 'Business Workspace'),
    updatedAt: String((row.settings as Record<string, unknown>)?.updatedAt || row.updated_at || new Date().toISOString()),
  })) as BusinessSettings[];
}

export async function saveBusinessSettingsToRepository(settings: BusinessSettings) {
  const pool = getDbPool();
  if (!pool) {
    const existing = await readJsonFile<BusinessSettings[]>(businessSettingsPath, []);
    const index = existing.findIndex((entry) => entry.organizationId === settings.organizationId);
    const next = index === -1 ? [...existing, settings] : existing.map((entry, i) => i === index ? settings : entry);
    await writeJsonFile(businessSettingsPath, next);
    return;
  }

  await pool.query(
    `INSERT INTO organizations (
      id, name, display_name, industry, company_size, workspace_preset, support_email, support_phone, settings, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW(), NOW()
    )
    ON CONFLICT (id)
    DO UPDATE SET
      name = EXCLUDED.name,
      display_name = EXCLUDED.display_name,
      industry = EXCLUDED.industry,
      company_size = EXCLUDED.company_size,
      workspace_preset = EXCLUDED.workspace_preset,
      support_email = EXCLUDED.support_email,
      support_phone = EXCLUDED.support_phone,
      settings = EXCLUDED.settings,
      updated_at = NOW()`,
    [
      settings.organizationId,
      settings.organizationName,
      settings.displayName || settings.organizationName,
      settings.industry || null,
      settings.companySize || null,
      settings.workspacePreset || null,
      settings.supportEmail || null,
      settings.supportPhone || null,
      JSON.stringify(settings),
    ],
  );
}

let _templatesCache: { data: DocumentTemplate[]; expiresAt: number } | null = null;
const TEMPLATES_CACHE_TTL = 60_000; // 60 s — templates change rarely

export function invalidateTemplatesCache(): void {
  _templatesCache = null;
}

export async function getCustomTemplatesFromRepository(): Promise<DocumentTemplate[]> {
  if (_templatesCache && _templatesCache.expiresAt > Date.now()) {
    return _templatesCache.data;
  }
  const pool = getDbPool();
  let data: DocumentTemplate[];
  if (!pool) {
    data = await readJsonFile<DocumentTemplate[]>(customTemplatesPath, []);
  } else {
    const result = await pool.query(`
      SELECT id, name, category, description, is_custom, organization_id, created_by, version, fields, template_html, metadata, created_at, updated_at
      FROM templates
      ORDER BY updated_at DESC, id ASC
    `);
    data = result.rows.map((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
      return {
        ...metadata,
        id: String(row.id),
        name: String(row.name),
        category: String(row.category || 'General'),
        description: row.description ? String(row.description) : undefined,
        isCustom: Boolean(row.is_custom),
        organizationId: row.organization_id ? String(row.organization_id) : undefined,
        createdBy: row.created_by ? String(row.created_by) : undefined,
        version: Number(row.version || 1),
        fields: Array.isArray(row.fields) ? row.fields : [],
        template: String(row.template_html || ''),
        createdAt: String((metadata.createdAt as string) || row.created_at || new Date().toISOString()),
        updatedAt: String((metadata.updatedAt as string) || row.updated_at || new Date().toISOString()),
      } as DocumentTemplate;
    });
  }
  _templatesCache = { data, expiresAt: Date.now() + TEMPLATES_CACHE_TTL };
  return data;
}

export async function saveCustomTemplatesToRepository(templates: DocumentTemplate[]) {
  invalidateTemplatesCache();
  const pool = getDbPool();
  if (!pool) {
    await writeJsonFile(customTemplatesPath, templates);
    return;
  }

  const incomingIds = new Set(templates.map((t) => t.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Diff-based reconcile: delete only the templates that aren't in the new
    // list, upsert the rest. Avoids rewriting every row when callers do the
    // common load-all → mutate-one → save-all pattern.
    const existing = await client.query<{ id: string }>(`SELECT id FROM templates`);
    const toDelete = existing.rows.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query(`DELETE FROM templates WHERE id = ANY($1::text[])`, [toDelete]);
    }
    for (const template of templates) {
      await client.query(
        `INSERT INTO templates (
          id, name, category, description, is_custom, organization_id, created_by, version, fields, template_html, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, COALESCE($12::timestamptz, NOW()), COALESCE($13::timestamptz, NOW())
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          is_custom = EXCLUDED.is_custom,
          organization_id = EXCLUDED.organization_id,
          created_by = EXCLUDED.created_by,
          version = EXCLUDED.version,
          fields = EXCLUDED.fields,
          template_html = EXCLUDED.template_html,
          metadata = EXCLUDED.metadata,
          updated_at = COALESCE(EXCLUDED.updated_at, NOW())`,
        [
          template.id,
          template.name,
          template.category || 'General',
          template.description || null,
          Boolean(template.isCustom),
          template.organizationId || null,
          template.createdBy || null,
          Number(template.version || 1),
          JSON.stringify(template.fields || []),
          template.template || '',
          JSON.stringify(template),
          template.createdAt || null,
          template.updatedAt || null,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getHistoryEntriesFromRepository(): Promise<DocumentHistory[]> {
  const pool = getDbPool();
  if (!pool) {
    return readJsonFile<DocumentHistory[]>(historyFilePath, []);
  }

  const result = await pool.query(`
    SELECT full_record
    FROM history_entries
    ORDER BY generated_at DESC, id DESC
  `);
  return result.rows.map((row) => row.full_record as DocumentHistory);
}

export async function saveHistoryEntriesToRepository(entries: DocumentHistory[]) {
  const pool = getDbPool();
  if (!pool) {
    await writeJsonFile(historyFilePath, entries);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM history_entries');
    for (const entry of entries) {
      await client.query(
        `INSERT INTO history_entries (
          id, share_id, reference_number, template_id, template_name, category, organization_id, generated_by, generated_at,
          share_url, share_password, preview_html, document_data, editor_state, collaboration_comments, access_events,
          managed_files, version_snapshots, delivery_history, full_record, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), $10, $11, $12, $13::jsonb, $14::jsonb,
          $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, NOW()
        )`,
        [
          entry.id,
          entry.shareId || null,
          entry.referenceNumber || null,
          entry.templateId || null,
          entry.templateName || null,
          entry.category || null,
          entry.organizationId || null,
          entry.generatedBy || null,
          entry.generatedAt || null,
          entry.shareUrl || null,
          entry.sharePassword || null,
          entry.previewHtml || null,
          JSON.stringify(entry.data || {}),
          JSON.stringify(entry.editorState || {}),
          JSON.stringify(entry.collaborationComments || []),
          JSON.stringify(entry.accessEvents || []),
          JSON.stringify(entry.managedFiles || []),
          JSON.stringify(entry.versionSnapshots || []),
          JSON.stringify(entry.deliveryHistory || []),
          JSON.stringify(entry),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSaasPlansFromRepository(fallback: SaasPlan[]): Promise<SaasPlan[]> {
  const pool = getDbPool();
  if (!pool) {
    return readJsonFile<SaasPlan[]>(saasPlansPath, fallback);
  }

  const result = await pool.query(`
    SELECT plan_data
    FROM saas_plans
    ORDER BY updated_at DESC, id ASC
  `);
  return result.rows.length ? result.rows.map((row) => row.plan_data as SaasPlan) : fallback;
}

export async function saveSaasPlansToRepository(plans: SaasPlan[]) {
  const pool = getDbPool();
  if (!pool) {
    await writeJsonFile(saasPlansPath, plans);
    return;
  }

  const incomingIds = new Set(plans.map((p) => p.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Diff-based reconcile: delete only the plans that aren't in the new list,
    // upsert the rest. Avoids rewriting every row on every settings save.
    const existing = await client.query<{ id: string }>(`SELECT id FROM saas_plans`);
    const toDelete = existing.rows.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query(`DELETE FROM saas_plans WHERE id = ANY($1::text[])`, [toDelete]);
    }
    for (const plan of plans) {
      await client.query(
        `INSERT INTO saas_plans (id, name, billing_model, price_label, features, plan_data, active, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           billing_model = EXCLUDED.billing_model,
           price_label = EXCLUDED.price_label,
           features = EXCLUDED.features,
           plan_data = EXCLUDED.plan_data,
           active = EXCLUDED.active,
           updated_at = NOW()`,
        [
          plan.id,
          plan.name,
          plan.billingModel,
          plan.priceLabel,
          JSON.stringify(plan.includedFeatures || []),
          JSON.stringify(plan),
          Boolean(plan.active ?? true),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSettingsValueFromRepository<T>(scope: string, key: string, fallback: T): Promise<T> {
  const pool = getDbPool();
  if (!pool) {
    return fallback;
  }

  const result = await pool.query<{ value: T }>(
    'SELECT value FROM settings_store WHERE scope = $1 AND key = $2 LIMIT 1',
    [scope, key],
  );
  return result.rows[0]?.value ?? fallback;
}

export async function saveSettingsValueToRepository<T>(scope: string, key: string, value: T) {
  const pool = getDbPool();
  if (!pool) {
    return;
  }

  await pool.query(
    `INSERT INTO settings_store (scope, key, value, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (scope, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [scope, key, JSON.stringify(value)],
  );
}

export async function getDropdownOptionsFromRepository(): Promise<DropdownOptionMap> {
  const pool = getDbPool();
  if (!pool) {
    return readJsonFile<DropdownOptionMap>(dropdownOptionsPath, {});
  }

  const result = await pool.query('SELECT field_key, options FROM dropdown_options ORDER BY field_key ASC');
  return Object.fromEntries(result.rows.map((row) => [String(row.field_key), Array.isArray(row.options) ? row.options.map(String) : []]));
}

export async function saveDropdownOptionsToRepository(options: DropdownOptionMap) {
  const pool = getDbPool();
  if (!pool) {
    await writeJsonFile(dropdownOptionsPath, options);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM dropdown_options');
    for (const [fieldKey, values] of Object.entries(options)) {
      await client.query(
        'INSERT INTO dropdown_options (field_key, options, updated_at) VALUES ($1, $2::jsonb, NOW())',
        [fieldKey, JSON.stringify(values)],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getContactRequestsFromRepository(): Promise<ContactRequest[]> {
  const pool = getDbPool();
  if (!pool) {
    return readJsonFile<ContactRequest[]>(contactRequestsPath, []);
  }

  const result = await pool.query('SELECT request_data FROM contact_requests ORDER BY created_at DESC, id DESC');
  return result.rows.map((row) => row.request_data as ContactRequest);
}

export async function addContactRequestToRepository(request: ContactRequest) {
  const pool = getDbPool();
  if (!pool) {
    const existing = await readJsonFile<ContactRequest[]>(contactRequestsPath, []);
    await writeJsonFile(contactRequestsPath, [request, ...existing]);
    return;
  }

  await pool.query(
    `INSERT INTO contact_requests (id, name, email, company, phone, message, request_data, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8::timestamptz, NOW()))`,
    [
      request.id,
      request.name,
      request.email.toLowerCase(),
      request.organization || null,
      request.phone || null,
      request.message || null,
      JSON.stringify(request),
      request.createdAt || null,
    ],
  );
}
