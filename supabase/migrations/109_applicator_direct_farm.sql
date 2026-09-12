-- 109 : applicateur via ferme directe, équipe uniquement en secours.
-- Prérequis : 107B. Les contrôles stock/conformité et les triggers 108 sont conservés.
BEGIN;
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
    SELECT f.domain_id INTO v_applicator_domain FROM workers w LEFT JOIN teams t ON t.id=w.team_id JOIN farms f ON f.id=COALESCE(w.farm_id,t.farm_id) WHERE w.id=(p_application->>'applicator_worker_id')::UUID AND w.is_active;
    IF v_applicator_domain IS DISTINCT FROM v.domain_id THEN RAISE EXCEPTION 'Employé inactif ou sans ferme rattachée à la société active'; END IF;
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
    v_calculated:=convert_treatment_quantity(v_calculated,split_part(v_source_unit,'_',1),v_stock_unit);
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
REVOKE ALL ON FUNCTION public.confirm_treatment_application(UUID,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_treatment_application(UUID,JSONB,JSONB) TO authenticated;
COMMIT;

