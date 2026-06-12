// One-time importer: moves JSON files (or their blob copies in app_state) into
// the normalized tables added in db/schema.sql. Safe to re-run — every insert
// uses ON CONFLICT (id) DO UPDATE so existing rows are overwritten with the
// latest content.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/db-migrate-blobs.mjs [--only=name1,name2]
//
// Resolution order for each entity:
//   1. Read from local data/<file>.json (preferred, freshest)
//   2. Fall back to app_state row keyed by `json:data/<file>.json`
//
// After this runs, /lib/server/storage.ts will start reading from the
// normalized tables for any caller, including legacy route handlers that
// still call readJsonFile/writeJsonFile.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyFilter = onlyArg ? new Set(onlyArg.replace('--only=', '').split(',').map((s) => s.trim()).filter(Boolean)) : null;

const dataDir = path.join(process.cwd(), 'data');
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
});

async function loadJsonForEntity(filename) {
  const filePath = path.join(dataDir, filename);
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
    const key = `json:data/${filename}`;
    const result = await pool.query('SELECT value FROM app_state WHERE key = $1 LIMIT 1', [key]);
    return result.rows[0]?.value ?? null;
  }
}

async function runEntity(name, importer) {
  if (onlyFilter && !onlyFilter.has(name)) return;
  console.log(`→ ${name}`);
  const data = await loadJsonForEntity(`${name}.json`);
  if (data == null) {
    console.log(`  (no source data, skipping)`);
    return;
  }
  const count = await importer(data);
  console.log(`  imported ${count} row(s)`);
}

