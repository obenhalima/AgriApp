-- ============================================================
-- MODULE RH : Employés / Paie / Congés / Déclarations CNSS
-- Conformité Maroc : CNSS, AMO, IR, Allocations familiales, Formation pro
--
-- Stratégie :
--   - Étend la table existante "workers" avec les champs paie/RH
--   - Ajoute nouvelles tables : payroll_periods, payslips, leave_requests,
--     leave_balances, cnss_declarations
--   - Ajoute le module "rh" + sous-modules dans la table modules
--   - Crée 5 catégories comptables (charges sociales) si absentes
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1. EXTENSION TABLE workers (existante)
-- ───────────────────────────────────────────────────────────
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS matricule VARCHAR(30) UNIQUE,
  ADD COLUMN IF NOT EXISTS cnss_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS date_birth DATE,
  ADD COLUMN IF NOT EXISTS function VARCHAR(100),
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'fermier',
    -- 'fermier' | 'staff_admin' | 'saisonnier'
  ADD COLUMN IF NOT EXISTS pay_frequency VARCHAR(20) DEFAULT 'quinzaine',
    -- 'mensuel' | 'quinzaine' | 'journalier'
  ADD COLUMN IF NOT EXISTS base_salary DECIMAL(10, 2) DEFAULT 0,
    -- équivalent salaire brut MENSUEL (pour quinzaine = brut mensuel total)
  ADD COLUMN IF NOT EXISTS family_status VARCHAR(20) DEFAULT 'celibataire',
    -- 'celibataire' | 'marie' | 'divorce' | 'veuf'
  ADD COLUMN IF NOT EXISTS dependents INTEGER DEFAULT 0,
    -- nombre d'enfants à charge (max 6 pour réduction IR)
  ADD COLUMN IF NOT EXISTS bank_iban VARCHAR(40),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'virement',
    -- 'virement' | 'cash' | 'cheque'
  ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_workers_matricule ON workers(matricule);
CREATE INDEX IF NOT EXISTS idx_workers_category ON workers(category);
CREATE INDEX IF NOT EXISTS idx_workers_farm ON workers(farm_id);

