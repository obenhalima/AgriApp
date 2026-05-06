-- ============================================================
-- CHATBOT TELEGRAM — saisie des récoltes par message
-- Scope V1 : récoltes + journées sans récolte (alertes)
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1. Utilisateurs du chatbot (lien worker ↔ canal)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'telegram',  -- 'telegram' | 'whatsapp'
  channel_user_id VARCHAR(50) NOT NULL,             -- chat_id Telegram (string)
  channel_username VARCHAR(100),                    -- @username Telegram si dispo
  language VARCHAR(5) DEFAULT 'fr',                 -- 'fr' | 'ar' | 'en'
  -- Code d'invitation (Admin génère, ouvrier l'envoie via /start <code>)
  enrollment_code VARCHAR(20),
  enrollment_code_expires_at TIMESTAMPTZ,
  -- Etat conversationnel : intent en cours + étape + payload partiel
  -- ex: { intent: 'new_harvest', step: 'ask_qty', planting_id: '...' }
  session_state JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  enrolled_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (channel, channel_user_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_users_worker ON chatbot_users(worker_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_users_chat ON chatbot_users(channel, channel_user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_users_code ON chatbot_users(enrollment_code) WHERE enrollment_code IS NOT NULL;

-- ───────────────────────────────────────────────────────────
-- 2. Journal des messages (audit + debug + analytics)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_user_id UUID REFERENCES chatbot_users(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL,            -- 'in' | 'out'
  content TEXT,
  intent VARCHAR(30),                        -- 'harvest', 'no_harvest', 'help', 'enroll', 'unknown'
  parsed_data JSONB,
  created_harvest_id UUID REFERENCES harvests(id) ON DELETE SET NULL,
  created_alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  raw_update JSONB,                          -- payload Telegram brut pour debug
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_user ON chatbot_messages(chatbot_user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_intent ON chatbot_messages(intent);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created ON chatbot_messages(created_at DESC);

-- ───────────────────────────────────────────────────────────
-- 3. RLS — admin écrit, authentifiés lisent
-- ───────────────────────────────────────────────────────────
ALTER TABLE chatbot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read chatbot_users" ON chatbot_users;
CREATE POLICY "auth read chatbot_users" ON chatbot_users FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin write chatbot_users" ON chatbot_users;
CREATE POLICY "admin write chatbot_users" ON chatbot_users FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "auth read chatbot_messages" ON chatbot_messages;
CREATE POLICY "auth read chatbot_messages" ON chatbot_messages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin write chatbot_messages" ON chatbot_messages;
CREATE POLICY "admin write chatbot_messages" ON chatbot_messages FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- L'Edge Function utilisera le service_role (bypass RLS) pour écrire.

-- ───────────────────────────────────────────────────────────
-- 4. Module + permissions
-- ───────────────────────────────────────────────────────────
INSERT INTO modules (code, label, icon, color, path, section, display_order)
VALUES ('rh_chatbot', 'Chatbot Telegram', '🤖', '#26a5e4', '/rh/chatbot', 'RH', 60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (module_id, action, code)
SELECT m.id, a.action, m.code || '.' || a.action
FROM modules m
CROSS JOIN (
  VALUES ('view'::permission_action), ('create'::permission_action), ('edit'::permission_action), ('delete'::permission_action), ('admin'::permission_action)
) AS a(action)
WHERE m.code = 'rh_chatbot'
ON CONFLICT (code) DO NOTHING;

-- Direction : view
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE FROM roles r, permissions p, modules m
WHERE r.code = 'direction' AND p.module_id = m.id AND m.code = 'rh_chatbot' AND p.action = 'view'
ON CONFLICT (role_id, permission_id) DO NOTHING;
