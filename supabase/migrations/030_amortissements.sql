-- ============================================================
-- AMORTISSEMENTS — actifs immobilisés + génération auto des dotations
--
-- Table assets : registre des immobilisations (constructions, serres,
-- irrigation, équipements…). Chaque actif a un coût d'acquisition,
-- une durée de vie utile et une catégorie comptable (AMT_*).
--
-- Le trigger AFTER INSERT/UPDATE/DELETE sur assets régénère
-- automatiquement les cost_entries (1 par mois jusqu'à fin de vie utile).
-- Imputation : campagne active à la date du mois × serre de l'actif.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Table assets
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) UNIQUE NOT NULL,
  label VARCHAR(255) NOT NULL,
  account_category_id UUID NOT NULL REFERENCES account_categories(id),
  -- Acquisition
  acquisition_date DATE NOT NULL,
  acquisition_cost DECIMAL(12, 2) NOT NULL CHECK (acquisition_cost > 0),
  supplier VARCHAR(255),
  reference_number VARCHAR(100),
  -- Plan d'amortissement
  useful_life_years INTEGER NOT NULL CHECK (useful_life_years > 0),
  depreciation_method VARCHAR(20) NOT NULL DEFAULT 'linear', -- 'linear' | 'degressive' (V2)
  residual_value DECIMAL(12, 2) DEFAULT 0,                   -- valeur résiduelle
  -- Imputation
  farm_id UUID REFERENCES farms(id),
  greenhouse_id UUID REFERENCES greenhouses(id),
  campaign_id UUID REFERENCES campaigns(id),                 -- forcer une campagne (sinon auto)
  -- Cession (sortie de l'actif)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  disposal_date DATE,
  disposal_amount DECIMAL(12, 2),
  -- Métadonnées
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(account_category_id);
CREATE INDEX IF NOT EXISTS idx_assets_farm     ON assets(farm_id);
CREATE INDEX IF NOT EXISTS idx_assets_gh       ON assets(greenhouse_id);
CREATE INDEX IF NOT EXISTS idx_assets_acq_date ON assets(acquisition_date);
CREATE INDEX IF NOT EXISTS idx_assets_active   ON assets(is_active) WHERE is_active = TRUE;

-- ────────────────────────────────────────────────────────────
-- 2. Lien cost_entries → asset (traçabilité)
-- ────────────────────────────────────────────────────────────
ALTER TABLE cost_entries
  ADD COLUMN IF NOT EXISTS source_asset_id UUID REFERENCES assets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cost_entries_asset
  ON cost_entries(source_asset_id) WHERE source_asset_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_assets" ON assets;
CREATE POLICY "auth_read_assets" ON assets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_write_assets" ON assets;
CREATE POLICY "admin_write_assets" ON assets FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 4. Module + permissions
-- ────────────────────────────────────────────────────────────
INSERT INTO modules (code, label, icon, color, path, section, display_order)
VALUES ('amortissements', 'Amortissements', '📐', '#a855f7', '/admin/amortissements', 'PARAMETRAGE', 35)
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (module_id, action, code)
SELECT m.id, a.action, m.code || '.' || a.action
FROM modules m
CROSS JOIN (VALUES ('view'::permission_action), ('create'::permission_action), ('edit'::permission_action), ('delete'::permission_action), ('admin'::permission_action)) AS a(action)
WHERE m.code = 'amortissements'
ON CONFLICT (code) DO NOTHING;

-- Direction + comptable peuvent consulter
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE FROM roles r, permissions p, modules m
WHERE r.code IN ('direction', 'comptable')
  AND p.module_id = m.id AND m.code = 'amortissements'
  AND p.action = 'view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Comptable peut aussi créer/éditer
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE FROM roles r, permissions p, modules m
WHERE r.code = 'comptable'
  AND p.module_id = m.id AND m.code = 'amortissements'
  AND p.action IN ('create', 'edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 5. Fonction : génère TOUTES les cost_entries pour un actif
--    (idempotent : DELETE avant INSERT)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_full_asset_depreciation(p_asset_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_asset assets%ROWTYPE;
  v_inserted INTEGER := 0;
  v_monthly_amount NUMERIC;
  v_cat_code TEXT;
  v_end_date DATE;
BEGIN
  SELECT * INTO v_asset FROM assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Toujours nettoyer (idempotent)
  DELETE FROM cost_entries WHERE source_asset_id = p_asset_id;

  IF NOT v_asset.is_active THEN
    RETURN 0;
  END IF;

  -- Date de fin = min(acquisition + life, disposal_date if any)
  v_end_date := (v_asset.acquisition_date + (v_asset.useful_life_years || ' years')::INTERVAL - INTERVAL '1 day')::DATE;
  IF v_asset.disposal_date IS NOT NULL AND v_asset.disposal_date < v_end_date THEN
    v_end_date := v_asset.disposal_date;
  END IF;

  -- Dotation mensuelle linéaire
  v_monthly_amount := ROUND(
    ((v_asset.acquisition_cost - COALESCE(v_asset.residual_value, 0))
      / (v_asset.useful_life_years * 12))::numeric, 2
  );
  IF v_monthly_amount <= 0 THEN RETURN 0; END IF;

  SELECT code INTO v_cat_code FROM account_categories WHERE id = v_asset.account_category_id;
  IF v_cat_code IS NULL THEN RETURN 0; END IF;

  -- Génère 1 cost_entry par mois entre date d'acquisition et fin de vie/cession
  WITH months AS (
    SELECT
      d::DATE AS month_start,
      (d + INTERVAL '1 month - 1 day')::DATE AS month_end
    FROM generate_series(
      DATE_TRUNC('month', v_asset.acquisition_date)::DATE,
      DATE_TRUNC('month', v_end_date)::DATE,
      INTERVAL '1 month'
    ) d
  )
  INSERT INTO cost_entries (
    campaign_id, greenhouse_id, account_category_id, cost_category,
    amount, entry_date, description, is_planned, source_asset_id
  )
  SELECT
    COALESCE(
      v_asset.campaign_id,
      (SELECT id FROM campaigns
       WHERE (v_asset.farm_id IS NULL OR farm_id = v_asset.farm_id)
         AND m.month_end BETWEEN COALESCE(planting_start, DATE '1900-01-01')
                              AND COALESCE(campaign_end, DATE '2100-12-31')
       ORDER BY planting_start DESC LIMIT 1),
      (SELECT id FROM campaigns WHERE farm_id = v_asset.farm_id ORDER BY created_at DESC LIMIT 1),
      (SELECT id FROM campaigns ORDER BY created_at DESC LIMIT 1)
    ),
    v_asset.greenhouse_id,
    v_asset.account_category_id,
    LOWER(v_cat_code),
    v_monthly_amount,
    m.month_end,
    'Amortissement ' || v_asset.code || ' — ' || v_asset.label
      || ' (' || TO_CHAR(m.month_start, 'MM/YYYY') || ')',
    FALSE,
    p_asset_id
  FROM months m;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. Trigger : régénère les dotations à chaque changement
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_asset_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM cost_entries WHERE source_asset_id = OLD.id;
    RETURN OLD;
  END IF;
  PERFORM generate_full_asset_depreciation(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assets_after_change ON assets;
CREATE TRIGGER trg_assets_after_change
AFTER INSERT OR UPDATE OR DELETE ON assets
FOR EACH ROW
EXECUTE FUNCTION trg_asset_change();

-- ────────────────────────────────────────────────────────────
-- 7. Trigger updated_at
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_assets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_assets_set_updated_at ON assets;
CREATE TRIGGER trg_assets_set_updated_at
BEFORE UPDATE ON assets
FOR EACH ROW EXECUTE FUNCTION trg_assets_updated_at();
