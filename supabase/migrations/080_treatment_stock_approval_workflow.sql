-- Migration 080 — Demandes de traitement et sorties de stock avec validation
-- Règle : le demandeur ne peut jamais valider sa propre demande.

BEGIN;

CREATE TYPE public.approval_request_status AS ENUM
  ('soumise', 'approuvee', 'rejetee', 'executee', 'annulee');

CREATE TABLE public.treatment_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  campaign_planting_id UUID NOT NULL REFERENCES public.campaign_plantings(id) ON DELETE RESTRICT,
  requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
  planned_at TIMESTAMPTZ NOT NULL,
  target_name VARCHAR(180) NOT NULL,
  diagnosis TEXT NOT NULL,
  justification TEXT NOT NULL,
  treated_area_m2 NUMERIC(12,2) NOT NULL CHECK (treated_area_m2 > 0),
  water_volume_liters NUMERIC(12,2) CHECK (water_volume_liters IS NULL OR water_volume_liters > 0),
  temperature_c NUMERIC(5,2),
  humidity_pct NUMERIC(5,2) CHECK (humidity_pct IS NULL OR humidity_pct BETWEEN 0 AND 100),
  status public.approval_request_status NOT NULL DEFAULT 'soumise',
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.profiles(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  executed_by UUID REFERENCES public.profiles(id),
  executed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CHECK (rejected_by IS NULL OR rejected_by <> requested_by)
);

