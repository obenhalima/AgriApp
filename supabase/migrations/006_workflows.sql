-- ============================================================
-- MOTEUR DE WORKFLOW PARAMETRABLE
-- Phase 1 : machines à états configurables (sans approbations ni règles)
-- Portée initiale : sales_orders. Architecture générique pour extension future.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Définitions de workflows (une par type d'entité + version)
-- ------------------------------------------------------------
CREATE TABLE workflow_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL,          -- ex: 'sales_order', 'invoice', 'harvest'
  code VARCHAR(50) NOT NULL,                 -- ex: 'default', 'export'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE, -- le workflow à utiliser si aucun override
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_type, code, version)
);

-- Un seul workflow actif marqué comme défaut par entity_type
CREATE UNIQUE INDEX idx_workflow_one_default_per_entity
  ON workflow_definitions(entity_type)
  WHERE is_default = TRUE AND is_active = TRUE;

-- ------------------------------------------------------------
-- 2. États d'un workflow
-- ------------------------------------------------------------
CREATE TABLE workflow_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,                 -- doit correspondre à la valeur stockée dans l'entité
  label VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(30),                         -- ex: 'var(--neon)', '#3b82f6'
  is_initial BOOLEAN NOT NULL DEFAULT FALSE, -- état de création (un seul par workflow)
  is_final BOOLEAN NOT NULL DEFAULT FALSE,   -- pas de transitions sortantes
  order_idx INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (definition_id, code)
);

CREATE INDEX idx_workflow_states_definition ON workflow_states(definition_id);

-- ------------------------------------------------------------
-- 3. Transitions autorisées
-- ------------------------------------------------------------
CREATE TABLE workflow_transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  from_state_id UUID NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  to_state_id   UUID NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,                 -- ex: 'confirm', 'cancel'
  label VARCHAR(100) NOT NULL,               -- libellé du bouton affiché
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  order_idx INTEGER NOT NULL DEFAULT 0,
  -- Placeholders pour les phases 3-4 (approbations, règles, actions)
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approval_role VARCHAR(50),                 -- ex: 'admin', 'manager' — non utilisé en Phase 1
  conditions JSONB,                          -- règles conditionnelles — non utilisé en Phase 1
  actions JSONB,                             -- actions automatiques — non utilisé en Phase 1
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (definition_id, from_state_id, to_state_id, code),
  CHECK (from_state_id <> to_state_id)
);

CREATE INDEX idx_workflow_transitions_definition ON workflow_transitions(definition_id);
CREATE INDEX idx_workflow_transitions_from       ON workflow_transitions(from_state_id);

-- ------------------------------------------------------------
-- 4. Historique des transitions (audit trail)
-- ------------------------------------------------------------
CREATE TABLE workflow_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  definition_id UUID REFERENCES workflow_definitions(id) ON DELETE SET NULL,
  transition_id UUID REFERENCES workflow_transitions(id) ON DELETE SET NULL,
  from_state_code VARCHAR(50),               -- snapshot (survit à la suppression d'un état)
  to_state_code VARCHAR(50) NOT NULL,
  performed_by UUID REFERENCES users(id),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_history_entity ON workflow_history(entity_type, entity_id);
CREATE INDEX idx_workflow_history_date   ON workflow_history(created_at DESC);

-- ============================================================
-- SEED : workflow par défaut pour sales_orders
-- Reproduit exactement l'enum order_status existant pour garantir
-- aucune régression à la mise en service.
-- ============================================================

WITH def AS (
  INSERT INTO workflow_definitions (entity_type, code, name, description, is_default)
  VALUES ('sales_order', 'default', 'Workflow commandes (par défaut)',
          'Cycle de vie standard d''une commande client', TRUE)
  RETURNING id
),
states AS (
  INSERT INTO workflow_states (definition_id, code, label, color, is_initial, is_final, order_idx)
  SELECT def.id, v.code, v.label, v.color, v.is_initial, v.is_final, v.order_idx
  FROM def, (VALUES
    ('brouillon',      'Brouillon',          'var(--tx-3)',   TRUE,  FALSE, 1),
    ('confirme',       'Confirmée',          'var(--blue)',   FALSE, FALSE, 2),
    ('en_preparation', 'En préparation',     'var(--amber)',  FALSE, FALSE, 3),
    ('expedie',        'Expédiée',           'var(--purple)', FALSE, FALSE, 4),
    ('livre',          'Livrée',             'var(--neon)',   FALSE, FALSE, 5),
    ('facture',        'Facturée',           'var(--neon-2)', FALSE, TRUE,  6),
    ('annule',         'Annulée',            'var(--red)',    FALSE, TRUE,  99)
  ) AS v(code, label, color, is_initial, is_final, order_idx)
  RETURNING id, definition_id, code
)
INSERT INTO workflow_transitions (definition_id, from_state_id, to_state_id, code, label, order_idx)
SELECT
  sf.definition_id,
  sf.id AS from_state_id,
  st.id AS to_state_id,
  v.code,
  v.label,
  v.order_idx
FROM states sf
JOIN states st ON st.definition_id = sf.definition_id
JOIN (VALUES
  -- Cycle nominal
  ('brouillon',      'confirme',        'confirm',  'Confirmer',       1),
  ('confirme',       'en_preparation',  'prepare',  'Lancer la préparation', 2),
  ('en_preparation', 'expedie',         'ship',     'Expédier',        3),
  ('expedie',        'livre',           'deliver',  'Marquer livrée',  4),
  ('livre',          'facture',         'invoice',  'Facturer',        5),
  -- Annulations possibles depuis tous les états non finaux
  ('brouillon',      'annule',          'cancel',   'Annuler',         90),
  ('confirme',       'annule',          'cancel',   'Annuler',         90),
  ('en_preparation', 'annule',          'cancel',   'Annuler',         90),
  ('expedie',        'annule',          'cancel',   'Annuler',         90)
) AS v(from_code, to_code, code, label, order_idx)
  ON sf.code = v.from_code AND st.code = v.to_code;

-- ============================================================
-- RLS — à activer explicitement après la mise en place de l'auth
-- ============================================================
-- ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE workflow_states      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE workflow_transitions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE workflow_history     ENABLE ROW LEVEL SECURITY;
