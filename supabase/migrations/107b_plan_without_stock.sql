-- 107B — Planification sans article ni quantité disponible. Prérequis : 107A.
BEGIN;
ALTER TABLE public.treatment_request_products
 ADD COLUMN catalog_product_id UUID REFERENCES public.plant_protection_products(id),
 ADD COLUMN product_name TEXT,
 ADD COLUMN quantity_unit TEXT;
UPDATE public.treatment_request_products p SET catalog_product_id=s.plant_protection_product_id,
 product_name=s.name,quantity_unit=s.unit FROM public.stock_items s WHERE s.id=p.stock_item_id;
ALTER TABLE public.treatment_request_products ALTER COLUMN stock_item_id DROP NOT NULL;

-- Les contrôles réglementaires sont effectués à la réalisation, pas à la planification.
DROP TRIGGER IF EXISTS trg_require_phyto_safety ON public.treatment_request_products;

CREATE FUNCTION public.treatment_planning_use(p_product UUID,p_domain UUID,p_target TEXT)
RETURNS public.product_authorized_uses LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT u FROM product_authorized_uses u
 WHERE u.product_id=p_product AND u.domain_id=p_domain
 AND lower(u.crop_name)='tomate'
 AND (
  normalize_positive_list_key(u.target_name)=normalize_positive_list_key(p_target)
  OR EXISTS(SELECT 1 FROM v_active_station_phyto_products e WHERE e.domain_id=p_domain
    AND e.product_id=p_product AND e.authorized_use_id=u.id
    AND normalize_positive_list_key(e.target_name)=normalize_positive_list_key(p_target))
 )
 AND (u.is_active OR EXISTS(SELECT 1 FROM v_active_station_phyto_products e
   WHERE e.domain_id=p_domain AND e.product_id=p_product AND e.authorized_use_id=u.id
   AND normalize_positive_list_key(e.target_name)=normalize_positive_list_key(p_target)))
 ORDER BY u.is_active DESC,u.created_at,u.id LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.treatment_planning_use(UUID,UUID,TEXT) FROM PUBLIC;

CREATE FUNCTION public.convert_treatment_quantity(q NUMERIC,source TEXT,target TEXT)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a TEXT:=lower(trim(source)); b TEXT:=lower(trim(target));
BEGIN
 a:=CASE WHEN a IN ('litre','litres') THEN 'l' WHEN a IN ('kilogramme','kilogrammes') THEN 'kg' WHEN a IN ('gramme','grammes') THEN 'g' WHEN a IN ('millilitre','millilitres') THEN 'ml' WHEN a IN ('unité','unités','piece','pièce','pièces') THEN 'unite' ELSE a END;
 b:=CASE WHEN b IN ('litre','litres') THEN 'l' WHEN b IN ('kilogramme','kilogrammes') THEN 'kg' WHEN b IN ('gramme','grammes') THEN 'g' WHEN b IN ('millilitre','millilitres') THEN 'ml' WHEN b IN ('unité','unités','piece','pièce','pièces') THEN 'unite' ELSE b END;
 IF a IS NULL OR b IS NULL OR a NOT IN ('ml','l','g','kg','unite') THEN RAISE EXCEPTION 'Unité de quantité inconnue'; END IF;
 IF a=b THEN RETURN round(q,4);
 ELSIF (a='ml' AND b='l') OR (a='g' AND b='kg') THEN RETURN round(q/1000,4);
 ELSIF (a='l' AND b='ml') OR (a='kg' AND b='g') THEN RETURN round(q*1000,4);
 ELSE RAISE EXCEPTION 'Unités incompatibles : % / %',source,target; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.guard_treatment_product_dose_and_quantity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_area NUMERIC; v_water NUMERIC; v_product UUID; v_stock_unit TEXT;
  v_use product_authorized_uses%ROWTYPE; v_qty NUMERIC; v_source_unit TEXT;
  v_unit TEXT; v_authorized_unit TEXT; v_target TEXT; v_domain UUID; v_name TEXT;
