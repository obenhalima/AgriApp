-- ============================================================
-- Migration 064 — Référentiel « catégories d'achat » (paramétrage)
--
-- La liste des catégories d'achat était codée en dur (app/achats/page.tsx).
-- On la bascule dans le no-code. Codes IDENTIQUES à l'existant pour ne PAS
-- casser le pont achats→coûts (map_purchase_cat_to_account_code, migration
-- 060) qui mappe ces codes vers le plan comptable.
--
-- NB : distinct de « supplier_category » (domaine d'activité du fournisseur).
-- Ici c'est la catégorie de COÛT de l'achat.
-- ============================================================

SET search_path = public;

INSERT INTO public.reference_lists (key, label, description) VALUES
  ('purchase_category', 'Catégories d''achat', 'Catégorie de coût d''un bon d''achat (/achats). Alimente le rattachement au plan comptable.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.reference_values (list_key, code, label, order_idx, is_default) VALUES
  ('purchase_category', 'semences',        'Semences',        1, true),
  ('purchase_category', 'engrais',         'Engrais',         2, false),
  ('purchase_category', 'phytosanitaires', 'Phytosanitaires', 3, false),
  ('purchase_category', 'irrigation',      'Irrigation',      4, false),
  ('purchase_category', 'emballage',       'Emballage',       5, false),
  ('purchase_category', 'transport',       'Transport',       6, false),
  ('purchase_category', 'energie',         'Énergie',         7, false),
  ('purchase_category', 'services',        'Services',        8, false),
  ('purchase_category', 'equipement',      'Équipement',      9, false),
  ('purchase_category', 'divers',          'Divers',          10, false)
ON CONFLICT (list_key, code) DO NOTHING;
