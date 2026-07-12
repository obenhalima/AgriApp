-- ============================================================
-- Migration 061 — Mètres linéaires de culture (productivité MO)
--
-- Ajoute le métrage linéaire de chaque plantation : dénominateur des
-- indicateurs de productivité au mètre linéaire (kg/ml, coût/ml, coût MO/ml).
--
-- Le mètre linéaire = nb de rangs × longueur des rangs, OU surface ÷
-- écartement inter-rangs. Il varie selon la culture/variété (tomate vs
-- concombre…), d'où le rattachement à la PLANTATION plutôt qu'à la serre.
-- Saisi manuellement (aucune donnée existante ne permet de le dériver).
-- ============================================================

SET search_path = public;

ALTER TABLE public.campaign_plantings
  ADD COLUMN IF NOT EXISTS linear_meters DECIMAL(10, 2);

COMMENT ON COLUMN public.campaign_plantings.linear_meters IS
  'Mètres linéaires de culture (nb rangs × longueur, ou surface ÷ écartement). Dénominateur de la productivité au mètre linéaire.';
