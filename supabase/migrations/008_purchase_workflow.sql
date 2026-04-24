-- ============================================================
-- WORKFLOW "Bons d'achat / Achats" (purchase_order)
-- Phase 2 : machine à états pour le cycle complet des achats fournisseurs.
-- Inclut le parcours "achat direct" (création en état final 'recu').
-- ============================================================

-- NB: on ne crée PAS d'ENUM dédié — la colonne status sur purchase_orders
-- est déjà un VARCHAR, donc on peut y stocker n'importe quel code d'état.

WITH def AS (
  INSERT INTO workflow_definitions (entity_type, code, name, description, is_default)
  VALUES ('purchase_order', 'default', 'Workflow achats (par défaut)',
          'Cycle de vie standard d''un bon d''achat fournisseur, de la saisie jusqu''au paiement', TRUE)
  RETURNING id
),
states AS (
  INSERT INTO workflow_states (definition_id, code, label, color, is_initial, is_final, order_idx)
  SELECT def.id, v.code, v.label, v.color, v.is_initial, v.is_final, v.order_idx
  FROM def, (VALUES
    ('brouillon',          'Brouillon',            'var(--tx-3)',   TRUE,  FALSE, 1),
    ('envoye',             'Envoyé au fournisseur','var(--blue)',   FALSE, FALSE, 2),
    ('partiellement_recu', 'Partiellement reçu',   'var(--amber)',  FALSE, FALSE, 3),
    ('recu',               'Entièrement reçu',     'var(--neon)',   FALSE, FALSE, 4),
    ('facture',            'Facturé',              'var(--neon-2)', FALSE, FALSE, 5),
    ('paye',               'Payé',                 'var(--purple)', FALSE, TRUE,  6),
    ('annule',             'Annulé',               'var(--red)',    FALSE, TRUE,  99)
  ) AS v(code, label, color, is_initial, is_final, order_idx)
  RETURNING id, definition_id, code
)
INSERT INTO workflow_transitions (definition_id, from_state_id, to_state_id, code, label, description, order_idx)
SELECT
  sf.definition_id, sf.id, st.id, v.code, v.label, v.description, v.order_idx
FROM states sf
JOIN states st ON st.definition_id = sf.definition_id
JOIN (VALUES
  -- Envoi du bon au fournisseur
  ('brouillon',          'envoye',             'send',     'Envoyer au fournisseur',
   'Le bon d''achat est transmis au fournisseur', 1),

  -- Réception : les transitions vers partiellement_recu / recu sont
  -- déclenchées par l'Edge Function purchase-order-receive (pas par bouton UI direct).
  ('envoye',             'partiellement_recu', 'partial_receive', 'Réception partielle',
   'Transition automatique lors d''une réception partielle', 10),
  ('envoye',             'recu',               'full_receive',    'Réception complète',
   'Transition automatique lors d''une réception totale', 11),
  ('partiellement_recu', 'recu',               'complete_receive','Finaliser la réception',
   'Transition automatique lorsque toutes les quantités sont reçues', 12),

  -- Facturation
  ('recu',               'facture',            'invoice',  'Facturer',
   'Création / rattachement de la facture fournisseur', 20),

  -- Paiement
  ('facture',            'paye',               'pay',      'Marquer comme payé',
   'Enregistrement du paiement', 30),

  -- Annulations depuis les états non finaux
  ('brouillon',          'annule',             'cancel',   'Annuler', NULL, 90),
  ('envoye',             'annule',             'cancel',   'Annuler', NULL, 90),
  ('partiellement_recu', 'annule',             'cancel',   'Annuler', NULL, 90)
) AS v(from_code, to_code, code, label, description, order_idx)
  ON sf.code = v.from_code AND st.code = v.to_code;

-- ============================================================
-- Initialiser le statut des bons d'achat existants si nécessaire
-- ============================================================
UPDATE purchase_orders SET status = 'brouillon' WHERE status IS NULL OR status = '';

-- Alignement des anciens codes vers ceux du workflow (si l'app a stocké d'autres libellés)
UPDATE purchase_orders SET status = 'envoye'             WHERE status IN ('envoye', 'envoye_fournisseur', 'sent');
UPDATE purchase_orders SET status = 'partiellement_recu' WHERE status IN ('partiel', 'partiellement_recu');
UPDATE purchase_orders SET status = 'recu'               WHERE status IN ('recu', 'recue', 'received');
