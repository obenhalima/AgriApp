-- 107A — Prévision par occurrence. Prérequis : 106B.
BEGIN;
ALTER TABLE public.treatment_requests ADD COLUMN warehouse_id UUID REFERENCES public.warehouses(id);
UPDATE public.treatment_requests t SET warehouse_id=w.id FROM public.warehouses w
WHERE w.domain_id=t.domain_id AND w.is_default AND w.is_active;
CREATE FUNCTION public.guard_treatment_warehouse() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.warehouse_id IS NULL THEN
  SELECT id INTO NEW.warehouse_id FROM warehouses WHERE domain_id=NEW.domain_id AND is_default AND is_active;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=NEW.warehouse_id AND domain_id=NEW.domain_id AND is_active)
 THEN RAISE EXCEPTION 'Sélectionner un entrepôt actif appartenant au client'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_treatment_warehouse BEFORE INSERT OR UPDATE OF warehouse_id,domain_id
ON public.treatment_requests FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_warehouse();

-- Les lignes identiques d'une même occurrence sont regroupées avant cumul.
-- Les demandes soumises et approuvées consomment la prévision, par date puis création.
-- Il s'agit d'une allocation prévisionnelle : aucun mouvement physique n'est créé.
CREATE VIEW public.v_treatment_stock_forecast WITH (security_invoker=TRUE) AS
WITH demand AS (
 SELECT t.domain_id,t.id AS request_id,t.schedule_id,t.occurrence_number,t.warehouse_id,
 t.planned_at,t.created_at,p.stock_item_id,sum(p.planned_quantity) AS required
 FROM treatment_requests t JOIN treatment_request_products p ON p.treatment_request_id=t.id
 LEFT JOIN treatment_prescription_schedules s ON s.id=t.schedule_id
 LEFT JOIN treatment_schedule_occurrences o ON o.treatment_request_id=t.id
 WHERE t.status IN ('soumise','approuvee')
 AND (s.id IS NULL OR s.status='active') AND (o.id IS NULL OR o.status<>'cancelled')
 GROUP BY t.id,p.stock_item_id
), running AS (
 SELECT d.*,COALESCE(sum(required) OVER (
 PARTITION BY domain_id,warehouse_id,stock_item_id ORDER BY planned_at,created_at,request_id
 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS previous_required FROM demand d
), availability AS (
 SELECT d.*,i.name,i.unit,
 GREATEST(COALESCE(b.current_qty,0)-previous_required,0) AS available
 FROM running d JOIN stock_items i ON i.id=d.stock_item_id
 LEFT JOIN warehouse_stocks b ON b.warehouse_id=d.warehouse_id AND b.stock_item_id=d.stock_item_id AND b.domain_id=d.domain_id
)
SELECT domain_id,request_id,schedule_id,occurrence_number,warehouse_id,planned_at,
 CASE WHEN bool_and(available>=required) THEN 'disponible'
      WHEN bool_or(available>0) THEN 'partiel' ELSE 'non_disponible' END AS stock_status,
 COALESCE(jsonb_agg(jsonb_build_object('stock_item_id',stock_item_id,'product',name,'unit',unit,
 'required',required,'available',available,'missing',GREATEST(required-available,0)))
 FILTER(WHERE required>available),'[]'::JSONB) AS shortages
FROM availability GROUP BY domain_id,request_id,schedule_id,occurrence_number,warehouse_id,planned_at;
REVOKE ALL ON public.v_treatment_stock_forecast FROM PUBLIC,authenticated;
CREATE FUNCTION public.get_treatment_stock_forecast(p_domain UUID)
RETURNS SETOF public.v_treatment_stock_forecast LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT COALESCE(has_domain_permission(p_domain,auth.uid(),'agronomie','view'),FALSE)
 THEN RAISE EXCEPTION 'Client inaccessible'; END IF;
 RETURN QUERY SELECT * FROM v_treatment_stock_forecast WHERE domain_id=p_domain;
END $$;
REVOKE ALL ON FUNCTION public.get_treatment_stock_forecast(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_treatment_stock_forecast(UUID) TO authenticated;

-- Les RPC de prescription et confirmation sont redéfinies ci-dessous
-- en conservant les contrôles agronomiques existants.
CREATE OR REPLACE FUNCTION public.submit_treatment_request(p_request JSONB,p_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID; v_domain UUID; v_line JSONB; v_target JSONB; v_item_domain UUID; v_target_domain UUID; v_first UUID;
BEGIN
  v_domain:=(p_request->>'domain_id')::UUID;
  IF NOT has_domain_permission(v_domain,auth.uid(),'agronomie','create')
     AND NOT has_business_capability(v_domain,auth.uid(),'treatment.prescribe',NULL) THEN RAISE EXCEPTION 'Habilitation de prescription refusée'; END IF;
  IF jsonb_array_length(COALESCE(p_request->'target_planting_ids','[]'::JSONB))=0 THEN RAISE EXCEPTION 'Au moins une serre est obligatoire'; END IF;
  IF jsonb_array_length(COALESCE(p_products,'[]'::JSONB))=0 THEN RAISE EXCEPTION 'Au moins un produit est obligatoire'; END IF;
  v_first:=(p_request->'target_planting_ids'->>0)::UUID;
  FOR v_target IN SELECT value FROM jsonb_array_elements(p_request->'target_planting_ids') LOOP
    SELECT domain_id INTO v_target_domain FROM campaign_plantings WHERE id=(v_target#>>'{}')::UUID;
    IF v_target_domain IS DISTINCT FROM v_domain THEN RAISE EXCEPTION 'Plantation hors de la société active'; END IF;
  END LOOP;
  INSERT INTO treatment_requests(domain_id,warehouse_id,campaign_planting_id,planned_at,target_name,diagnosis,justification,treated_area_m2,water_volume_liters,temperature_c,humidity_pct,requested_by,notes)
  VALUES(v_domain,NULLIF(p_request->>'warehouse_id','')::UUID,v_first,(p_request->>'planned_at')::TIMESTAMPTZ,p_request->>'target_name',p_request->>'diagnosis',p_request->>'justification',(p_request->>'treated_area_m2')::NUMERIC,NULLIF(p_request->>'water_volume_liters','')::NUMERIC,NULLIF(p_request->>'temperature_c','')::NUMERIC,NULLIF(p_request->>'humidity_pct','')::NUMERIC,auth.uid(),NULLIF(p_request->>'notes','')) RETURNING id INTO v_id;
  FOR v_target IN SELECT value FROM jsonb_array_elements(p_request->'target_planting_ids') LOOP
    INSERT INTO treatment_request_targets(treatment_request_id,domain_id,campaign_planting_id) VALUES(v_id,v_domain,(v_target#>>'{}')::UUID);
  END LOOP;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_products) LOOP
    SELECT domain_id INTO v_item_domain FROM stock_items WHERE id=(v_line->>'stock_item_id')::UUID AND is_active;
    IF v_item_domain IS DISTINCT FROM v_domain THEN RAISE EXCEPTION 'Produit de stock hors société ou inactif'; END IF;
    INSERT INTO treatment_request_products(treatment_request_id,domain_id,stock_item_id,dose,dose_unit,planned_quantity,calculated_quantity,quantity_is_manual,quantity_override_justification,phi_days,rei_hours,label_confirmed)
    VALUES(v_id,v_domain,(v_line->>'stock_item_id')::UUID,(v_line->>'dose')::NUMERIC,v_line->>'dose_unit',(v_line->>'planned_quantity')::NUMERIC,NULLIF(v_line->>'calculated_quantity','')::NUMERIC,COALESCE((v_line->>'quantity_is_manual')::BOOLEAN,FALSE),NULLIF(v_line->>'quantity_override_justification',''),COALESCE((v_line->>'phi_days')::INTEGER,0),COALESCE((v_line->>'rei_hours')::INTEGER,0),COALESCE((v_line->>'label_confirmed')::BOOLEAN,FALSE));
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_treatment_application(p_request UUID,p_application JSONB,p_actual_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v treatment_requests%ROWTYPE; v_app UUID; v_status TEXT; v_line JSONB;
  l treatment_request_products%ROWTYPE; v_qty NUMERIC; v_calculated NUMERIC;
  v_available NUMERIC; v_cost NUMERIC; v_move UUID; v_campaign UUID; v_applicator_domain UUID;
  v_area NUMERIC; v_water NUMERIC; v_l_ha NUMERIC; v_source_unit TEXT; v_stock_unit TEXT;
  v_manual BOOLEAN; v_manual_reason TEXT;
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
    SELECT f.domain_id INTO v_applicator_domain FROM workers w JOIN teams t ON t.id=w.team_id JOIN farms f ON f.id=t.farm_id WHERE w.id=(p_application->>'applicator_worker_id')::UUID AND w.is_active;
    IF v_applicator_domain IS DISTINCT FROM v.domain_id THEN RAISE EXCEPTION 'Applicateur hors de la société active ou sans équipe'; END IF;
  END IF;
  v_area:=NULLIF(p_application->>'actual_treated_area_m2','')::NUMERIC;
  v_water:=NULLIF(p_application->>'actual_water_volume_liters','')::NUMERIC;
  IF v_area IS NULL OR v_area<=0 OR v_water IS NULL OR v_water<=0 THEN RAISE EXCEPTION 'Surface réelle et volume réel de bouillie obligatoires'; END IF;
  v_l_ha:=round(v_water/(v_area/10000),2);
  IF jsonb_array_length(COALESCE(p_actual_products,'[]'::JSONB))=0 THEN RAISE EXCEPTION 'Quantités réelles obligatoires'; END IF;
  SELECT cp.campaign_id INTO v_campaign FROM campaign_plantings cp WHERE cp.id=v.campaign_planting_id;
  INSERT INTO treatment_applications(treatment_request_id,domain_id,application_status,actual_started_at,actual_ended_at,applicator_worker_id,applicator_team_id,confirmed_by,temperature_c,humidity_pct,wind_notes,deviation_notes,notes,actual_treated_area_m2,actual_water_volume_liters,actual_spray_volume_l_ha)
  VALUES(v.id,v.domain_id,v_status,(p_application->>'actual_started_at')::TIMESTAMPTZ,NULLIF(p_application->>'actual_ended_at','')::TIMESTAMPTZ,NULLIF(p_application->>'applicator_worker_id','')::UUID,NULLIF(p_application->>'applicator_team_id','')::UUID,auth.uid(),NULLIF(p_application->>'temperature_c','')::NUMERIC,NULLIF(p_application->>'humidity_pct','')::NUMERIC,NULLIF(p_application->>'wind_notes',''),NULLIF(p_application->>'deviation_notes',''),NULLIF(p_application->>'notes',''),v_area,v_water,v_l_ha) RETURNING id INTO v_app;
  PERFORM set_config('app.approved_stock_exit','true',TRUE);
  IF (SELECT count(*) FROM jsonb_array_elements(p_actual_products))<>(SELECT count(*) FROM treatment_request_products WHERE treatment_request_id=v.id)
     OR (SELECT count(DISTINCT value->>'request_product_id') FROM jsonb_array_elements(p_actual_products))<>(SELECT count(*) FROM treatment_request_products WHERE treatment_request_id=v.id)
  THEN RAISE EXCEPTION 'Confirmer chaque produit prévu exactement une fois'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_actual_products) ORDER BY value->>'request_product_id' LOOP
    SELECT * INTO l FROM treatment_request_products WHERE id=(v_line->>'request_product_id')::UUID AND treatment_request_id=v.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit non prévu dans la demande'; END IF;
    SELECT unit_cost,lower(unit) INTO v_cost,v_stock_unit FROM stock_items WHERE id=l.stock_item_id FOR UPDATE;
    SELECT COALESCE((SELECT current_qty FROM warehouse_stocks WHERE warehouse_id=v.warehouse_id AND stock_item_id=l.stock_item_id),0) INTO v_available;
    -- Préserver les besoins des occurrences antérieures encore à réaliser.
    SELECT GREATEST(v_available-COALESCE(sum(p.planned_quantity),0),0) INTO v_available
    FROM treatment_requests t JOIN treatment_request_products p ON p.treatment_request_id=t.id
    LEFT JOIN treatment_prescription_schedules s ON s.id=t.schedule_id
    LEFT JOIN treatment_schedule_occurrences o ON o.treatment_request_id=t.id
    WHERE t.domain_id=v.domain_id AND t.warehouse_id=v.warehouse_id AND p.stock_item_id=l.stock_item_id
      AND t.status IN ('soumise','approuvee') AND (s.id IS NULL OR s.status='active')
      AND (o.id IS NULL OR o.status<>'cancelled')
      AND (t.planned_at,t.created_at,t.id)<(v.planned_at,v.created_at,v.id);
    v_source_unit:=lower(l.dose_unit); v_calculated:=NULL;
    IF v_source_unit IN ('ml_100l','g_100l') THEN v_calculated:=l.dose*v_water/100;
    ELSIF v_source_unit IN ('l_ha','kg_ha','ml_ha','g_ha','unite_ha') THEN v_calculated:=l.dose*v_area/10000;
    ELSIF v_source_unit IN ('l_1000m2','kg_1000m2') THEN v_calculated:=l.dose*v_area/1000;
    ELSE RAISE EXCEPTION 'Unité de dose non calculable : %',l.dose_unit; END IF;
    IF v_source_unit LIKE 'ml_%' AND v_stock_unit IN ('l','litre','litres') THEN v_calculated:=v_calculated/1000; END IF;
    IF v_source_unit LIKE 'g_%' AND v_stock_unit IN ('kg','kilogramme','kilogrammes') THEN v_calculated:=v_calculated/1000; END IF;
    v_calculated:=round(v_calculated,4);
    v_manual:=COALESCE((v_line->>'quantity_is_manual')::BOOLEAN,FALSE);
    v_manual_reason:=NULLIF(btrim(v_line->>'quantity_override_justification'),'');
    v_qty:=CASE WHEN v_manual THEN NULLIF(v_line->>'actual_quantity','')::NUMERIC ELSE v_calculated END;
    IF v_manual AND v_manual_reason IS NULL THEN RAISE EXCEPTION 'Justification obligatoire pour modifier une quantité réelle'; END IF;
    IF v_qty IS NULL OR v_qty<=0 OR v_available<v_qty THEN RAISE EXCEPTION 'Quantité invalide ou stock insuffisant après prise en compte des occurrences antérieures pour %',l.stock_item_id; END IF;
    INSERT INTO stock_movements(stock_item_id,warehouse_id,movement_type,quantity,unit_cost,total_cost,movement_date,campaign_id,greenhouse_id,reference,notes,created_by,domain_id)
    VALUES(l.stock_item_id,v.warehouse_id,'sortie',v_qty,v_cost,v_qty*v_cost,((p_application->>'actual_started_at')::TIMESTAMPTZ)::DATE,v_campaign,NULL,'TRT-'||left(v.id::TEXT,8),'Sortie réelle confirmée par le responsable phytosanitaire',auth.uid(),v.domain_id) RETURNING id INTO v_move;
    UPDATE stock_items SET current_qty=current_qty-v_qty,updated_at=NOW() WHERE id=l.stock_item_id;
    UPDATE treatment_request_products SET actual_quantity=v_qty WHERE id=l.id;
    INSERT INTO treatment_application_products(application_id,request_product_id,domain_id,actual_quantity,calculated_actual_quantity,quantity_is_manual,quantity_override_justification,stock_movement_id)
    VALUES(v_app,l.id,v.domain_id,v_qty,v_calculated,v_manual,v_manual_reason,v_move);
  END LOOP;
  UPDATE treatment_requests SET status='executee',executed_by=auth.uid(),executed_at=NOW(),updated_at=NOW() WHERE id=v.id;
  RETURN v_app;
END $$;
-- L'ancien point d'entrée ne gérait ni entrepôt ni confirmation réelle.
REVOKE ALL ON FUNCTION public.execute_treatment_request(UUID,JSONB) FROM PUBLIC,authenticated;
COMMIT;
