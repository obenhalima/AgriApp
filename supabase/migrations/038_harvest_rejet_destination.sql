-- ============================================================
-- Migration 038 — Destination du rejet (freinte/écart)
--
-- Quand l'opérateur saisit le tri à la station, le rejet n'est pas
-- toujours détruit. Il peut être :
--   - 'destruction'      : perte sèche (défaut)
--   - 'retour_stock'     : ré-envoi vers un autre marché
--   - 'vente_industrie'  : vente directe industrie/transformation (prix réduit)
--   - 'dons'             : banque alimentaire, dons
--
-- Si 'retour_stock', l'application crée automatiquement un harvest_lot
-- enfant category='stock_retour' avec quantity_kg = qty_rejetee,
-- qui devient disponible dans le flow "Composer un envoi" pour un
-- autre dispatch.
-- ============================================================

ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS destination_rejet VARCHAR(20) DEFAULT 'destruction',
  ADD COLUMN IF NOT EXISTS rejet_qty_kg DECIMAL(10, 2) DEFAULT 0,         -- qté totale rejetée (calculée = qty_envoyee - qty_acceptee)
  ADD COLUMN IF NOT EXISTS parent_dispatch_id UUID REFERENCES harvest_lots(id) ON DELETE SET NULL;
  -- parent_dispatch_id : pour les lots stock_retour, pointe vers le dispatch d'origine

-- Contrainte de validité des valeurs
ALTER TABLE harvest_lots
  DROP CONSTRAINT IF EXISTS chk_destination_rejet,
  ADD CONSTRAINT chk_destination_rejet
  CHECK (destination_rejet IS NULL OR destination_rejet IN (
    'destruction', 'retour_stock', 'vente_industrie', 'dons'
  ));

-- Index pour retrouver rapidement les lots stock_retour disponibles
CREATE INDEX IF NOT EXISTS idx_harvest_lots_stock_retour
  ON harvest_lots(category, tri_status)
  WHERE category = 'stock_retour';

-- Index sur parent_dispatch_id pour audit
CREATE INDEX IF NOT EXISTS idx_harvest_lots_parent_dispatch
  ON harvest_lots(parent_dispatch_id)
  WHERE parent_dispatch_id IS NOT NULL;

-- Commentaires pour documentation
COMMENT ON COLUMN harvest_lots.destination_rejet IS
  'Destination du rejet (freinte + écart) : destruction | retour_stock | vente_industrie | dons. NULL = pas applicable (lots stock_retour eux-mêmes).';
COMMENT ON COLUMN harvest_lots.rejet_qty_kg IS
  'Quantité rejetée totale (kg) = qty_envoyee - qty_acceptee. Stocké pour traçabilité.';
COMMENT ON COLUMN harvest_lots.parent_dispatch_id IS
  'Pour les lots stock_retour : pointe vers le dispatch d''origine (audit). NULL pour les autres lots.';