BEGIN
  SELECT treated_area_m2,water_volume_liters,target_name,domain_id INTO v_area,v_water,v_target,v_domain
  FROM treatment_requests WHERE id=NEW.treatment_request_id;
  IF v_domain IS DISTINCT FROM NEW.domain_id THEN RAISE EXCEPTION 'Prescription hors client'; END IF;
  IF NEW.stock_item_id IS NOT NULL THEN
    SELECT plant_protection_product_id,lower(trim(unit)) INTO v_product,v_stock_unit
    FROM stock_items WHERE id=NEW.stock_item_id AND domain_id=NEW.domain_id AND is_active;
    IF v_product IS NULL OR (NEW.catalog_product_id IS NOT NULL AND NEW.catalog_product_id<>v_product)
    THEN RAISE EXCEPTION 'Article incompatible avec le produit ou le client'; END IF;
    NEW.catalog_product_id:=v_product;
  ELSE
    v_product:=NEW.catalog_product_id;
  END IF;
  SELECT commercial_name INTO v_name FROM plant_protection_products
  WHERE id=v_product AND domain_id=NEW.domain_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produit du référentiel absent, inactif ou hors client'; END IF;
  NEW.product_name:=v_name;
  IF EXISTS(SELECT 1 FROM phyto_positive_lists WHERE domain_id=NEW.domain_id AND status='active')
   AND NOT EXISTS(SELECT 1 FROM v_active_station_phyto_products e WHERE e.domain_id=NEW.domain_id
     AND e.product_id=v_product AND normalize_positive_list_key(e.target_name)=normalize_positive_list_key(v_target))
  THEN RAISE EXCEPTION 'Produit non lié à la cible dans la liste Station active'; END IF;
  SELECT * INTO v_use FROM treatment_planning_use(v_product,NEW.domain_id,v_target);
  IF v_use.id IS NULL THEN RAISE EXCEPTION 'Usage et dose pour cette cible à compléter'; END IF;
  v_unit:=public.normalize_phyto_dose_unit(NEW.dose_unit);
  v_authorized_unit:=public.normalize_phyto_dose_unit(v_use.dose_unit);
  IF v_unit<>v_authorized_unit THEN
    RAISE EXCEPTION 'Unité de dose incompatible : prescription=% ; usage autorisé=%',NEW.dose_unit,v_use.dose_unit;
  END IF;
  NEW.dose_unit:=v_unit;
  IF NEW.dose>v_use.dose_max OR (v_use.dose_min IS NOT NULL AND NEW.dose<v_use.dose_min) THEN
    RAISE EXCEPTION 'Dose hors intervalle autorisé (% à % %)',COALESCE(v_use.dose_min,v_use.dose_max),v_use.dose_max,v_authorized_unit;
  END IF;
  IF v_area IS NULL OR v_area<=0 THEN RAISE EXCEPTION 'Surface traitée invalide'; END IF;
  IF v_unit IN ('ml_100l','g_100l') AND (v_water IS NULL OR v_water<=0) THEN RAISE EXCEPTION 'Volume de bouillie obligatoire pour une dose par 100 L'; END IF;

  v_source_unit:=CASE
    WHEN v_unit='ml_100l' THEN 'ml' WHEN v_unit='g_100l' THEN 'g'
    WHEN v_unit IN ('l_ha','l_1000m2') THEN 'l'
    WHEN v_unit IN ('kg_ha','kg_1000m2') THEN 'kg'
    WHEN v_unit='ml_ha' THEN 'ml' WHEN v_unit='g_ha' THEN 'g'
    WHEN v_unit='unite_ha' THEN 'unite' ELSE NULL END;
  v_qty:=CASE
    WHEN v_unit IN ('ml_100l','g_100l') THEN NEW.dose*v_water/100
    WHEN v_unit IN ('l_ha','kg_ha','ml_ha','g_ha','unite_ha') THEN NEW.dose*v_area/10000
    WHEN v_unit IN ('l_1000m2','kg_1000m2') THEN NEW.dose*v_area/1000 END;

  v_stock_unit:=COALESCE(v_stock_unit,v_source_unit);
  v_qty:=convert_treatment_quantity(v_qty,v_source_unit,v_stock_unit);
  NEW.quantity_unit:=v_stock_unit;
  NEW.calculated_quantity:=round(v_qty,4);
  IF NEW.quantity_is_manual THEN
    IF NEW.planned_quantity IS NULL OR NEW.planned_quantity<=0 THEN RAISE EXCEPTION 'La quantité manuelle doit être positive'; END IF;
    IF length(trim(COALESCE(NEW.quantity_override_justification,'')))<5 THEN RAISE EXCEPTION 'Justification obligatoire pour une quantité manuelle'; END IF;
  ELSE
    NEW.planned_quantity:=NEW.calculated_quantity;
    NEW.quantity_override_justification:=NULL;
  END IF;
  NEW.phi_days:=GREATEST(v_use.phi_days,NEW.phi_days);
  NEW.rei_hours:=GREATEST(v_use.rei_hours,NEW.rei_hours);
  RETURN NEW;
