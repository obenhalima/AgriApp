-- ============================================================
-- Migration 048 — Acheteur d'écart (revente des pertes de tri)
--
-- Cas métier : pendant le tri, l'écart (pieces non-conformes) n'est pas
-- détruit. Un client spécifique passe à la station récupérer ces écarts
-- et les vend sur un marché local.
--
-- Modélisation :
--   - clients.is_ecart_buyer : flag pour identifier l'acheteur d'écart
--   - markets.is_ecart_market : flag pour identifier le marché écart
--   - Convention : un seul ecart_buyer actif a la fois, et un seul
--     ecart_market actif (sinon ambiguité dans le workflow tri).
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_ecart_buyer BOOLEAN DEFAULT FALSE;

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS is_ecart_market BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_clients_ecart_buyer ON clients(is_ecart_buyer) WHERE is_ecart_buyer = TRUE;
CREATE INDEX IF NOT EXISTS idx_markets_ecart ON markets(is_ecart_market) WHERE is_ecart_market = TRUE;

COMMENT ON COLUMN clients.is_ecart_buyer IS
'Marque ce client comme l''acheteur des écarts de tri. Un seul client actif a la fois recommandé.';

COMMENT ON COLUMN markets.is_ecart_market IS
'Marque ce marché comme destinataire des écarts. Lié au client is_ecart_buyer via client_id.';

-- Trigger : enforce unicité du client écart (1 seul actif)
CREATE OR REPLACE FUNCTION trg_enforce_single_ecart_buyer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_ecart_buyer = TRUE AND NEW.is_active = TRUE THEN
    UPDATE clients SET is_ecart_buyer = FALSE
     WHERE id != NEW.id AND is_ecart_buyer = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_single_ecart ON clients;
CREATE TRIGGER trg_clients_single_ecart
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW
  WHEN (NEW.is_ecart_buyer = TRUE)
  EXECUTE FUNCTION trg_enforce_single_ecart_buyer();

-- Trigger : enforce unicité du marché écart
CREATE OR REPLACE FUNCTION trg_enforce_single_ecart_market()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_ecart_market = TRUE AND NEW.is_active = TRUE THEN
    UPDATE markets SET is_ecart_market = FALSE
     WHERE id != NEW.id AND is_ecart_market = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_markets_single_ecart ON markets;
CREATE TRIGGER trg_markets_single_ecart
  BEFORE INSERT OR UPDATE ON markets
  FOR EACH ROW
  WHEN (NEW.is_ecart_market = TRUE)
  EXECUTE FUNCTION trg_enforce_single_ecart_market();

-- Étendre la contrainte destination_rejet pour autoriser 'vente_ecart'
ALTER TABLE harvest_lots
  DROP CONSTRAINT IF EXISTS chk_destination_rejet;
ALTER TABLE harvest_lots
  ADD CONSTRAINT chk_destination_rejet
  CHECK (destination_rejet IS NULL OR destination_rejet IN (
    'destruction', 'retour_stock', 'vente_industrie', 'dons', 'vente_ecart'
  ));

COMMENT ON COLUMN harvest_lots.destination_rejet IS
'Destination des écarts du tri : destruction, retour_stock, vente_industrie, dons, vente_ecart.
 vente_ecart : auto-crée un dispatch enfant vers le marché écart (markets.is_ecart_market).';

-- RPC helper : crée un dispatch écart enfant
-- Appelé quand l'utilisateur valide un tri avec destination_rejet='vente_ecart'
CREATE OR REPLACE FUNCTION create_ecart_dispatch(
  p_parent_lot_id UUID,
  p_ecart_qty_kg DECIMAL DEFAULT NULL  -- NULL = auto = qty_envoyee - qty_acceptee
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_ecart_market_id UUID;
  v_ecart_client_id UUID;
  v_qty DECIMAL(10, 2);
  v_new_lot_id UUID;
  v_new_lot_number VARCHAR(50);
BEGIN
  -- Récupère le dispatch parent
  SELECT * INTO v_parent FROM harvest_lots WHERE id = p_parent_lot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispatch parent introuvable' USING ERRCODE = 'P0002';
  END IF;

  -- Récupère le marché écart actif
  SELECT id, client_id INTO v_ecart_market_id, v_ecart_client_id
    FROM markets
   WHERE is_ecart_market = TRUE AND is_active = TRUE
   LIMIT 1;

  IF v_ecart_market_id IS NULL THEN
    RAISE EXCEPTION 'Aucun marché écart configuré. Active is_ecart_market=true sur un marché dans /marches.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Qty : auto-calcul ou paramètre
  v_qty := COALESCE(p_ecart_qty_kg, COALESCE(v_parent.quantity_kg, 0) - COALESCE(v_parent.qty_acceptee_kg, 0));
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantité écart nulle ou négative pour le lot %', v_parent.lot_number;
  END IF;

  -- Génère lot_number
  v_new_lot_number := COALESCE(v_parent.lot_number, 'LOT') || '-ECART';

  -- Crée le dispatch enfant
  INSERT INTO harvest_lots (
    lot_number,
    harvest_id,
    campaign_planting_id,
    harvest_date,
    receipt_date,
    quantity_kg,
    category,
    variety_id,
    greenhouse_id,
    market_id,
    client_id,
    tri_status,
    parent_dispatch_id,
    notes
  ) VALUES (
    v_new_lot_number,
    v_parent.harvest_id,
    v_parent.campaign_planting_id,
    CURRENT_DATE,
    CURRENT_DATE,
    v_qty,
    'station_dispatch',
    v_parent.variety_id,
    v_parent.greenhouse_id,
    v_ecart_market_id,
    v_ecart_client_id,
    'pending',
    v_parent.id,
    'Écart du dispatch ' || v_parent.lot_number || ' vendu au client écart'
  )
  RETURNING id INTO v_new_lot_id;

  RETURN v_new_lot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_ecart_dispatch(UUID, DECIMAL) TO authenticated;

COMMENT ON FUNCTION create_ecart_dispatch(UUID, DECIMAL) IS
'Crée un dispatch enfant pour vendre l''écart au client écart (clients.is_ecart_buyer + markets.is_ecart_market). Lié au parent via parent_dispatch_id.';
