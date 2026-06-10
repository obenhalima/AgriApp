-- ============================================================
-- Migration 053 — Paramètres métier · No-Code P3b
--
-- app_settings clé 'business_params' :
--   • seasonal_coefficients : coefficient prix par mois (1-12)
--   • freinte/écart par défaut (export & local) pré-remplis au tri
--   • bornes min/max de freinte et écart
--
-- Utilisés par : générateur de chaîne commerciale + modal de tri (/recoltes).
-- ============================================================

INSERT INTO app_settings (key, value, description)
VALUES (
  'business_params',
  jsonb_build_object(
    -- Coefficient saisonnier des prix (1 = neutre). Index 1-12 = janvier-décembre.
    'seasonal_coefficients', jsonb_build_object(
      '1', 1.20, '2', 1.20, '3', 1.05, '4', 1.05,
      '5', 0.85, '6', 0.85, '7', 1.00, '8', 1.00,
      '9', 1.00, '10', 1.00, '11', 1.05, '12', 1.20
    ),
    -- Freinte (perte physique détruite) par défaut, en %
    'default_freinte_export', 2.0,
    'default_freinte_local', 1.5,
    -- Écart (vendable au client écart) par défaut, en %
    'default_ecart_export', 3.5,
    'default_ecart_local', 2.5,
    -- Bornes de validation
    'freinte_max_pct', 5.0,
    'ecart_max_pct', 8.0
  ),
  'Paramètres métier : coefficients saisonniers des prix + freinte/écart par défaut au tri'
)
ON CONFLICT (key) DO NOTHING;
