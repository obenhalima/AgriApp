-- ============================================================
-- Migration 035 — Bot Telegram : Darija marocaine par défaut
--
-- Contexte : les ouvriers du Domaine BENHALIMA communiquent
-- naturellement en Darija. On passe le bot en Darija par défaut
-- (au lieu de Français) et on bascule les comptes existants.
--
-- Langues supportées par le bot (VARCHAR(8)) :
--   - 'fr'     : Français
--   - 'darija' : Darija marocaine (Arabizi, script latin)
--   - 'ar'     : Arabe classique (الفصحى)
--   - 'en'     : English
-- ============================================================

-- 1. Élargir la colonne language (5 → 8 chars pour 'darija')
ALTER TABLE chatbot_users
  ALTER COLUMN language TYPE VARCHAR(8);

-- 2. Nouveau défaut : darija (au lieu de fr)
ALTER TABLE chatbot_users
  ALTER COLUMN language SET DEFAULT 'darija';

-- 3. Bascule tous les comptes actifs en Darija
--    (Décommente la ligne ci-dessous si tu veux migrer aussi
--     les utilisateurs déjà actifs en FR vers la Darija.)
UPDATE chatbot_users
   SET language = 'darija'
 WHERE is_active = true
   AND language IN ('fr', NULL);

-- 4. Commentaire pour traçabilité
COMMENT ON COLUMN chatbot_users.language IS
  'Langue de réponse du bot. Valeurs : fr | darija | ar | en. Défaut : darija (Domaine BENHALIMA).';
