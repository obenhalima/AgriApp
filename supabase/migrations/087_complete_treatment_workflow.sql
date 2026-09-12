-- Migration 087 — Workflow complet de traitement phytosanitaire
BEGIN;

CREATE TABLE IF NOT EXISTS public.treatment_request_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_request_id UUID NOT NULL REFERENCES public.treatment_requests(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  campaign_planting_id UUID NOT NULL REFERENCES public.campaign_plantings(id) ON DELETE RESTRICT,
  treated_area_m2 NUMERIC(12,2) CHECK(treated_area_m2 IS NULL OR treated_area_m2>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(treatment_request_id,campaign_planting_id)
);

CREATE TABLE IF NOT EXISTS public.treatment_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_request_id UUID NOT NULL UNIQUE REFERENCES public.treatment_requests(id) ON DELETE RESTRICT,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  application_status VARCHAR(30) NOT NULL CHECK(application_status IN ('realisee','partielle','non_realisee')),
  actual_started_at TIMESTAMPTZ,
  actual_ended_at TIMESTAMPTZ,
  applicator_worker_id UUID REFERENCES public.workers(id) ON DELETE RESTRICT,
  applicator_team_id UUID REFERENCES public.teams(id) ON DELETE RESTRICT,
  confirmed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  temperature_c NUMERIC(5,2),
  humidity_pct NUMERIC(5,2) CHECK(humidity_pct IS NULL OR humidity_pct BETWEEN 0 AND 100),
  wind_notes TEXT,
  non_execution_reason TEXT,
  deviation_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(application_status='non_realisee' OR actual_started_at IS NOT NULL),
  CHECK(application_status<>'non_realisee' OR NULLIF(btrim(non_execution_reason),'') IS NOT NULL),
  CHECK(application_status='non_realisee' OR applicator_worker_id IS NOT NULL OR applicator_team_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.treatment_application_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES public.treatment_applications(id) ON DELETE CASCADE,
  request_product_id UUID NOT NULL REFERENCES public.treatment_request_products(id) ON DELETE RESTRICT,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  actual_quantity NUMERIC(12,4) NOT NULL CHECK(actual_quantity>0),
  stock_movement_id UUID NOT NULL UNIQUE REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id,request_product_id)
);