CREATE TABLE public.treatment_request_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_request_id UUID NOT NULL REFERENCES public.treatment_requests(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  dose NUMERIC(12,4) NOT NULL CHECK (dose > 0),
  dose_unit VARCHAR(30) NOT NULL,
  planned_quantity NUMERIC(12,4) NOT NULL CHECK (planned_quantity > 0),
  actual_quantity NUMERIC(12,4) CHECK (actual_quantity IS NULL OR actual_quantity > 0),
  phi_days INTEGER NOT NULL DEFAULT 0 CHECK (phi_days >= 0),
  rei_hours INTEGER NOT NULL DEFAULT 0 CHECK (rei_hours >= 0),
  label_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.stock_exit_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  treatment_request_id UUID REFERENCES public.treatment_requests(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,4) NOT NULL CHECK (quantity > 0),
  requested_for DATE NOT NULL DEFAULT CURRENT_DATE,
  campaign_id UUID REFERENCES public.campaigns(id),
  greenhouse_id UUID REFERENCES public.greenhouses(id),
  reason TEXT NOT NULL,
  reference VARCHAR(100),
  status public.approval_request_status NOT NULL DEFAULT 'soumise',
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.profiles(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  executed_by UUID REFERENCES public.profiles(id),
  executed_at TIMESTAMPTZ,
  stock_movement_id UUID UNIQUE REFERENCES public.stock_movements(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CHECK (rejected_by IS NULL OR rejected_by <> requested_by)
);

CREATE INDEX idx_treatment_requests_domain_status ON public.treatment_requests(domain_id, status);
CREATE INDEX idx_treatment_products_request ON public.treatment_request_products(treatment_request_id);
CREATE INDEX idx_stock_exit_requests_domain_status ON public.stock_exit_requests(domain_id, status);

CREATE OR REPLACE FUNCTION public.is_domain_responsible(p_domain_id UUID, p_user_id UUID, p_module TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_platform_admin(p_user_id)
    OR public.is_domain_admin(p_domain_id, p_user_id)
    OR public.has_domain_permission(p_domain_id, p_user_id, p_module, 'admin');
$$;

CREATE OR REPLACE FUNCTION public.submit_treatment_request(p_request JSONB, p_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID; v_domain UUID; v_planting_domain UUID; v_line JSONB; v_item_domain UUID;
BEGIN
  v_domain := (p_request->>'domain_id')::UUID;
  IF NOT public.has_domain_permission(v_domain, auth.uid(), 'agronomie', 'create') THEN RAISE EXCEPTION 'Permission de demande refusée'; END IF;
  SELECT domain_id INTO v_planting_domain FROM campaign_plantings WHERE id=(p_request->>'campaign_planting_id')::UUID;
  IF v_planting_domain IS DISTINCT FROM v_domain THEN RAISE EXCEPTION 'Plantation hors du domaine actif'; END IF;
  IF jsonb_array_length(COALESCE(p_products, '[]'::JSONB)) = 0 THEN RAISE EXCEPTION 'Au moins un produit est obligatoire'; END IF;

  INSERT INTO treatment_requests(domain_id,campaign_planting_id,planned_at,target_name,diagnosis,justification,treated_area_m2,water_volume_liters,temperature_c,humidity_pct,requested_by,notes)
  VALUES(v_domain,(p_request->>'campaign_planting_id')::UUID,(p_request->>'planned_at')::TIMESTAMPTZ,p_request->>'target_name',p_request->>'diagnosis',p_request->>'justification',(p_request->>'treated_area_m2')::NUMERIC,NULLIF(p_request->>'water_volume_liters','')::NUMERIC,NULLIF(p_request->>'temperature_c','')::NUMERIC,NULLIF(p_request->>'humidity_pct','')::NUMERIC,auth.uid(),NULLIF(p_request->>'notes','')) RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_products) LOOP
    SELECT domain_id INTO v_item_domain FROM stock_items WHERE id=(v_line->>'stock_item_id')::UUID AND is_active;
    IF v_item_domain IS DISTINCT FROM v_domain THEN RAISE EXCEPTION 'Produit de stock hors domaine ou inactif'; END IF;
    INSERT INTO treatment_request_products(treatment_request_id,domain_id,stock_item_id,dose,dose_unit,planned_quantity,phi_days,rei_hours,label_confirmed)
    VALUES(v_id,v_domain,(v_line->>'stock_item_id')::UUID,(v_line->>'dose')::NUMERIC,v_line->>'dose_unit',(v_line->>'planned_quantity')::NUMERIC,COALESCE((v_line->>'phi_days')::INTEGER,0),COALESCE((v_line->>'rei_hours')::INTEGER,0),COALESCE((v_line->>'label_confirmed')::BOOLEAN,FALSE));
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_treatment_request(p_request_id UUID, p_approve BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v treatment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v FROM treatment_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v.status <> 'soumise' THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée'; END IF;
  IF v.requested_by=auth.uid() THEN RAISE EXCEPTION 'Le demandeur ne peut pas valider sa propre demande'; END IF;
  IF NOT public.is_domain_responsible(v.domain_id,auth.uid(),'agronomie') THEN RAISE EXCEPTION 'Validation réservée au profil responsable'; END IF;
  IF p_approve THEN
    IF EXISTS (SELECT 1 FROM treatment_request_products WHERE treatment_request_id=v.id AND NOT label_confirmed) THEN RAISE EXCEPTION 'Toutes les étiquettes doivent être confirmées'; END IF;
    UPDATE treatment_requests SET status='approuvee',approved_by=auth.uid(),approved_at=NOW(),updated_at=NOW() WHERE id=v.id;
  ELSE
    IF NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Le motif de rejet est obligatoire'; END IF;
    UPDATE treatment_requests SET status='rejetee',rejected_by=auth.uid(),rejected_at=NOW(),rejection_reason=p_reason,updated_at=NOW() WHERE id=v.id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.execute_treatment_request(p_request_id UUID, p_actual_quantities JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v treatment_requests%ROWTYPE; l treatment_request_products%ROWTYPE; q NUMERIC; available NUMERIC; m_id UUID;
BEGIN
  SELECT * INTO v FROM treatment_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v.status <> 'approuvee' THEN RAISE EXCEPTION 'Le traitement doit être approuvé avant exécution'; END IF;
  IF NOT public.has_domain_permission(v.domain_id,auth.uid(),'agronomie','edit') THEN RAISE EXCEPTION 'Permission d’exécution refusée'; END IF;
  PERFORM set_config('app.approved_stock_exit','true',TRUE);
  FOR l IN SELECT * FROM treatment_request_products WHERE treatment_request_id=v.id FOR UPDATE LOOP
    q := COALESCE(NULLIF(p_actual_quantities->>l.id::TEXT,'')::NUMERIC,l.planned_quantity);
    IF q<=0 THEN RAISE EXCEPTION 'Quantité réelle invalide'; END IF;
    SELECT current_qty INTO available FROM stock_items WHERE id=l.stock_item_id FOR UPDATE;
    IF available<q THEN RAISE EXCEPTION 'Stock insuffisant pour le produit %',l.stock_item_id; END IF;
    INSERT INTO stock_movements(stock_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,campaign_id,greenhouse_id,reference,notes,created_by,domain_id)
    SELECT l.stock_item_id,'sortie',q,si.unit_cost,q*si.unit_cost,CURRENT_DATE,cp.campaign_id,cp.greenhouse_id,'TRT-'||left(v.id::TEXT,8),'Sortie automatique après traitement approuvé',auth.uid(),v.domain_id
    FROM stock_items si JOIN campaign_plantings cp ON cp.id=v.campaign_planting_id WHERE si.id=l.stock_item_id RETURNING id INTO m_id;
    UPDATE stock_items SET current_qty=current_qty-q,updated_at=NOW() WHERE id=l.stock_item_id;
    UPDATE treatment_request_products SET actual_quantity=q WHERE id=l.id;
  END LOOP;
  UPDATE treatment_requests SET status='executee',executed_by=auth.uid(),executed_at=NOW(),updated_at=NOW() WHERE id=v.id;
END $$;

CREATE OR REPLACE FUNCTION public.submit_stock_exit_request(p_stock_item_id UUID,p_quantity NUMERIC,p_requested_for DATE,p_reason TEXT,p_reference TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain UUID; v_id UUID;
BEGIN
  SELECT domain_id INTO v_domain FROM stock_items WHERE id=p_stock_item_id AND is_active;
  IF v_domain IS NULL OR NOT public.has_domain_permission(v_domain,auth.uid(),'stocks','create') THEN RAISE EXCEPTION 'Permission de demande refusée'; END IF;
  INSERT INTO stock_exit_requests(domain_id,stock_item_id,quantity,requested_for,reason,reference,requested_by)
  VALUES(v_domain,p_stock_item_id,p_quantity,p_requested_for,p_reason,NULLIF(p_reference,''),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_stock_exit_request(p_request_id UUID,p_approve BOOLEAN,p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v stock_exit_requests%ROWTYPE;
BEGIN
  SELECT * INTO v FROM stock_exit_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v.status<>'soumise' THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée'; END IF;
  IF v.requested_by=auth.uid() THEN RAISE EXCEPTION 'Le demandeur ne peut pas valider sa propre demande'; END IF;
  IF NOT public.is_domain_responsible(v.domain_id,auth.uid(),'stocks') THEN RAISE EXCEPTION 'Validation réservée au profil responsable'; END IF;
  IF p_approve THEN UPDATE stock_exit_requests SET status='approuvee',approved_by=auth.uid(),approved_at=NOW(),updated_at=NOW() WHERE id=v.id;
  ELSE
    IF NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Le motif de rejet est obligatoire'; END IF;
    UPDATE stock_exit_requests SET status='rejetee',rejected_by=auth.uid(),rejected_at=NOW(),rejection_reason=p_reason,updated_at=NOW() WHERE id=v.id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.execute_stock_exit_request(p_request_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v stock_exit_requests%ROWTYPE; available NUMERIC; cost NUMERIC; m_id UUID;
BEGIN
  SELECT * INTO v FROM stock_exit_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v.status<>'approuvee' THEN RAISE EXCEPTION 'La sortie doit être approuvée avant exécution'; END IF;
  IF NOT public.has_domain_permission(v.domain_id,auth.uid(),'stocks','edit') THEN RAISE EXCEPTION 'Permission d’exécution refusée'; END IF;
  SELECT current_qty,unit_cost INTO available,cost FROM stock_items WHERE id=v.stock_item_id FOR UPDATE;
  IF available<v.quantity THEN RAISE EXCEPTION 'Stock insuffisant'; END IF;
  PERFORM set_config('app.approved_stock_exit','true',TRUE);
  INSERT INTO stock_movements(stock_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,campaign_id,greenhouse_id,reference,notes,created_by,domain_id)
  VALUES(v.stock_item_id,'sortie',v.quantity,cost,v.quantity*cost,v.requested_for,v.campaign_id,v.greenhouse_id,v.reference,'Sortie issue d’une demande approuvée',auth.uid(),v.domain_id) RETURNING id INTO m_id;
  UPDATE stock_items SET current_qty=current_qty-v.quantity,updated_at=NOW() WHERE id=v.stock_item_id;
  UPDATE stock_exit_requests SET status='executee',executed_by=auth.uid(),executed_at=NOW(),stock_movement_id=m_id,updated_at=NOW() WHERE id=v.id;
  RETURN m_id;
END $$;

-- Barrière base de données : aucune sortie directe ne contourne le workflow.
CREATE OR REPLACE FUNCTION public.guard_approved_stock_exit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.movement_type='sortie'
     AND COALESCE(current_setting('app.approved_stock_exit',TRUE),'false')<>'true' THEN
    RAISE EXCEPTION 'Une sortie de stock doit provenir d’une demande approuvée';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_approved_stock_exit ON public.stock_movements;
CREATE TRIGGER trg_guard_approved_stock_exit BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_approved_stock_exit();

-- Le chef d'exploitation est le responsable opérationnel par défaut.
INSERT INTO role_permissions(role_id,permission_id,granted)
SELECT r.id,p.id,TRUE FROM roles r JOIN permissions p ON p.code IN ('agronomie.admin','stocks.admin')
WHERE r.code='chef_exploitation' ON CONFLICT(role_id,permission_id) DO UPDATE SET granted=TRUE;

ALTER TABLE treatment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_request_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_exit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY treatment_requests_read ON treatment_requests FOR SELECT TO authenticated USING (is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY treatment_products_read ON treatment_request_products FOR SELECT TO authenticated USING (is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY stock_exit_requests_read ON stock_exit_requests FOR SELECT TO authenticated USING (is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));

REVOKE ALL ON FUNCTION submit_treatment_request(JSONB,JSONB),review_treatment_request(UUID,BOOLEAN,TEXT),execute_treatment_request(UUID,JSONB),submit_stock_exit_request(UUID,NUMERIC,DATE,TEXT,TEXT),review_stock_exit_request(UUID,BOOLEAN,TEXT),execute_stock_exit_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_treatment_request(JSONB,JSONB),review_treatment_request(UUID,BOOLEAN,TEXT),execute_treatment_request(UUID,JSONB),submit_stock_exit_request(UUID,NUMERIC,DATE,TEXT,TEXT),review_stock_exit_request(UUID,BOOLEAN,TEXT),execute_stock_exit_request(UUID) TO authenticated;

COMMIT;