END $$;


DROP TRIGGER IF EXISTS trg_guard_treatment_product_dose ON public.treatment_request_products;
CREATE TRIGGER trg_guard_treatment_product_dose BEFORE INSERT OR UPDATE OF
 stock_item_id,catalog_product_id,domain_id,treatment_request_id,dose,dose_unit,planned_quantity,quantity_is_manual,quantity_override_justification
 ON public.treatment_request_products FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_product_dose_and_quantity();
CREATE OR REPLACE FUNCTION public.submit_treatment_request(p_request JSONB,p_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID; v_domain UUID; v_line JSONB; v_target JSONB; v_item_domain UUID; v_target_domain UUID; v_first UUID;
BEGIN
  v_domain:=(p_request->>'domain_id')::UUID;
  IF NOT COALESCE(has_domain_permission(v_domain,auth.uid(),'agronomie','create'),FALSE)
     AND NOT COALESCE(has_business_capability(v_domain,auth.uid(),'treatment.prescribe',NULL),FALSE) THEN RAISE EXCEPTION 'Habilitation de prescription refusée'; END IF;
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
    INSERT INTO treatment_request_products(treatment_request_id,domain_id,stock_item_id,catalog_product_id,dose,dose_unit,planned_quantity,calculated_quantity,quantity_is_manual,quantity_override_justification,phi_days,rei_hours,label_confirmed)
    VALUES(v_id,v_domain,NULLIF(v_line->>'stock_item_id','')::UUID,NULLIF(v_line->>'catalog_product_id','')::UUID,(v_line->>'dose')::NUMERIC,v_line->>'dose_unit',(v_line->>'planned_quantity')::NUMERIC,NULLIF(v_line->>'calculated_quantity','')::NUMERIC,COALESCE((v_line->>'quantity_is_manual')::BOOLEAN,FALSE),NULLIF(v_line->>'quantity_override_justification',''),COALESCE((v_line->>'phi_days')::INTEGER,0),COALESCE((v_line->>'rei_hours')::INTEGER,0),COALESCE((v_line->>'label_confirmed')::BOOLEAN,FALSE));
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE VIEW public.v_treatment_stock_forecast WITH (security_invoker=TRUE) AS
WITH demand AS (
 SELECT t.domain_id,t.id AS request_id,t.schedule_id,t.occurrence_number,t.warehouse_id,
 t.planned_at,t.created_at,p.stock_item_id,p.catalog_product_id,max(p.product_name) AS product_name,max(p.quantity_unit) AS quantity_unit,sum(p.planned_quantity) AS required
 FROM treatment_requests t JOIN treatment_request_products p ON p.treatment_request_id=t.id
 LEFT JOIN treatment_prescription_schedules s ON s.id=t.schedule_id
 LEFT JOIN treatment_schedule_occurrences o ON o.treatment_request_id=t.id
 WHERE t.status IN ('soumise','approuvee')
 AND (s.id IS NULL OR s.status='active') AND (o.id IS NULL OR o.status<>'cancelled')
 GROUP BY t.id,p.stock_item_id,p.catalog_product_id
), running AS (
 SELECT d.*,COALESCE(sum(required) OVER (
 PARTITION BY domain_id,warehouse_id,stock_item_id,catalog_product_id ORDER BY planned_at,created_at,request_id
 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS previous_required FROM demand d
), availability AS (
 SELECT d.*,COALESCE(i.name,d.product_name) AS name,COALESCE(i.unit,d.quantity_unit) AS unit,
 GREATEST(COALESCE(b.current_qty,0)-previous_required,0) AS available
 FROM running d LEFT JOIN stock_items i ON i.id=d.stock_item_id
 LEFT JOIN warehouse_stocks b ON b.warehouse_id=d.warehouse_id AND b.stock_item_id=d.stock_item_id AND b.domain_id=d.domain_id
)
SELECT domain_id,request_id,schedule_id,occurrence_number,warehouse_id,planned_at,
 CASE WHEN bool_and(available>=required) THEN 'disponible'
      WHEN bool_or(available>0) THEN 'partiel' ELSE 'non_disponible' END AS stock_status,
 COALESCE(jsonb_agg(jsonb_build_object('stock_item_id',stock_item_id,'catalog_product_id',catalog_product_id,'article_missing',stock_item_id IS NULL,'product',name,'unit',unit,
 'required',required,'available',available,'missing',GREATEST(required-available,0)))
 FILTER(WHERE required>available),'[]'::JSONB) AS shortages
FROM availability GROUP BY domain_id,request_id,schedule_id,occurrence_number,warehouse_id,planned_at;

-- Rattachement explicite, sans création d'article ni mouvement de stock.
CREATE FUNCTION public.resolve_treatment_stock(p_request UUID) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r treatment_requests%ROWTYPE; l treatment_request_products%ROWTYPE; s stock_items%ROWTYPE; n INTEGER:=0;
BEGIN
 SELECT * INTO r FROM treatment_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('soumise','approuvee') THEN RAISE EXCEPTION 'Prescription non modifiable'; END IF;
 IF NOT COALESCE(has_domain_permission(r.domain_id,auth.uid(),'agronomie','create'),FALSE)
 AND NOT COALESCE(has_business_capability(r.domain_id,auth.uid(),'treatment.prescribe',NULL),FALSE)
 THEN RAISE EXCEPTION 'Habilitation refusée'; END IF;
 FOR l IN SELECT * FROM treatment_request_products WHERE treatment_request_id=r.id AND stock_item_id IS NULL FOR UPDATE LOOP
   SELECT * INTO s FROM stock_items WHERE domain_id=r.domain_id AND plant_protection_product_id=l.catalog_product_id AND is_active ORDER BY id LIMIT 1;
   IF FOUND THEN
     UPDATE treatment_request_products SET stock_item_id=s.id,
       planned_quantity=convert_treatment_quantity(l.planned_quantity,l.quantity_unit,s.unit)
     WHERE id=l.id;
     n:=n+1;
   END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.resolve_treatment_stock(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_treatment_stock(UUID) TO authenticated;

-- Impossible de contourner les contrôles en appelant la confirmation directement.
CREATE FUNCTION public.guard_treatment_execution_readiness() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r treatment_requests%ROWTYPE; l treatment_request_products%ROWTYPE;
 p plant_protection_products%ROWTYPE; u product_authorized_uses%ROWTYPE;
BEGIN
 IF NEW.application_status='non_realisee' THEN RETURN NEW; END IF;
 SELECT * INTO r FROM treatment_requests WHERE id=NEW.treatment_request_id;
 FOR l IN SELECT * FROM treatment_request_products WHERE treatment_request_id=r.id LOOP
  IF l.stock_item_id IS NULL OR NOT EXISTS(SELECT 1 FROM stock_items WHERE id=l.stock_item_id
   AND domain_id=r.domain_id AND is_active AND plant_protection_product_id=l.catalog_product_id)
  THEN RAISE EXCEPTION '% : créer puis rattacher l’article de stock avant application',l.product_name; END IF;
  SELECT * INTO p FROM plant_protection_products WHERE id=l.catalog_product_id AND domain_id=r.domain_id;
  SELECT * INTO u FROM treatment_planning_use(l.catalog_product_id,r.domain_id,r.target_name);
  IF p.id IS NULL OR NOT p.is_active OR p.authorization_status<>'autorise' OR NOT p.safety_data_verified
   OR u.id IS NULL OR NOT u.is_active OR u.rei_hours IS NULL OR u.phi_days IS NULL
   OR NOT l.label_confirmed
  THEN RAISE EXCEPTION '% : vérifications réglementaires, usage, DAR et délai de rentrée à compléter avant application',l.product_name; END IF;
  IF EXISTS(SELECT 1 FROM phyto_positive_lists WHERE domain_id=r.domain_id AND status='active')
   AND NOT EXISTS(SELECT 1 FROM v_active_station_phyto_products e WHERE e.domain_id=r.domain_id
    AND e.product_id=p.id AND normalize_positive_list_key(e.target_name)=normalize_positive_list_key(r.target_name))
  THEN RAISE EXCEPTION '% : produit absent de la liste active pour cette cible',l.product_name; END IF;
  IF normalize_phyto_dose_unit(l.dose_unit)<>normalize_phyto_dose_unit(u.dose_unit)
    OR l.dose>u.dose_max OR l.dose<u.dose_min OR l.phi_days<u.phi_days OR l.rei_hours<u.rei_hours
  THEN RAISE EXCEPTION '% : prescription à réviser selon les données réglementaires actuelles',l.product_name; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_treatment_execution_readiness BEFORE INSERT ON public.treatment_applications
 FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_execution_readiness();
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

COMMIT;