CREATE TABLE IF NOT EXISTS public.treatment_efficacy_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_request_id UUID NOT NULL REFERENCES public.treatment_requests(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL,
  checked_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  efficacy_pct NUMERIC(5,2) CHECK(efficacy_pct BETWEEN 0 AND 100),
  infestation_before VARCHAR(30),
  infestation_after VARCHAR(30),
  reinfection_observed BOOLEAN NOT NULL DEFAULT FALSE,
  corrective_action TEXT,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treatment_targets_request ON treatment_request_targets(treatment_request_id);
CREATE INDEX IF NOT EXISTS idx_treatment_applications_domain ON treatment_applications(domain_id,confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_efficacy_request ON treatment_efficacy_checks(treatment_request_id,checked_at DESC);

-- Reprise des demandes existantes : leur plantation historique devient la première cible.
INSERT INTO treatment_request_targets(treatment_request_id,domain_id,campaign_planting_id,treated_area_m2)
SELECT id,domain_id,campaign_planting_id,treated_area_m2 FROM treatment_requests
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_phyto_stock_projection(p_domain UUID)
RETURNS TABLE (
  stock_item_id UUID,
  domain_id UUID,
  plant_protection_product_id UUID,
  name VARCHAR,
  unit VARCHAR,
  current_qty NUMERIC,
  reserved_qty NUMERIC,
  projected_qty NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
  SELECT
    si.id,
    si.domain_id,
    si.plant_protection_product_id,
    si.name,
    si.unit,
    si.current_qty,
    COALESCE(sum(trp.planned_quantity) FILTER (WHERE tr.status IN ('soumise','approuvee')),0),
    si.current_qty-COALESCE(sum(trp.planned_quantity) FILTER (WHERE tr.status IN ('soumise','approuvee')),0)
  FROM stock_items si
  LEFT JOIN treatment_request_products trp ON trp.stock_item_id=si.id
  LEFT JOIN treatment_requests tr ON tr.id=trp.treatment_request_id
  WHERE si.domain_id=p_domain
    AND si.category='phytosanitaires'
    AND si.is_active
    AND (public.is_platform_admin(auth.uid()) OR public.is_domain_member(si.domain_id,auth.uid()))
  GROUP BY si.id,si.domain_id,si.plant_protection_product_id,si.name,si.unit,si.current_qty
  ORDER BY si.name
$$;

REVOKE ALL ON FUNCTION public.get_phyto_stock_projection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_phyto_stock_projection(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_treatment_request(p_request JSONB,p_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID; v_domain UUID; v_line JSONB; v_target JSONB; v_item_domain UUID; v_target_domain UUID; v_first UUID;
BEGIN
  v_domain:=(p_request->>'domain_id')::UUID;
  IF NOT has_domain_permission(v_domain,auth.uid(),'agronomie','create')
     AND NOT has_business_capability(v_domain,auth.uid(),'treatment.prescribe',NULL) THEN
    RAISE EXCEPTION 'Habilitation de prescription refusée';
  END IF;
  IF jsonb_array_length(COALESCE(p_request->'target_planting_ids','[]'::JSONB))=0 THEN RAISE EXCEPTION 'Au moins une serre est obligatoire'; END IF;
  IF jsonb_array_length(COALESCE(p_products,'[]'::JSONB))=0 THEN RAISE EXCEPTION 'Au moins un produit est obligatoire'; END IF;
  v_first:=(p_request->'target_planting_ids'->>0)::UUID;
  FOR v_target IN SELECT value FROM jsonb_array_elements(p_request->'target_planting_ids') LOOP
    SELECT domain_id INTO v_target_domain FROM campaign_plantings WHERE id=(v_target#>>'{}')::UUID;
    IF v_target_domain IS DISTINCT FROM v_domain THEN RAISE EXCEPTION 'Plantation hors de la société active'; END IF;
  END LOOP;
  INSERT INTO treatment_requests(domain_id,campaign_planting_id,planned_at,target_name,diagnosis,justification,treated_area_m2,water_volume_liters,temperature_c,humidity_pct,requested_by,notes)
  VALUES(v_domain,v_first,(p_request->>'planned_at')::TIMESTAMPTZ,p_request->>'target_name',p_request->>'diagnosis',p_request->>'justification',(p_request->>'treated_area_m2')::NUMERIC,NULLIF(p_request->>'water_volume_liters','')::NUMERIC,NULLIF(p_request->>'temperature_c','')::NUMERIC,NULLIF(p_request->>'humidity_pct','')::NUMERIC,auth.uid(),NULLIF(p_request->>'notes','')) RETURNING id INTO v_id;
  FOR v_target IN SELECT value FROM jsonb_array_elements(p_request->'target_planting_ids') LOOP
    INSERT INTO treatment_request_targets(treatment_request_id,domain_id,campaign_planting_id)
    VALUES(v_id,v_domain,(v_target#>>'{}')::UUID);
  END LOOP;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_products) LOOP
    SELECT domain_id INTO v_item_domain FROM stock_items WHERE id=(v_line->>'stock_item_id')::UUID AND is_active;
    IF v_item_domain IS DISTINCT FROM v_domain THEN RAISE EXCEPTION 'Produit de stock hors société ou inactif'; END IF;
    INSERT INTO treatment_request_products(treatment_request_id,domain_id,stock_item_id,dose,dose_unit,planned_quantity,phi_days,rei_hours,label_confirmed)
    VALUES(v_id,v_domain,(v_line->>'stock_item_id')::UUID,(v_line->>'dose')::NUMERIC,v_line->>'dose_unit',(v_line->>'planned_quantity')::NUMERIC,COALESCE((v_line->>'phi_days')::INTEGER,0),COALESCE((v_line->>'rei_hours')::INTEGER,0),COALESCE((v_line->>'label_confirmed')::BOOLEAN,FALSE));
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_treatment_application(p_request UUID,p_application JSONB,p_actual_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v treatment_requests%ROWTYPE; v_app UUID; v_status TEXT; v_line JSONB; l treatment_request_products%ROWTYPE; v_qty NUMERIC; v_available NUMERIC; v_cost NUMERIC; v_move UUID; v_campaign UUID; v_applicator_domain UUID;
BEGIN
  SELECT * INTO v FROM treatment_requests WHERE id=p_request FOR UPDATE;
  IF NOT FOUND OR v.status<>'approuvee' THEN RAISE EXCEPTION 'Le traitement doit être approuvé avant confirmation'; END IF;
  IF NOT has_business_capability(v.domain_id,auth.uid(),'treatment.confirm_application',NULL) THEN RAISE EXCEPTION 'Habilitation de confirmation requise'; END IF;
  v_status:=p_application->>'application_status';
  IF v_status NOT IN ('realisee','partielle','non_realisee') THEN RAISE EXCEPTION 'Statut de réalisation invalide'; END IF;
  IF v_status='non_realisee' THEN
    INSERT INTO treatment_applications(treatment_request_id,domain_id,application_status,confirmed_by,non_execution_reason,notes)
    VALUES(v.id,v.domain_id,v_status,auth.uid(),NULLIF(p_application->>'non_execution_reason',''),NULLIF(p_application->>'notes','')) RETURNING id INTO v_app;
    UPDATE treatment_requests SET status='annulee',executed_by=auth.uid(),executed_at=NOW(),notes=concat_ws(E'\n',notes,'Non réalisé : '||(p_application->>'non_execution_reason')),updated_at=NOW() WHERE id=v.id;
    RETURN v_app;
  END IF;
  IF NULLIF(p_application->>'applicator_worker_id','') IS NULL AND NULLIF(p_application->>'applicator_team_id','') IS NULL THEN RAISE EXCEPTION 'Applicateur ou équipe obligatoire'; END IF;
  IF NULLIF(p_application->>'applicator_worker_id','') IS NOT NULL THEN
    SELECT f.domain_id INTO v_applicator_domain FROM workers w JOIN teams t ON t.id=w.team_id JOIN farms f ON f.id=t.farm_id
    WHERE w.id=(p_application->>'applicator_worker_id')::UUID AND w.is_active;
    IF v_applicator_domain IS DISTINCT FROM v.domain_id THEN RAISE EXCEPTION 'Applicateur hors de la société active ou sans équipe'; END IF;
  END IF;
  IF NULLIF(p_application->>'applicator_team_id','') IS NOT NULL THEN
    SELECT f.domain_id INTO v_applicator_domain FROM teams t JOIN farms f ON f.id=t.farm_id
    WHERE t.id=(p_application->>'applicator_team_id')::UUID;
    IF v_applicator_domain IS DISTINCT FROM v.domain_id THEN RAISE EXCEPTION 'Équipe hors de la société active'; END IF;
  END IF;
  IF jsonb_array_length(COALESCE(p_actual_products,'[]'::JSONB))=0 THEN RAISE EXCEPTION 'Quantités réelles obligatoires'; END IF;
  SELECT cp.campaign_id INTO v_campaign FROM campaign_plantings cp WHERE cp.id=v.campaign_planting_id;
  INSERT INTO treatment_applications(treatment_request_id,domain_id,application_status,actual_started_at,actual_ended_at,applicator_worker_id,applicator_team_id,confirmed_by,temperature_c,humidity_pct,wind_notes,deviation_notes,notes)
  VALUES(v.id,v.domain_id,v_status,(p_application->>'actual_started_at')::TIMESTAMPTZ,NULLIF(p_application->>'actual_ended_at','')::TIMESTAMPTZ,NULLIF(p_application->>'applicator_worker_id','')::UUID,NULLIF(p_application->>'applicator_team_id','')::UUID,auth.uid(),NULLIF(p_application->>'temperature_c','')::NUMERIC,NULLIF(p_application->>'humidity_pct','')::NUMERIC,NULLIF(p_application->>'wind_notes',''),NULLIF(p_application->>'deviation_notes',''),NULLIF(p_application->>'notes','')) RETURNING id INTO v_app;
  PERFORM set_config('app.approved_stock_exit','true',TRUE);
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_actual_products) LOOP
    SELECT * INTO l FROM treatment_request_products WHERE id=(v_line->>'request_product_id')::UUID AND treatment_request_id=v.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit non prévu dans la demande'; END IF;
    v_qty:=(v_line->>'actual_quantity')::NUMERIC;
    SELECT current_qty,unit_cost INTO v_available,v_cost FROM stock_items WHERE id=l.stock_item_id FOR UPDATE;
    IF v_qty<=0 OR v_available<v_qty THEN RAISE EXCEPTION 'Quantité réelle invalide ou stock insuffisant pour %',l.stock_item_id; END IF;
    INSERT INTO stock_movements(stock_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,campaign_id,greenhouse_id,reference,notes,created_by,domain_id)
    VALUES(l.stock_item_id,'sortie',v_qty,v_cost,v_qty*v_cost,((p_application->>'actual_started_at')::TIMESTAMPTZ)::DATE,v_campaign,NULL,'TRT-'||left(v.id::TEXT,8),'Sortie confirmée par le responsable phytosanitaire',auth.uid(),v.domain_id) RETURNING id INTO v_move;
    UPDATE stock_items SET current_qty=current_qty-v_qty,updated_at=NOW() WHERE id=l.stock_item_id;
    UPDATE treatment_request_products SET actual_quantity=v_qty WHERE id=l.id;
    INSERT INTO treatment_application_products(application_id,request_product_id,domain_id,actual_quantity,stock_movement_id)
    VALUES(v_app,l.id,v.domain_id,v_qty,v_move);
  END LOOP;
  UPDATE treatment_requests SET status='executee',executed_by=auth.uid(),executed_at=NOW(),updated_at=NOW() WHERE id=v.id;
  RETURN v_app;
END $$;

CREATE OR REPLACE FUNCTION public.record_treatment_efficacy(p_request UUID,p_check JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain UUID; v_id UUID;
BEGIN
  SELECT domain_id INTO v_domain FROM treatment_requests WHERE id=p_request AND status='executee';
  IF v_domain IS NULL THEN RAISE EXCEPTION 'Traitement exécuté introuvable'; END IF;
  IF NOT has_business_capability(v_domain,auth.uid(),'treatment.confirm_application',NULL) THEN RAISE EXCEPTION 'Habilitation de contrôle requise'; END IF;
  INSERT INTO treatment_efficacy_checks(treatment_request_id,domain_id,checked_at,checked_by,efficacy_pct,infestation_before,infestation_after,reinfection_observed,corrective_action,observations)
  VALUES(p_request,v_domain,(p_check->>'checked_at')::TIMESTAMPTZ,auth.uid(),NULLIF(p_check->>'efficacy_pct','')::NUMERIC,NULLIF(p_check->>'infestation_before',''),NULLIF(p_check->>'infestation_after',''),COALESCE((p_check->>'reinfection_observed')::BOOLEAN,FALSE),NULLIF(p_check->>'corrective_action',''),NULLIF(p_check->>'observations','')) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

ALTER TABLE treatment_request_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_application_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_efficacy_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS treatment_targets_read ON treatment_request_targets;
DROP POLICY IF EXISTS treatment_applications_read ON treatment_applications;
DROP POLICY IF EXISTS treatment_application_products_read ON treatment_application_products;
DROP POLICY IF EXISTS treatment_efficacy_read ON treatment_efficacy_checks;
CREATE POLICY treatment_targets_read ON treatment_request_targets FOR SELECT TO authenticated USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY treatment_applications_read ON treatment_applications FOR SELECT TO authenticated USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY treatment_application_products_read ON treatment_application_products FOR SELECT TO authenticated USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY treatment_efficacy_read ON treatment_efficacy_checks FOR SELECT TO authenticated USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));

REVOKE ALL ON FUNCTION confirm_treatment_application(UUID,JSONB,JSONB),record_treatment_efficacy(UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION confirm_treatment_application(UUID,JSONB,JSONB),record_treatment_efficacy(UUID,JSONB) TO authenticated;

COMMIT;
