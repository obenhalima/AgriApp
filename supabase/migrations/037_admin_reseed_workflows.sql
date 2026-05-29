-- ============================================================
-- Migration 037 — Admin reseed workflows RPC
--
-- Permet de restaurer les workflows par défaut (sales_order +
-- purchase_order) si jamais ils ont été supprimés (par accident
-- ou via Nuclear avant la protection 036).
--
-- Idempotent : ne crée que ce qui manque (ON CONFLICT DO NOTHING).
-- ============================================================

CREATE OR REPLACE FUNCTION admin_reseed_workflows()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def_sales UUID;
  v_def_purch UUID;
  v_states_created INTEGER := 0;
  v_transitions_created INTEGER := 0;
  v_count INTEGER;
BEGIN
  IF NOT is_admin_caller() THEN
    RAISE EXCEPTION 'Permission refusée : admin requis';
  END IF;

  -- ─── 1. Workflow SALES_ORDER ───────────────────────────────
  -- Récupère ou crée la définition
  SELECT id INTO v_def_sales
  FROM workflow_definitions
  WHERE entity_type = 'sales_order' AND code = 'default' AND version = 1;

  IF v_def_sales IS NULL THEN
    INSERT INTO workflow_definitions (entity_type, code, name, description, is_default)
    VALUES ('sales_order', 'default', 'Workflow commandes (par défaut)',
            'Cycle de vie standard d''une commande client', TRUE)
    RETURNING id INTO v_def_sales;
  END IF;

  -- Insère les états manquants (filter via NOT EXISTS)
  INSERT INTO workflow_states (definition_id, code, label, color, is_initial, is_final, order_idx)
  SELECT v_def_sales, v.code, v.label, v.color, v.is_initial, v.is_final, v.order_idx
  FROM (VALUES
    ('brouillon',      'Brouillon',          'var(--tx-3)',   TRUE,  FALSE, 1),
    ('confirme',       'Confirmée',          'var(--blue)',   FALSE, FALSE, 2),
    ('en_preparation', 'En préparation',     'var(--amber)',  FALSE, FALSE, 3),
    ('expedie',        'Expédiée',           'var(--purple)', FALSE, FALSE, 4),
    ('livre',          'Livrée',             'var(--neon)',   FALSE, FALSE, 5),
    ('facture',        'Facturée',           'var(--neon-2)', FALSE, TRUE,  6),
    ('annule',         'Annulée',            'var(--red)',    FALSE, TRUE,  99)
  ) AS v(code, label, color, is_initial, is_final, order_idx)
  WHERE NOT EXISTS (
    SELECT 1 FROM workflow_states s
    WHERE s.definition_id = v_def_sales AND s.code = v.code
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_states_created := v_states_created + v_count;

  -- Insère les transitions manquantes
  INSERT INTO workflow_transitions (definition_id, from_state_id, to_state_id, code, label, order_idx)
  SELECT v_def_sales, sf.id, st.id, v.code, v.label, v.order_idx
  FROM (VALUES
    ('brouillon',      'confirme',        'confirm',  'Confirmer',       1),
    ('confirme',       'en_preparation',  'prepare',  'Lancer préparation', 2),
    ('en_preparation', 'expedie',         'ship',     'Expédier',        3),
    ('expedie',        'livre',           'deliver',  'Marquer livrée',  4),
    ('livre',          'facture',         'invoice',  'Facturer',        5),
    ('brouillon',      'annule',          'cancel',   'Annuler',         90),
    ('confirme',       'annule',          'cancel',   'Annuler',         90),
    ('en_preparation', 'annule',          'cancel',   'Annuler',         90),
    ('expedie',        'annule',          'cancel',   'Annuler',         90)
  ) AS v(from_code, to_code, code, label, order_idx)
  JOIN workflow_states sf ON sf.definition_id = v_def_sales AND sf.code = v.from_code
  JOIN workflow_states st ON st.definition_id = v_def_sales AND st.code = v.to_code
  WHERE NOT EXISTS (
    SELECT 1 FROM workflow_transitions t
    WHERE t.definition_id = v_def_sales
      AND t.from_state_id = sf.id AND t.to_state_id = st.id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_transitions_created := v_transitions_created + v_count;

  -- ─── 2. Workflow PURCHASE_ORDER ────────────────────────────
  SELECT id INTO v_def_purch
  FROM workflow_definitions
  WHERE entity_type = 'purchase_order' AND code = 'default' AND version = 1;

  IF v_def_purch IS NULL THEN
    INSERT INTO workflow_definitions (entity_type, code, name, description, is_default)
    VALUES ('purchase_order', 'default', 'Workflow achats (par défaut)',
            'Cycle de vie standard d''un bon d''achat fournisseur', TRUE)
    RETURNING id INTO v_def_purch;
  END IF;

  INSERT INTO workflow_states (definition_id, code, label, color, is_initial, is_final, order_idx)
  SELECT v_def_purch, v.code, v.label, v.color, v.is_initial, v.is_final, v.order_idx
  FROM (VALUES
    ('brouillon',          'Brouillon',            'var(--tx-3)',   TRUE,  FALSE, 1),
    ('envoye',             'Envoyé au fournisseur','var(--blue)',   FALSE, FALSE, 2),
    ('partiellement_recu', 'Partiellement reçu',   'var(--amber)',  FALSE, FALSE, 3),
    ('recu',               'Entièrement reçu',     'var(--neon)',   FALSE, FALSE, 4),
    ('facture',            'Facturé',              'var(--neon-2)', FALSE, FALSE, 5),
    ('paye',               'Payé',                 'var(--purple)', FALSE, TRUE,  6),
    ('annule',             'Annulé',               'var(--red)',    FALSE, TRUE,  99)
  ) AS v(code, label, color, is_initial, is_final, order_idx)
  WHERE NOT EXISTS (
    SELECT 1 FROM workflow_states s
    WHERE s.definition_id = v_def_purch AND s.code = v.code
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_states_created := v_states_created + v_count;

  INSERT INTO workflow_transitions (definition_id, from_state_id, to_state_id, code, label, order_idx)
  SELECT v_def_purch, sf.id, st.id, v.code, v.label, v.order_idx
  FROM (VALUES
    ('brouillon',          'envoye',              'send',     'Envoyer au fournisseur', 1),
    ('envoye',             'partiellement_recu',  'part_rcv', 'Réception partielle',   2),
    ('envoye',             'recu',                'receive',  'Réception complète',    3),
    ('partiellement_recu', 'recu',                'complete', 'Réception complète',    4),
    ('recu',               'facture',             'invoice',  'Facturer',              5),
    ('facture',            'paye',                'pay',      'Marquer payé',          6),
    ('brouillon',          'recu',                'direct',   'Achat direct',          7),
    ('brouillon',          'annule',              'cancel',   'Annuler',               90),
    ('envoye',             'annule',              'cancel',   'Annuler',               90)
  ) AS v(from_code, to_code, code, label, order_idx)
  JOIN workflow_states sf ON sf.definition_id = v_def_purch AND sf.code = v.from_code
  JOIN workflow_states st ON st.definition_id = v_def_purch AND st.code = v.to_code
  WHERE NOT EXISTS (
    SELECT 1 FROM workflow_transitions t
    WHERE t.definition_id = v_def_purch
      AND t.from_state_id = sf.id AND t.to_state_id = st.id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_transitions_created := v_transitions_created + v_count;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', format('Workflows reseed : %s états + %s transitions créés (rien si déjà présents)',
                      v_states_created, v_transitions_created),
    'states_created', v_states_created,
    'transitions_created', v_transitions_created,
    'sales_order_def', v_def_sales,
    'purchase_order_def', v_def_purch
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_reseed_workflows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_reseed_workflows() TO authenticated;

COMMENT ON FUNCTION admin_reseed_workflows() IS
  'Restaure les workflows sales_order et purchase_order par défaut. Idempotent. Admin only.';
