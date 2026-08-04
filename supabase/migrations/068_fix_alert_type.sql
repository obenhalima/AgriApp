-- ============================================================
-- Migration 068 — Corrige alert_type (bug : 'no_harvest' invalide)
--
-- Le code crée des alertes type='no_harvest' (journée sans récolte, web + bot),
-- mais l'ENUM alert_type ne contenait pas cette valeur → l'INSERT échouait et
-- la requête `type=eq.no_harvest` renvoyait 400.
--
-- Fix : relâcher alerts.type en VARCHAR (même pattern que 050/066). Souple et
-- pérenne pour tout type d'alerte généré par l'app.
-- ============================================================

SET search_path = public;

DO $$ BEGIN
  ALTER TABLE alerts ALTER COLUMN type TYPE VARCHAR(40) USING type::text;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'alerts.type déjà VARCHAR ou skip : %', SQLERRM;
END $$;

COMMENT ON COLUMN alerts.type IS
  'Type d''alerte (VARCHAR souple). Valeurs app : facture_retard, stock_faible, no_harvest, production_faible, prix_bas, autre…';
