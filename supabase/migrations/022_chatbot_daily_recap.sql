-- ============================================================
-- Récap quotidien chatbot Telegram
-- - Ajoute opt-in par utilisateur (receive_recap)
-- - Le cron Supabase est à activer manuellement (voir bas du fichier)
-- ============================================================

ALTER TABLE chatbot_users
  ADD COLUMN IF NOT EXISTS receive_recap BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chatbot_users_recap ON chatbot_users(receive_recap)
  WHERE receive_recap = TRUE;

-- ============================================================
-- À exécuter manuellement dans le SQL Editor (une fois) pour activer
-- le déclenchement quotidien à 17:00 UTC (= 18:00 heure du Maroc) :
-- ============================================================
-- (Pré-requis : extension pg_cron + pg_net activées dans Database > Extensions)
--
-- SELECT cron.schedule(
--   'daily-harvest-recap',
--   '0 17 * * *',                                  -- chaque jour 17:00 UTC
--   $$
--   SELECT net.http_post(
--     url     := 'https://<projet>.supabase.co/functions/v1/daily-recap',
--     headers := jsonb_build_object(
--                  'Content-Type', 'application/json',
--                  'Authorization', 'Bearer ' || (SELECT current_setting('app.service_role_key'))
--                )
--   );
--   $$
-- );
--
-- (Alternative plus simple si tu n'as pas configuré app.service_role_key :
--  remplace la jsonb_build_object par la valeur littérale "Bearer eyJ..." mais
--  ATTENTION : ne committe JAMAIS ta service_role_key dans Git.)
--
-- Pour annuler / lister :
--   SELECT cron.unschedule('daily-harvest-recap');
--   SELECT * FROM cron.job;
-- ============================================================
