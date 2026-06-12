CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,
  industry TEXT,
  company_size TEXT,
  workspace_preset TEXT,
  support_email TEXT,
  support_phone TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  password_hash TEXT,
  password_salt TEXT,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users (organization_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at DESC);

CREATE TABLE IF NOT EXISTS role_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  created_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  template_html TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_organization_id ON templates (organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates (category);

CREATE TABLE IF NOT EXISTS history_entries (
  id TEXT PRIMARY KEY,
  share_id TEXT UNIQUE,
  reference_number TEXT,
  template_id TEXT,
  template_name TEXT,
  category TEXT,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  generated_by TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  share_url TEXT,
  share_password TEXT,
  preview_html TEXT,
  document_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  editor_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  collaboration_comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  managed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  version_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  full_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_entries_template_id ON history_entries (template_id);
CREATE INDEX IF NOT EXISTS idx_history_entries_organization_id ON history_entries (organization_id);
CREATE INDEX IF NOT EXISTS idx_history_entries_generated_at ON history_entries (generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_entries_generated_by ON history_entries (generated_by);
CREATE INDEX IF NOT EXISTS idx_history_entries_share_id ON history_entries (share_id) WHERE share_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS settings_store (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS dropdown_options (
  id BIGSERIAL PRIMARY KEY,
  field_key TEXT NOT NULL UNIQUE,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  billing_model TEXT NOT NULL,
  price_label TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signatures (
  id TEXT PRIMARY KEY,
  signer_name TEXT NOT NULL,
  signer_role TEXT,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  signature_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  message TEXT,
  request_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_base_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  query TEXT NOT NULL,
  category TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentiment JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_by TEXT,
  published_by_user_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_entries_category ON knowledge_base_entries (category);
CREATE INDEX IF NOT EXISTS idx_kb_entries_created_at ON knowledge_base_entries (created_at DESC);

-- Resume / Talent directory (optional when Postgres is configured; otherwise file-store fallback is used)
CREATE TABLE IF NOT EXISTS resume_directory_entries (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_file_name TEXT,
  avatar_mime_type TEXT,
  avatar_data_url TEXT,
  headline TEXT,
  location TEXT,
  category TEXT NOT NULL,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  resume_text TEXT NOT NULL,
  resume_file_name TEXT,
  resume_mime_type TEXT,
  resume_data_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_linkedin TEXT,
  contact_website TEXT,
  contact_visibility TEXT NOT NULL DEFAULT 'members',
  visibility TEXT NOT NULL DEFAULT 'public',
  view_count INTEGER NOT NULL DEFAULT 0,
  contact_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_directory_category ON resume_directory_entries (category);
CREATE INDEX IF NOT EXISTS idx_resume_directory_updated_at ON resume_directory_entries (updated_at DESC);

CREATE TABLE IF NOT EXISTS resume_connect_purchases (
  id TEXT PRIMARY KEY,
  buyer_user_id TEXT NOT NULL,
  product_mode TEXT NOT NULL,
  resume_id TEXT,
  resume_slug TEXT,
  amount_in_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  credits_granted INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_connect_buyer ON resume_connect_purchases (buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_resume_connect_order ON resume_connect_purchases (razorpay_order_id);

CREATE TABLE IF NOT EXISTS gig_connect_purchases (
  id TEXT PRIMARY KEY,
  buyer_user_id TEXT NOT NULL,
  product_mode TEXT NOT NULL,
  amount_in_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  credits_granted INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gig_connect_buyer ON gig_connect_purchases (buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_gig_connect_order ON gig_connect_purchases (razorpay_order_id);

CREATE TABLE IF NOT EXISTS resume_connect_leads (
  id TEXT PRIMARY KEY,
  buyer_user_id TEXT NOT NULL,
  resume_id TEXT NOT NULL,
  resume_slug TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  candidate_headline TEXT,
  candidate_location TEXT,
  candidate_category TEXT,
  candidate_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidate_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidate_summary TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_linkedin TEXT,
  contact_website TEXT,
  jd_text TEXT,
  match_score INTEGER,
  compatibility_score INTEGER,
  ai_score INTEGER,
  match_provider TEXT,
  match_rationale TEXT,
  matched_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  connect_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (buyer_user_id, resume_id)
);

CREATE INDEX IF NOT EXISTS idx_resume_leads_buyer ON resume_connect_leads (buyer_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_leads_status ON resume_connect_leads (buyer_user_id, status);

ALTER TABLE resume_connect_leads ADD COLUMN IF NOT EXISTS compatibility_score INTEGER;
ALTER TABLE resume_connect_leads ADD COLUMN IF NOT EXISTS ai_score INTEGER;

CREATE TABLE IF NOT EXISTS web_sources (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  label TEXT,
  category TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  content_text TEXT NOT NULL,
  content_hash TEXT,
  owner_user_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_sources_owner ON web_sources (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_web_sources_fetched_at ON web_sources (fetched_at DESC);

CREATE TABLE IF NOT EXISTS service_reviews (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  service_user_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_avatar TEXT,
  rating INTEGER NOT NULL,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  testimonial TEXT,
  full_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_reviews_service ON service_reviews (service_id);
CREATE INDEX IF NOT EXISTS idx_service_reviews_provider ON service_reviews (service_user_id);
CREATE INDEX IF NOT EXISTS idx_service_reviews_booking ON service_reviews (booking_id);
CREATE INDEX IF NOT EXISTS idx_service_reviews_created_at ON service_reviews (created_at DESC);

CREATE TABLE IF NOT EXISTS template_marketplace_items (
  id TEXT PRIMARY KEY,
  template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  seller_user_id TEXT NOT NULL,
  seller_name TEXT,
  seller_email TEXT,
  price_in_paise INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  example_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_image_data_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  preview_render_version INTEGER NOT NULL DEFAULT 0,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  full_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_marketplace_items_seller ON template_marketplace_items (seller_user_id);
CREATE INDEX IF NOT EXISTS idx_template_marketplace_items_status ON template_marketplace_items (status);
CREATE INDEX IF NOT EXISTS idx_template_marketplace_items_created_at ON template_marketplace_items (created_at DESC);

CREATE TABLE IF NOT EXISTS file_transfers (
  id TEXT PRIMARY KEY,
  share_id TEXT,
  share_url TEXT,
  public_open_url TEXT,
  title TEXT,
  file_name TEXT,
  mime_type TEXT,
  data_url TEXT,
  encrypted_payload TEXT,
  encryption_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  encryption_algorithm TEXT,
  size_in_bytes BIGINT,
  notes TEXT,
  folder_id TEXT,
  folder_name TEXT,
  locker_id TEXT,
  locker_name TEXT,
  directory_visibility TEXT,
  directory_category TEXT,
  directory_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  auth_mode TEXT,
  access_password TEXT,
  file_access_password TEXT,
  secure_password TEXT,
  parser_password TEXT,
  recipient_email TEXT,
  max_downloads INTEGER,
  expires_at TIMESTAMPTZ,
  uploaded_by TEXT,
  uploaded_by_user_id TEXT,
  organization_id TEXT,
  organization_name TEXT,
  thumbnail_url TEXT,
  open_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  last_downloaded_at TIMESTAMPTZ,
  access_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  liked_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  comments_count INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_plan TEXT,
  featured_at TIMESTAMPTZ,
  featured_until TIMESTAMPTZ,
  featured_order_id TEXT,
  revoked_at TIMESTAMPTZ,
  full_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_transfers_uploader ON file_transfers (uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_file_transfers_uploaded_by_lower ON file_transfers (LOWER(uploaded_by));
CREATE INDEX IF NOT EXISTS idx_file_transfers_organization_id ON file_transfers (organization_id);
CREATE INDEX IF NOT EXISTS idx_file_transfers_visibility ON file_transfers (directory_visibility);
CREATE INDEX IF NOT EXISTS idx_file_transfers_created_at ON file_transfers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_transfers_share_id ON file_transfers (share_id);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  headline TEXT,
  bio TEXT,
  location TEXT,
  website TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  cover_gradient TEXT,
  pronouns TEXT,
  open_to_work BOOLEAN NOT NULL DEFAULT FALSE,
  profile_setup_done BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_done BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  docrud_go BOOLEAN NOT NULL DEFAULT FALSE,
  docrud_go_purchased_at TIMESTAMPTZ,
  public_face_category TEXT,
  public_face_approved_at TIMESTAMPTZ,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  interests JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience JSONB NOT NULL DEFAULT '[]'::jsonb,
  education JSONB NOT NULL DEFAULT '[]'::jsonb,
  achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_public_face ON user_profiles (public_face_category);
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles (updated_at DESC);

CREATE TABLE IF NOT EXISTS billing_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_email TEXT,
  user_name TEXT,
  organization_id TEXT,
  organization_name TEXT,
  account_type TEXT,
  product_type TEXT,
  product_label TEXT,
  plan_id TEXT,
  plan_name TEXT,
  billing_model TEXT,
  quantity INTEGER,
  unit_amount_in_paise INTEGER,
  base_amount_in_paise INTEGER NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  gst_amount_in_paise INTEGER NOT NULL DEFAULT 0,
  total_amount_in_paise INTEGER NOT NULL DEFAULT 0,
  amount_in_paise INTEGER NOT NULL DEFAULT 0,
  discount_amount_in_paise INTEGER,
  coupon_code TEXT,
  referral_code TEXT,
  gstin TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created',
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT,
  provider_payment_id TEXT,
  provider_signature TEXT,
  receipt TEXT,
  invoice_number TEXT,
  notes TEXT,
  custom_configuration JSONB,
  coupon_redeemed_at TIMESTAMPTZ,
  referral_bonus_granted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  full_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_transactions_user ON billing_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_user_email ON billing_transactions (user_email);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_order ON billing_transactions (provider_order_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_status ON billing_transactions (status);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_created_at ON billing_transactions (created_at DESC);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  type TEXT NOT NULL DEFAULT 'system',
  recipient TEXT NOT NULL,
  cc JSONB NOT NULL DEFAULT '[]'::jsonb,
  bcc JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject TEXT NOT NULL DEFAULT '',
  message_id TEXT,
  sent_at TIMESTAMPTZ,
  sent_by TEXT,
  error TEXT,
  opens INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_created_at ON email_outbox (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_recipient ON email_outbox (recipient);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox (status);

CREATE TABLE IF NOT EXISTS docword_documents (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  owner_email TEXT,
  guest_id TEXT,
  title TEXT NOT NULL DEFAULT 'Untitled document',
  emoji TEXT,
  folder_name TEXT,
  template_id TEXT,
  document_theme TEXT,
  share_token TEXT UNIQUE,
  share_mode TEXT NOT NULL DEFAULT 'private',
  word_count INTEGER NOT NULL DEFAULT 0,
  read_time_minutes INTEGER NOT NULL DEFAULT 0,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  require_signature BOOLEAN NOT NULL DEFAULT FALSE,
  track_changes_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  html TEXT NOT NULL DEFAULT '',
  plain_text TEXT NOT NULL DEFAULT '',
  full_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docword_documents_owner ON docword_documents (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_docword_documents_owner_email ON docword_documents (owner_email);
CREATE INDEX IF NOT EXISTS idx_docword_documents_guest ON docword_documents (guest_id);
CREATE INDEX IF NOT EXISTS idx_docword_documents_updated_at ON docword_documents (updated_at DESC);

CREATE TABLE IF NOT EXISTS template_marketplace_withdrawals (
  id TEXT PRIMARY KEY,
  seller_user_id TEXT NOT NULL,
  seller_email TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  amount_in_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  payout_method_label TEXT NOT NULL,
  payout_method_details TEXT NOT NULL,
  admin_note TEXT,
  transaction_ref TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_withdrawals_seller ON template_marketplace_withdrawals (seller_user_id);
CREATE INDEX IF NOT EXISTS idx_template_withdrawals_status ON template_marketplace_withdrawals (status);

-- ── Conversations & Messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  request_from TEXT,
  source TEXT,
  last_message JSONB,
  unread_count JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations USING GIN (participants);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text',
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_size INTEGER,
  attachment_mime_type TEXT,
  reply_to JSONB,
  seen_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  edited BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages (sender_id);

CREATE TABLE IF NOT EXISTS conversation_meta (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  label TEXT,
  label_color TEXT,
  bg_color TEXT,
  notes TEXT,
  pinned_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_bookmarks (
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  PRIMARY KEY (user_id, conversation_id, message_id)
);

CREATE TABLE IF NOT EXISTS auto_reply_settings (
  user_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL DEFAULT '',
  cooldown_minutes INTEGER NOT NULL DEFAULT 30,
  last_sent_at JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quick_replies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_user ON quick_replies (user_id);

CREATE TABLE IF NOT EXISTS business_profiles (
  user_id TEXT PRIMARY KEY,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Social Events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_avatar TEXT,
  actor_headline TEXT,
  target_user_id TEXT NOT NULL,
  resource_id TEXT,
  resource_title TEXT,
  excerpt TEXT,
  href TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_events_target ON social_events (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_events_actor ON social_events (actor_id);

-- ── Notification Read State ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_reads (
  user_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads (user_id);

-- ── Credits & Transactions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_longest INTEGER NOT NULL DEFAULT 0,
  streak_last_post_date TEXT,
  streak_start_date TEXT,
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  daily_earn_log JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_credits(user_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions (user_id, created_at DESC);

-- ── User Follows ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_follows (
  follower_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_target ON user_follows (target_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows (follower_id);

-- ── Business Pages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  industry TEXT NOT NULL DEFAULT 'technology',
  company_size TEXT,
  founded_year INTEGER,
  website TEXT,
  logo_url TEXT,
  cover_url TEXT,
  location TEXT,
  city TEXT,
  country TEXT,
  phone TEXT,
  email TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  follower_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  job_count INTEGER NOT NULL DEFAULT 0,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_pages_owner ON business_pages (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_business_pages_industry ON business_pages (industry);
CREATE INDEX IF NOT EXISTS idx_business_pages_status ON business_pages (status);
CREATE INDEX IF NOT EXISTS idx_business_pages_created_at ON business_pages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_pages_follower_count ON business_pages (follower_count DESC);

CREATE TABLE IF NOT EXISTS business_page_followers (
  page_id TEXT NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (page_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bp_followers_user ON business_page_followers (user_id);

CREATE TABLE IF NOT EXISTS business_page_posts (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  post_type TEXT NOT NULL DEFAULT 'update',
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  liked_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_posts_page ON business_page_posts (page_id, created_at DESC);

CREATE TABLE IF NOT EXISTS business_page_jobs (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT,
  job_type TEXT NOT NULL DEFAULT 'full_time',
  experience_level TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT NOT NULL DEFAULT 'INR',
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  apply_url TEXT,
  application_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_jobs_page ON business_page_jobs (page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bp_jobs_status ON business_page_jobs (status);

CREATE TABLE IF NOT EXISTS business_page_products (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price TEXT,
  category TEXT,
  image_url TEXT,
  product_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_products_page ON business_page_products (page_id);

CREATE TABLE IF NOT EXISTS business_page_events (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'webinar',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  location TEXT,
  is_online BOOLEAN NOT NULL DEFAULT TRUE,
  registration_url TEXT,
  cover_url TEXT,
  attendee_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_events_page ON business_page_events (page_id, start_at DESC);

CREATE TABLE IF NOT EXISTS business_verifications (
  id TEXT PRIMARY KEY,
  business_page_id TEXT NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  -- vital business info submitted by owner
  legal_name TEXT NOT NULL,
  business_type TEXT NOT NULL,  -- 'pvt_ltd','llp','partnership','proprietorship','public_ltd','ngo','other'
  registration_number TEXT NOT NULL,
  gstin TEXT,
  pan TEXT NOT NULL,
  registered_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  website TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  years_in_business TEXT,
  employee_count TEXT,
  annual_revenue TEXT,
  business_category TEXT,
  -- admin fields
  admin_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_verif_page ON business_verifications (business_page_id);
CREATE INDEX IF NOT EXISTS idx_biz_verif_owner ON business_verifications (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_biz_verif_status ON business_verifications (status);

-- ── Business Page Employee Invites ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_page_invites (
  id TEXT PRIMARY KEY,
  business_page_id TEXT NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  label TEXT,
  max_uses INTEGER DEFAULT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_invites_page     ON business_page_invites (business_page_id);
CREATE INDEX IF NOT EXISTS idx_bp_invites_token    ON business_page_invites (token);

-- ── Business Page Members (employees) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_page_members (
  id TEXT PRIMARY KEY,
  business_page_id TEXT NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  title TEXT,
  department TEXT,
  invite_id TEXT REFERENCES business_page_invites(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_page_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bp_members_page    ON business_page_members (business_page_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_bp_members_user    ON business_page_members (user_id);