async function upsertHistory(entries) {
  if (!Array.isArray(entries)) return 0;
  for (const entry of entries) {
    if (!entry?.id) continue;
    await pool.query(
      `INSERT INTO history_entries (
        id, share_id, reference_number, template_id, template_name, category, organization_id,
        generated_by, generated_at, share_url, share_password, preview_html, document_data,
        editor_state, collaboration_comments, access_events, managed_files, version_snapshots,
        delivery_history, full_record, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), $10, $11, $12,
        $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb,
        $19::jsonb, $20::jsonb, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        full_record = EXCLUDED.full_record,
        updated_at = NOW()`,
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
  return entries.length;
}

async function upsertFileTransfers(rows) {
  if (!Array.isArray(rows)) return 0;
  for (const t of rows) {
    if (!t?.id) continue;
    await pool.query(
      `INSERT INTO file_transfers (
        id, share_id, share_url, public_open_url, title, file_name, mime_type, data_url,
        encrypted_payload, encryption_enabled, encryption_algorithm, size_in_bytes, notes,
        folder_id, folder_name, locker_id, locker_name, directory_visibility, directory_category,
        directory_tags, auth_mode, access_password, file_access_password, secure_password,
        parser_password, recipient_email, max_downloads, expires_at, uploaded_by, uploaded_by_user_id,
        organization_id, organization_name, thumbnail_url, open_count, download_count, view_count,
        last_opened_at, last_downloaded_at, access_events, liked_by, likes_count, comments,
        comments_count, featured, featured_plan, featured_at, featured_until, featured_order_id,
        revoked_at, full_record, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20::jsonb, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39::jsonb, $40::jsonb, $41, $42::jsonb, $43, $44, $45, $46, $47, $48, $49,
        $50::jsonb, COALESCE($51::timestamptz, NOW()), COALESCE($52::timestamptz, NOW())
      )
      ON CONFLICT (id) DO UPDATE SET full_record = EXCLUDED.full_record, updated_at = NOW()`,
      [
        t.id, t.shareId || null, t.shareUrl || null, t.publicOpenUrl || null,
        t.title || null, t.fileName || null, t.mimeType || null, t.dataUrl || null,
        t.encryptedPayload || null, Boolean(t.encryptionEnabled), t.encryptionAlgorithm || null,
        t.sizeInBytes ?? null, t.notes || null, t.folderId || null, t.folderName || null,
        t.lockerId || null, t.lockerName || null, t.directoryVisibility || null,
        t.directoryCategory || null, JSON.stringify(t.directoryTags || []),
        t.authMode || null, t.accessPassword || null, t.fileAccessPassword || null,
        t.securePassword || null, t.parserPassword || null, t.recipientEmail || null,
        t.maxDownloads ?? null, t.expiresAt || null, t.uploadedBy || null,
        t.uploadedByUserId || null, t.organizationId || null, t.organizationName || null,
        t.thumbnailUrl || null, Number(t.openCount ?? 0), Number(t.downloadCount ?? 0),
        Number(t.viewCount ?? 0), t.lastOpenedAt || null, t.lastDownloadedAt || null,
        JSON.stringify(t.accessEvents || []), JSON.stringify(t.likedBy || []),
        Number(t.likesCount ?? 0), JSON.stringify(t.comments || []),
        Number(t.commentsCount ?? 0), Boolean(t.featured), t.featuredPlan || null,
        t.featuredAt || null, t.featuredUntil || null, t.featuredOrderId || null,
        t.revokedAt || null, JSON.stringify(t), t.createdAt || null, t.updatedAt || null,
      ],
    );
  }
  return rows.length;
}

async function upsertUserProfiles(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return 0;
  let count = 0;
  for (const [userId, profile] of Object.entries(map)) {
    if (!userId || !profile) continue;
    const publicFace = profile.publicFace || {};
    await pool.query(
      `INSERT INTO user_profiles (
        user_id, headline, bio, location, website, avatar_url, banner_url, cover_gradient,
        pronouns, open_to_work, profile_setup_done, onboarding_done, email_verified,
        email_verified_at, docrud_go, docrud_go_purchased_at, public_face_category,
        public_face_approved_at, skills, interests, experience, education, achievements,
        social_links, full_record, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb,
        COALESCE($26::timestamptz, NOW())
      )
      ON CONFLICT (user_id) DO UPDATE SET full_record = EXCLUDED.full_record, updated_at = NOW()`,
      [
        userId, profile.headline || null, profile.bio || null, profile.location || null,
        profile.website || null, profile.avatarUrl || null, profile.bannerUrl || null,
        profile.coverGradient || null, profile.pronouns || null,
        Boolean(profile.openToWork), Boolean(profile.profileSetupDone),
        Boolean(profile.onboardingDone), Boolean(profile.emailVerified),
        profile.emailVerifiedAt || null, Boolean(profile.docrudGo),
        profile.docrudGoPurchasedAt || null, publicFace.category || null,
        publicFace.approvedAt || null,
        JSON.stringify(profile.skills || []), JSON.stringify(profile.interests || []),
        JSON.stringify(profile.experience || []), JSON.stringify(profile.education || []),
        JSON.stringify(profile.achievements || []), JSON.stringify(profile.socialLinks || {}),
        JSON.stringify(profile), profile.updatedAt || null,
      ],
    );
    count += 1;
  }
  return count;
}

async function upsertBillingTransactions(rows) {
  if (!Array.isArray(rows)) return 0;
  for (const t of rows) {
    if (!t?.id) continue;
    await pool.query(
      `INSERT INTO billing_transactions (
        id, user_id, user_email, user_name, organization_id, organization_name, account_type,
        product_type, product_label, plan_id, plan_name, billing_model, quantity, unit_amount_in_paise,
        base_amount_in_paise, gst_rate, gst_amount_in_paise, total_amount_in_paise, amount_in_paise,
        discount_amount_in_paise, coupon_code, referral_code, gstin, currency, status, provider,
        provider_order_id, provider_payment_id, provider_signature, receipt, invoice_number, notes,
        custom_configuration, coupon_redeemed_at, referral_bonus_granted_at, paid_at, full_record,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33::jsonb, $34, $35,
        $36, $37::jsonb, COALESCE($38::timestamptz, NOW()), COALESCE($39::timestamptz, NOW())
      )
      ON CONFLICT (id) DO UPDATE SET full_record = EXCLUDED.full_record, updated_at = NOW()`,
      [
        t.id, t.userId || null, t.userEmail || null, t.userName || null,
        t.organizationId || null, t.organizationName || null, t.accountType || null,
        t.productType || null, t.productLabel || null, t.planId || null, t.planName || null,
        t.billingModel || null, t.quantity ?? null, t.unitAmountInPaise ?? null,
        Number(t.baseAmountInPaise ?? 0), Number(t.gstRate ?? 0),
        Number(t.gstAmountInPaise ?? 0), Number(t.totalAmountInPaise ?? 0),
        Number(t.amountInPaise ?? 0), t.discountAmountInPaise ?? null,
        t.couponCode || null, t.referralCode || null, t.gstin || null,
        t.currency || 'INR', t.status || 'created', t.provider || 'razorpay',
        t.providerOrderId || null, t.providerPaymentId || null, t.providerSignature || null,
        t.receipt || null, t.invoiceNumber || null, t.notes || null,
        t.customConfiguration ? JSON.stringify(t.customConfiguration) : null,
        t.couponRedeemedAt || null, t.referralBonusGrantedAt || null, t.paidAt || null,
        JSON.stringify(t), t.createdAt || null, t.updatedAt || null,
      ],
    );
  }
  return rows.length;
}

async function upsertEmailOutbox(state) {
  const events = Array.isArray(state?.events) ? state.events : Array.isArray(state) ? state : [];
  for (const ev of events) {
    if (!ev?.id) continue;
    const tracking = ev.tracking || {};
    await pool.query(
      `INSERT INTO email_outbox (
        id, status, type, recipient, cc, bcc, subject, message_id, sent_at, sent_by, error,
        opens, clicks, last_opened_at, last_clicked_at, metadata, full_record, created_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16::jsonb, $17::jsonb, COALESCE($18::timestamptz, NOW())
      )
      ON CONFLICT (id) DO UPDATE SET full_record = EXCLUDED.full_record`,
      [
        ev.id, ev.status || 'queued', ev.type || 'system', ev.to,
        JSON.stringify(ev.cc || []), JSON.stringify(ev.bcc || []),
        ev.subject || '', ev.messageId || null, ev.sentAt || null, ev.sentBy || null,
        ev.error || null, Number(tracking.opens || 0), Number(tracking.clicks || 0),
        tracking.lastOpenedAt || null, tracking.lastClickedAt || null,
        JSON.stringify(ev.metadata || {}), JSON.stringify(ev), ev.createdAt || null,
      ],
    );
  }
  return events.length;
}

async function upsertUsers(rows) {
  if (!Array.isArray(rows)) return 0;
  let count = 0;
  for (const u of rows) {
    if (!u?.id) continue;
    await pool.query(
      `INSERT INTO users (
        id, email, name, role, permissions, organization_id, password_hash, password_salt,
        profile, is_active, created_at, last_login, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10,
        COALESCE($11::timestamptz, NOW()), $12::timestamptz, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
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
        u.id, String(u.email || '').toLowerCase(), u.name || '', u.role || 'individual',
        JSON.stringify(u.permissions || []), u.organizationId || null,
        u.passwordHash || null, u.passwordSalt || null, JSON.stringify(u),
        Boolean(u.isActive ?? true), u.createdAt || null, u.lastLogin || null,
      ],
    );
    count += 1;
  }
  return count;
}

async function upsertServiceReviews(rows) {
  if (!Array.isArray(rows)) return 0;
  for (const r of rows) {
    if (!r?.id) continue;
    await pool.query(
      `INSERT INTO service_reviews (
        id, service_id, service_user_id, booking_id, reviewer_id, reviewer_name,
        reviewer_avatar, rating, headline, body, testimonial, full_record, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
        COALESCE($13::timestamptz, NOW()), COALESCE($14::timestamptz, NOW())
      )
      ON CONFLICT (id) DO UPDATE SET full_record = EXCLUDED.full_record, updated_at = NOW()`,
      [
        r.id, r.serviceId, r.serviceUserId, r.bookingId, r.reviewerId, r.reviewerName,
        r.reviewerAvatar || null, Number(r.rating || 0), r.headline, r.body,
        r.testimonial || null, JSON.stringify(r), r.createdAt || null, r.updatedAt || null,
      ],
    );
  }
  return rows.length;
}

async function upsertTemplateMarketplaceItems(rows) {
  if (!Array.isArray(rows)) return 0;
  for (const it of rows) {
    if (!it?.id) continue;
    await pool.query(
      `INSERT INTO template_marketplace_items (
        id, template_snapshot, seller_user_id, seller_name, seller_email, price_in_paise,
        currency, tags, status, example_data, preview_image_data_urls, preview_render_version,
        purchase_count, open_count, full_record, created_at, updated_at
      ) VALUES (
        $1, $2::jsonb, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11::jsonb,
        $12, $13, $14, $15::jsonb, COALESCE($16::timestamptz, NOW()), COALESCE($17::timestamptz, NOW())
      )
      ON CONFLICT (id) DO UPDATE SET full_record = EXCLUDED.full_record, updated_at = NOW()`,
      [
        it.id, JSON.stringify(it.templateSnapshot || {}), it.sellerUserId,
        it.sellerName || null, it.sellerEmail || null, Number(it.priceInPaise ?? 0),
        it.currency || 'INR', JSON.stringify(it.tags || []), it.status || 'pending',
        JSON.stringify(it.exampleData || {}), JSON.stringify(it.previewImageDataUrls || []),
        Number(it.previewRenderVersion ?? 0), Number(it.purchaseCount ?? 0),
        Number(it.openCount ?? 0), JSON.stringify(it),
        it.createdAt || null, it.updatedAt || null,
      ],
    );
  }
  return rows.length;
}

async function upsertDocwordDocuments(rows) {
  if (!Array.isArray(rows)) return 0;
  for (const d of rows) {
    if (!d?.id) continue;
    await pool.query(
      `INSERT INTO docword_documents (
        id, owner_user_id, owner_email, guest_id, title, emoji, folder_name, template_id,
        document_theme, share_token, share_mode, word_count, read_time_minutes, is_favorite,
        require_signature, track_changes_enabled, html, plain_text, full_record,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19::jsonb, COALESCE($20::timestamptz, NOW()), COALESCE($21::timestamptz, NOW())
      )
      ON CONFLICT (id) DO UPDATE SET full_record = EXCLUDED.full_record, updated_at = NOW()`,
      [
        d.id, d.ownerUserId || null, d.ownerEmail || null, d.guestId || null,
        d.title || 'Untitled document', d.emoji || null, d.folderName || null,
        d.templateId || null, d.documentTheme || null, d.shareToken || null,
        d.shareMode || 'private', Number(d.wordCount ?? 0), Number(d.readTimeMinutes ?? 0),
        Boolean(d.isFavorite), Boolean(d.requireSignature), Boolean(d.trackChangesEnabled),
        d.html || '', d.plainText || '', JSON.stringify(d),
        d.createdAt || null, d.updatedAt || null,
      ],
    );
  }
  return rows.length;
}

try {
  await runEntity('users', upsertUsers);
  await runEntity('history', upsertHistory);
  await runEntity('file-transfers', upsertFileTransfers);
  await runEntity('user-profiles', upsertUserProfiles);
  await runEntity('billing-transactions', upsertBillingTransactions);
  await runEntity('email-outbox', upsertEmailOutbox);
  await runEntity('docword-documents', upsertDocwordDocuments);
  await runEntity('service-reviews', upsertServiceReviews);
  await runEntity('template-marketplace-items', upsertTemplateMarketplaceItems);
  console.log('Migration complete.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
