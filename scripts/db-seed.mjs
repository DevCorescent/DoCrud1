import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required to seed the database.');
  process.exit(1);
}

const root = process.cwd();
const dataDir = path.join(root, 'data');
const customTemplatesPath = path.join(dataDir, 'custom', 'templates.json');

const readJson = async (filePath, fallback) => {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const schemaSql = await readFile(path.join(root, 'db', 'schema.sql'), 'utf8');

const files = [
  ['json:data/users.json', path.join(dataDir, 'users.json'), []],
  ['json:data/history.json', path.join(dataDir, 'history.json'), []],
  ['json:data/business-settings.json', path.join(dataDir, 'business-settings.json'), []],
  ['json:data/contact-requests.json', path.join(dataDir, 'contact-requests.json'), []],
  ['json:data/dropdown-options.json', path.join(dataDir, 'dropdown-options.json'), {}],
  ['json:data/mail-settings.json', path.join(dataDir, 'mail-settings.json'), {}],
  ['json:data/signature-settings.json', path.join(dataDir, 'signature-settings.json'), {}],
  ['json:data/theme-settings.json', path.join(dataDir, 'theme-settings.json'), {}],
  ['json:data/landing-settings.json', path.join(dataDir, 'landing-settings.json'), {}],
  ['json:data/saas-plans.json', path.join(dataDir, 'saas-plans.json'), []],
  ['json:data/custom/templates.json', customTemplatesPath, []],
];

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query(schemaSql);

  for (const [key, filePath, fallback] of files) {
    const value = await readJson(filePath, fallback);
    await pool.query(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    );
  }

  const users = await readJson(path.join(dataDir, 'users.json'), []);
  for (const user of users) {
    await pool.query(
      `INSERT INTO users (
        id, email, name, role, permissions, organization_id, password_hash, password_salt,
        profile, is_active, created_at, last_login, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10, COALESCE($11::timestamptz, NOW()),
        $12::timestamptz, NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        permissions = EXCLUDED.permissions,
        organization_id = EXCLUDED.organization_id,
        password_hash = EXCLUDED.password_hash,
        password_salt = EXCLUDED.password_salt,
        profile = EXCLUDED.profile,
        is_active = EXCLUDED.is_active,
        last_login = EXCLUDED.last_login,
        updated_at = NOW()`,
      [
        String(user.id),
        String(user.email || '').toLowerCase(),
        String(user.name || ''),
        String(user.role || 'user'),
        JSON.stringify(user.permissions || []),
        user.organizationId ? String(user.organizationId) : null,
        user.passwordHash || null,
        user.passwordSalt || null,
        JSON.stringify(user),
        Boolean(user.isActive ?? true),
        user.createdAt || null,
        user.lastLogin || null,
      ],
    );
  }

  const businessSettings = await readJson(path.join(dataDir, 'business-settings.json'), []);
  for (const org of businessSettings) {
    await pool.query(
      `INSERT INTO organizations (
        id, name, display_name, industry, company_size, workspace_preset,
        support_email, support_phone, settings, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW(), COALESCE($10::timestamptz, NOW()))
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
        String(org.organizationId),
        String(org.organizationName || org.displayName || 'Organization'),
        org.displayName || null,
        org.industry || null,
        org.companySize || null,
        org.workspacePreset || null,
        org.supportEmail || null,
        org.supportPhone || null,
        JSON.stringify(org),
        org.updatedAt || null,
      ],
    );
  }

  const templates = await readJson(customTemplatesPath, []);
  for (const template of templates) {
    await pool.query(
      `INSERT INTO templates (
        id, name, category, description, is_custom, organization_id, created_by,
        version, fields, template_html, metadata, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb,
        COALESCE($12::timestamptz, NOW()), COALESCE($13::timestamptz, NOW())
      )
      ON CONFLICT (id)
      DO UPDATE SET
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
        updated_at = NOW()`,
      [
        String(template.id),
        String(template.name || ''),
        String(template.category || 'General'),
        template.description || null,
        Boolean(template.isCustom),
        template.organizationId || null,
        template.createdBy || null,
        Number(template.version || 1),
        JSON.stringify(template.fields || []),
        String(template.template || ''),
        JSON.stringify(template),
        template.createdAt || null,
        template.updatedAt || null,
      ],
    );
  }

  const history = await readJson(path.join(dataDir, 'history.json'), []);
  for (const entry of history) {
    await pool.query(
      `INSERT INTO history_entries (
        id, share_id, reference_number, template_id, template_name, category,
        organization_id, generated_by, generated_at, share_url, share_password,
        preview_html, document_data, editor_state, collaboration_comments,
        access_events, managed_files, version_snapshots, delivery_history,
        full_record, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), $10, $11,
        $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb,
        $19::jsonb, $20::jsonb, NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        share_id = EXCLUDED.share_id,
        reference_number = EXCLUDED.reference_number,
        template_id = EXCLUDED.template_id,
        template_name = EXCLUDED.template_name,
        category = EXCLUDED.category,
        organization_id = EXCLUDED.organization_id,
        generated_by = EXCLUDED.generated_by,
        generated_at = EXCLUDED.generated_at,
        share_url = EXCLUDED.share_url,
        share_password = EXCLUDED.share_password,
        preview_html = EXCLUDED.preview_html,
        document_data = EXCLUDED.document_data,
        editor_state = EXCLUDED.editor_state,
        collaboration_comments = EXCLUDED.collaboration_comments,
        access_events = EXCLUDED.access_events,
        managed_files = EXCLUDED.managed_files,
        version_snapshots = EXCLUDED.version_snapshots,
        delivery_history = EXCLUDED.delivery_history,
        full_record = EXCLUDED.full_record,
        updated_at = NOW()`,
      [
        String(entry.id),
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

  const contactRequests = await readJson(path.join(dataDir, 'contact-requests.json'), []);
  for (const request of contactRequests) {
    await pool.query(
      `INSERT INTO contact_requests (id, name, email, company, phone, message, request_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8::timestamptz, NOW()))
       ON CONFLICT (id)
       DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         company = EXCLUDED.company,
         phone = EXCLUDED.phone,
         message = EXCLUDED.message,
         request_data = EXCLUDED.request_data`,
      [
        String(request.id || `${request.email || 'contact'}-${request.createdAt || Date.now()}`),
        String(request.name || ''),
        String(request.email || '').toLowerCase(),
        request.company || null,
        request.phone || null,
        request.message || null,
        JSON.stringify(request),
        request.createdAt || null,
      ],
    );
  }

  const settingsMappings = [
    ['automation', 'workflow', await readJson(path.join(dataDir, 'automation-settings.json'), {})],
    ['collaboration', 'default', await readJson(path.join(dataDir, 'collaboration-settings.json'), {})],
    ['mail', 'smtp', await readJson(path.join(dataDir, 'mail-settings.json'), {})],
    ['landing', 'homepage', await readJson(path.join(dataDir, 'landing-settings.json'), {})],
    ['theme', 'active', await readJson(path.join(dataDir, 'theme-settings.json'), {})],
    ['signature', 'registry', await readJson(path.join(dataDir, 'signature-settings.json'), {})],
  ];

  for (const [scope, key, value] of settingsMappings) {
    await pool.query(
      `INSERT INTO settings_store (scope, key, value, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (scope, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [scope, key, JSON.stringify(value)],
    );
  }

  const dropdownOptions = await readJson(path.join(dataDir, 'dropdown-options.json'), {});
  for (const [fieldKey, options] of Object.entries(dropdownOptions)) {
    await pool.query(
      `INSERT INTO dropdown_options (field_key, options, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (field_key)
       DO UPDATE SET options = EXCLUDED.options, updated_at = NOW()`,
      [fieldKey, JSON.stringify(options || [])],
    );
  }

  const saasPlans = await readJson(path.join(dataDir, 'saas-plans.json'), []);
  for (const plan of saasPlans) {
    await pool.query(
      `INSERT INTO saas_plans (id, name, billing_model, price_label, features, plan_data, active, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, NOW())
       ON CONFLICT (id)
       DO UPDATE SET
         name = EXCLUDED.name,
         billing_model = EXCLUDED.billing_model,
         price_label = EXCLUDED.price_label,
         features = EXCLUDED.features,
         plan_data = EXCLUDED.plan_data,
         active = EXCLUDED.active,
         updated_at = NOW()`,
      [
        String(plan.id),
        String(plan.name || ''),
        String(plan.billingModel || 'subscription'),
        String(plan.priceLabel || ''),
        JSON.stringify(plan.includedFeatures || []),
        JSON.stringify(plan),
        Boolean(plan.active ?? true),
      ],
    );
  }

  const signatureSettings = await readJson(path.join(dataDir, 'signature-settings.json'), {});
  for (const signature of signatureSettings.signatures || []) {
    await pool.query(
      `INSERT INTO signatures (id, signer_name, signer_role, organization_id, signature_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6::timestamptz, NOW()), NOW())
       ON CONFLICT (id)
       DO UPDATE SET
         signer_name = EXCLUDED.signer_name,
         signer_role = EXCLUDED.signer_role,
         organization_id = EXCLUDED.organization_id,
         signature_data = EXCLUDED.signature_data,
         updated_at = NOW()`,
      [
        String(signature.id),
        String(signature.signerName || ''),
        signature.signerRole || null,
        signature.organizationId || null,
        JSON.stringify(signature),
        signature.createdAt || signature.signedAt || null,
      ],
    );
  }

  console.log('Database seeded successfully from local project data.');
} finally {
  await pool.end();
}
