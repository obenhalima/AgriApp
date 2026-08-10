-- ============================================================
-- Migration 070 — Destinations d'écart paramétrables (no-code)
--
-- Retour test : « Rendre les destinations écart paramétrables (ajout référentiel) ».
--
-- Aujourd'hui les destinations du rejet de tri sont figées dans un CHECK
-- (destruction, retour_stock, vente_industrie, dons, vente_ecart) et en dur
-- dans le modal de tri. On les bascule en référentiel no-code
-- (reference_lists / reference_values) pour que l'admin puisse en ajouter.
--
-- ⚠️ Deux destinations portent une LOGIQUE métier :
--     • vente_ecart  → crée un dispatch enfant vers le marché écart (RPC)
--     • retour_stock → crée un lot stock ré-envoyable
--   On encode ce comportement dans metadata.behavior. Toute NOUVELLE
--   destination ajoutée par l'admin aura behavior='none' → elle est
--   simplement enregistrée (perte sèche / informative), comme
--   destruction / vente_industrie / dons aujourd'hui.
--
-- Étapes :
--   1. Élargir harvest_lots.destination_rejet (VARCHAR 20 → 40) pour les codes custom.
--   2. Supprimer le CHECK figé (chk_destination_rejet) → valeurs libres.
--   3. Seed du référentiel + valeurs (couleur, icône, behavior, description).
-- ============================================================

SET search_path = public;

-- 1. Colonne plus large (codes personnalisés)
ALTER TABLE harvest_lots
  ALTER COLUMN destination_rejet TYPE VARCHAR(40);

-- 2. Le CHECK figé n'a plus lieu d'être (les valeurs viennent du référentiel)
ALTER TABLE harvest_lots
  DROP CONSTRAINT IF EXISTS chk_destination_rejet;

COMMENT ON COLUMN harvest_lots.destination_rejet IS
'Destination des écarts du tri (référentiel no-code « destination_rejet »).
 metadata.behavior pilote la logique : vente_ecart (dispatch écart auto),
 retour_stock (lot ré-envoyable), none (enregistré, sans effet de bord).';

-- 3. Référentiel + valeurs
INSERT INTO reference_lists (key, label, description) VALUES
  ('destination_rejet', 'Destinations d''écart (tri)',
   'Que faire des écarts refusés au tri station. « Vente client écart » et « Retour au stock » déclenchent une logique dédiée (metadata.behavior) ; les autres sont enregistrées sans effet de bord.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO reference_values (list_key, code, label, color, icon, metadata, order_idx, is_default) VALUES
  ('destination_rejet', 'vente_ecart',     'Vente client écart', '#3b82f6', '🤝',
     '{"behavior": "vente_ecart", "desc": "Le client écart configuré passe récupérer (recommandé)"}', 1, true),
  ('destination_rejet', 'retour_stock',    'Retour au stock',    '#10b981', '🔄',
     '{"behavior": "retour_stock", "desc": "Ré-envoi possible vers un autre marché"}', 2, false),
  ('destination_rejet', 'vente_industrie', 'Vente industrie',    '#f59e0b', '🏭',
     '{"behavior": "none", "desc": "Vendu direct prix réduit (transformation, jus)"}', 3, false),
  ('destination_rejet', 'dons',            'Dons',               '#a855f7', '🎁',
     '{"behavior": "none", "desc": "Donné (association, personnel…)"}', 4, false),
  ('destination_rejet', 'destruction',     'Destruction',        '#ef4444', '🗑️',
     '{"behavior": "none", "desc": "Perte sèche — produit non récupérable"}', 5, false)
ON CONFLICT (list_key, code) DO NOTHING;