-- ───────────────────────────────────────────────────────────
-- 2. PÉRIODES DE PAIE
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) UNIQUE NOT NULL,         -- ex: PAY-2026-04-M, PAY-2026-04-Q1, PAY-2026-04-Q2
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_half VARCHAR(10) NOT NULL DEFAULT 'full',
    -- 'full' (mensuel) | 'first' (1-15) | 'second' (16-fin)
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  pay_date DATE NOT NULL,                   -- date prévue de paiement
  status VARCHAR(20) NOT NULL DEFAULT 'brouillon',
    -- 'brouillon' | 'valide' | 'paye' | 'cloture'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_year_month ON payroll_periods(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON payroll_periods(status);

-- ───────────────────────────────────────────────────────────
-- 3. BULLETINS DE PAIE (PAYSLIPS)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  -- Temps travaillé
  days_worked DECIMAL(5, 2) DEFAULT 0,
  hours_worked DECIMAL(7, 2) DEFAULT 0,
  hours_overtime DECIMAL(7, 2) DEFAULT 0,
  -- Brut
  base_amount DECIMAL(10, 2) DEFAULT 0,        -- salaire de base sur la période
  overtime_amount DECIMAL(10, 2) DEFAULT 0,    -- heures sup
  bonuses DECIMAL(10, 2) DEFAULT 0,            -- primes
  gross_salary DECIMAL(10, 2) NOT NULL,        -- brut total
  -- Cotisations salariales (déductions)
  cnss_employee DECIMAL(10, 2) DEFAULT 0,      -- 4,48% plafonné 6000
  amo_employee DECIMAL(10, 2) DEFAULT 0,       -- 2,26%
  ir_amount DECIMAL(10, 2) DEFAULT 0,          -- impôt revenu
  other_deductions DECIMAL(10, 2) DEFAULT 0,   -- avance, prêt, etc.
  -- Net à payer
  net_salary DECIMAL(10, 2) NOT NULL,
  -- Cotisations patronales (informatif sur bulletin, vrai coût pour entreprise)
  cnss_employer DECIMAL(10, 2) DEFAULT 0,      -- 8,98% plafonné 6000
  amo_employer DECIMAL(10, 2) DEFAULT 0,       -- 4,11%
  family_allowance_employer DECIMAL(10, 2) DEFAULT 0,  -- 6,4%
  prof_training_employer DECIMAL(10, 2) DEFAULT 0,     -- 1,6%
  -- Coût total employeur
  total_employer_cost DECIMAL(10, 2) NOT NULL,
  -- Statut
  status VARCHAR(20) NOT NULL DEFAULT 'brouillon',
    -- 'brouillon' | 'valide' | 'paye'
  paid_at TIMESTAMPTZ,
  -- Liaison comptable
  cost_entry_id UUID REFERENCES cost_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (period_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips(period_id);
CREATE INDEX IF NOT EXISTS idx_payslips_worker ON payslips(worker_id);
CREATE INDEX IF NOT EXISTS idx_payslips_status ON payslips(status);

-- ───────────────────────────────────────────────────────────
-- 4. CONGÉS — DEMANDES + SOLDES
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
    -- 'annuel' | 'maladie' | 'maternite' | 'paternite' | 'sans_solde' | 'special'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL CHECK (days > 0),
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'demande',
    -- 'demande' | 'approuve' | 'refuse' | 'annule'
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  refused_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_worker ON leave_requests(worker_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);

CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  -- Acquisition (Maroc : 1,5 j/mois = 18 j/an)
  annual_acquired DECIMAL(5, 2) DEFAULT 18,
  annual_taken DECIMAL(5, 2) DEFAULT 0,
  annual_carried DECIMAL(5, 2) DEFAULT 0,    -- reporté de l'année précédente
  sick_taken DECIMAL(5, 2) DEFAULT 0,
  maternity_taken DECIMAL(5, 2) DEFAULT 0,
  special_taken DECIMAL(5, 2) DEFAULT 0,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (worker_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_worker_year ON leave_balances(worker_id, year);

-- ───────────────────────────────────────────────────────────
-- 5. DÉCLARATIONS CNSS (mensuelles)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cnss_declarations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  declaration_year INTEGER NOT NULL,
  declaration_month INTEGER NOT NULL CHECK (declaration_month BETWEEN 1 AND 12),
  status VARCHAR(20) NOT NULL DEFAULT 'brouillon',
    -- 'brouillon' | 'declaree' | 'payee'
  -- Totaux agrégés à partir des bulletins de la période
  nb_workers INTEGER DEFAULT 0,
  total_gross DECIMAL(12, 2) DEFAULT 0,
  total_cnss_employee DECIMAL(12, 2) DEFAULT 0,
  total_cnss_employer DECIMAL(12, 2) DEFAULT 0,
  total_amo_employee DECIMAL(12, 2) DEFAULT 0,
  total_amo_employer DECIMAL(12, 2) DEFAULT 0,
  total_family_allowance DECIMAL(12, 2) DEFAULT 0,
  total_prof_training DECIMAL(12, 2) DEFAULT 0,
  total_due DECIMAL(12, 2) DEFAULT 0,         -- somme des cotisations dues
  -- Documents
  declaration_number VARCHAR(50),             -- numéro DAMANCOM
  declaration_pdf_url TEXT,
  declared_at TIMESTAMPTZ,
  declared_by UUID REFERENCES auth.users(id),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (declaration_year, declaration_month)
);

CREATE INDEX IF NOT EXISTS idx_cnss_year_month ON cnss_declarations(declaration_year, declaration_month);

-- ───────────────────────────────────────────────────────────
-- 6. RLS — toutes les tables RH (admin + role 'rh' uniquement)
-- ───────────────────────────────────────────────────────────
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE cnss_declarations ENABLE ROW LEVEL SECURITY;

-- Lecture pour tout authentifié, écriture pour admin uniquement (V1)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_periods','payslips','leave_requests','leave_balances','cnss_declarations']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth read %I" ON %I', t, t);
    EXECUTE format('CREATE POLICY "auth read %I" ON %I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "admin write %I" ON %I', t, t);
    EXECUTE format('CREATE POLICY "admin write %I" ON %I FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()))', t, t);
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────
-- 7. MODULES RH dans la table modules
-- ───────────────────────────────────────────────────────────
INSERT INTO modules (code, label, icon, color, path, section, display_order) VALUES
  ('rh',           'Tableau de bord RH', '👥', '#0ea5e9', '/rh',           'RH', 10),
  ('rh_employes',  'Employés',           '🪪', '#0ea5e9', '/rh/employes',  'RH', 20),
  ('rh_paie',      'Paie',               '💵', '#10b981', '/rh/paie',      'RH', 30),
  ('rh_conges',    'Congés',             '🏖️', '#f59e0b', '/rh/conges',    'RH', 40),
  ('rh_cnss',      'Déclarations CNSS',  '🏛️', '#6366f1', '/rh/cnss',      'RH', 50)
ON CONFLICT (code) DO NOTHING;

-- Permissions pour les nouveaux modules (5 actions × 5 modules)
INSERT INTO permissions (module_id, action, code)
SELECT m.id, a.action, m.code || '.' || a.action
FROM modules m
CROSS JOIN (
  VALUES ('view'::permission_action), ('create'::permission_action), ('edit'::permission_action), ('delete'::permission_action), ('admin'::permission_action)
) AS a(action)
WHERE m.code LIKE 'rh%'
ON CONFLICT (code) DO NOTHING;

-- Direction : view sur tout RH
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p, modules m
WHERE r.code = 'direction' AND p.module_id = m.id AND m.code LIKE 'rh%' AND p.action = 'view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Comptable : view + create + edit sur paie + cnss (pour clôtures comptables)
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p, modules m
WHERE r.code = 'comptable' AND p.module_id = m.id
  AND m.code IN ('rh', 'rh_paie', 'rh_cnss')
  AND p.action IN ('view', 'create', 'edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ───────────────────────────────────────────────────────────
-- 8. CATÉGORIES COMPTABLES (charges sociales) — seed si absentes
-- ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_parent_id UUID;
BEGIN
  -- Trouve la racine "Charges fixes" (création si absente)
  SELECT id INTO v_parent_id FROM account_categories
  WHERE code = 'CHARGES_FIXES' AND parent_id IS NULL
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    INSERT INTO account_categories (code, label, type, parent_id, level, display_order, is_active)
    VALUES ('CHARGES_FIXES', 'Charges fixes', 'charge_fixe', NULL, 0, 100, TRUE)
    RETURNING id INTO v_parent_id;
  END IF;

  -- Sous-catégories RH (idempotent)
  INSERT INTO account_categories (code, label, type, parent_id, level, display_order, is_active)
  VALUES
    ('SAL_BRUT',       'Salaires bruts',                  'charge_fixe', v_parent_id, 1, 110, TRUE),
    ('CNSS_PAT',       'Cotisations CNSS patronale',      'charge_fixe', v_parent_id, 1, 111, TRUE),
    ('AMO_PAT',        'Cotisations AMO patronale',       'charge_fixe', v_parent_id, 1, 112, TRUE),
    ('ALLOC_FAM',      'Allocations familiales',          'charge_fixe', v_parent_id, 1, 113, TRUE),
    ('FORM_PRO',       'Taxe formation professionnelle',  'charge_fixe', v_parent_id, 1, 114, TRUE)
  ON CONFLICT (code) DO NOTHING;
END $$;
