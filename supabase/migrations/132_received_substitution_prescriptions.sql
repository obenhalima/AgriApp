-- Prepared for review. Requires 130. Do not apply without shared-database approval.
BEGIN;
CREATE TABLE public.treatment_substitution_revisions(
 id uuid PRIMARY KEY,domain_id uuid NOT NULL REFERENCES public.domains(id),
 substitution_id uuid NOT NULL REFERENCES public.purchase_phyto_substitutions(id),
 requested_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),
 input jsonb NOT NULL,result jsonb NOT NULL
);
ALTER TABLE public.treatment_substitution_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY revision_read ON public.treatment_substitution_revisions FOR SELECT TO authenticated
 USING(is_domain_member(domain_id,auth.uid()) AND has_domain_permission(domain_id,auth.uid(),'agronomie','view'));
REVOKE ALL ON public.treatment_substitution_revisions FROM anon,authenticated;
GRANT SELECT ON public.treatment_substitution_revisions TO authenticated;

CREATE FUNCTION public.substitution_revision_quantity(p_dose numeric,p_unit text,p_area numeric,p_water numeric,p_stock text) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT round(convert_treatment_quantity(CASE WHEN u IN ('ml_100l','g_100l') THEN p_dose*p_water/100 WHEN u IN ('l_ha','kg_ha','ml_ha','g_ha','unite_ha') THEN p_dose*p_area/10000 WHEN u IN ('l_1000m2','kg_1000m2') THEN p_dose*p_area/1000 END,
 CASE WHEN u='ml_100l' THEN 'ml' WHEN u='g_100l' THEN 'g' ELSE split_part(u,'_',1) END,lower(btrim(p_stock))),4)
 FROM (SELECT normalize_phyto_dose_unit(p_unit) AS u) x
$$;
REVOKE ALL ON FUNCTION public.substitution_revision_quantity(numeric,text,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.preview_substitution_prescriptions(p_substitution uuid,p_dose numeric DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s purchase_phyto_substitutions%ROWTYPE; farm uuid; product uuid; target uuid; u product_authorized_uses%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO s FROM purchase_phyto_substitutions WHERE id=p_substitution;
 SELECT farm_id INTO farm FROM warehouses WHERE id=s.warehouse_id AND domain_id=s.domain_id AND is_active;
 IF auth.uid() IS NULL OR farm IS NULL OR NOT coalesce(is_domain_member(s.domain_id,auth.uid()),false)
 OR NOT coalesce(has_domain_permission(s.domain_id,auth.uid(),'agronomie','create'),false)
 OR NOT coalesce(has_business_capability(s.domain_id,auth.uid(),'treatment.prescribe',farm),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Prescription : habilitation et accès à la ferme requis'; END IF;
 IF s.status<>'receptionne' OR s.receipt_id IS NULL THEN RAISE EXCEPTION 'Le remplacement doit être réceptionné avant de réviser les prescriptions'; END IF;
 SELECT e.product_id,e.target_id INTO product,target FROM phyto_positive_list_entries e JOIN phyto_positive_lists l ON l.id=e.list_id AND l.domain_id=s.domain_id AND l.status='active'
 JOIN stock_items st ON st.id=s.replacement_stock_item_id AND st.domain_id=s.domain_id AND st.is_active AND st.plant_protection_product_id=e.product_id
 JOIN phyto_targets t ON t.id=e.target_id AND t.is_active AND t.is_verified AND t.merged_into_id IS NULL
 WHERE e.id=s.positive_entry_id AND e.domain_id=s.domain_id AND e.review_status='valide' AND e.station_approved;
 IF product IS NULL THEN RAISE EXCEPTION 'Produit et cible du remplacement à vérifier dans la liste active'; END IF;
 SELECT * INTO u FROM treatment_planning_use(product,s.domain_id,(SELECT canonical_name FROM phyto_targets WHERE id=target));
 IF u.id IS NULL OR u.dose_max IS NULL OR u.dose_max<=0 THEN RAISE EXCEPTION 'Usage du remplaçant à compléter'; END IF;
 SELECT jsonb_build_object('product_id',product,'target_id',target,'target_name',(SELECT canonical_name FROM phyto_targets WHERE id=target),
 'source_fingerprint',md5((to_jsonb(u)||jsonb_build_object('unit',st.unit,'entry',(SELECT to_jsonb(e) FROM phyto_positive_list_entries e WHERE e.id=s.positive_entry_id)))::text),
 'product_name',s.snapshot->'replacement'->>'name','unit',st.unit,'dose',coalesce(p_dose,u.dose_min,u.dose_max),'dose_min',u.dose_min,'dose_max',u.dose_max,'dose_unit',u.dose_unit,'phi_days',u.phi_days,'rei_hours',u.rei_hours,
 'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'planned_at',r.planned_at,'status',r.status,'area',r.treated_area_m2,'water',r.water_volume_liters,
 'old_quantity',p.planned_quantity,'old_unit',p.quantity_unit,
 'new_quantity',substitution_revision_quantity(coalesce(p_dose,u.dose_min,u.dose_max),u.dose_unit,r.treated_area_m2,r.water_volume_liters,st.unit),
 'products',(SELECT jsonb_agg(jsonb_build_object('name',x.product_name,'dose',x.dose,'dose_unit',x.dose_unit,'quantity',x.planned_quantity,'unit',x.quantity_unit,'replaced',x.stock_item_id=s.original_stock_item_id)) FROM treatment_request_products x WHERE x.treatment_request_id=r.id),
 'greenhouses',(SELECT string_agg(g.code,', ' ORDER BY g.code) FROM treatment_request_targets tt JOIN campaign_plantings cp ON cp.id=tt.campaign_planting_id JOIN greenhouses g ON g.id=cp.greenhouse_id WHERE tt.treatment_request_id=r.id),
 'fingerprint',md5((to_jsonb(r)||jsonb_build_object('products',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM treatment_request_products x WHERE x.treatment_request_id=r.id),'targets',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM treatment_request_targets x WHERE x.treatment_request_id=r.id)))::text)) ORDER BY r.planned_at,r.id)
 FROM treatment_requests r JOIN warehouses w ON w.id=r.warehouse_id AND w.domain_id=s.domain_id AND w.farm_id=farm
 JOIN treatment_request_products p ON p.treatment_request_id=r.id AND p.domain_id=s.domain_id AND p.stock_item_id=s.original_stock_item_id
 WHERE r.domain_id=s.domain_id AND r.status IN ('soumise','approuvee') AND r.planned_at>now()
 AND (p.biological_target_id=target OR (p.biological_target_id IS NULL AND normalize_positive_list_key(coalesce(p.target_name,r.target_name))=normalize_positive_list_key((SELECT canonical_name FROM phyto_targets WHERE id=target))))
 AND NOT EXISTS(SELECT 1 FROM treatment_applications a WHERE a.treatment_request_id=r.id)),'[]'::jsonb)) INTO result
 FROM stock_items st WHERE st.id=s.replacement_stock_item_id;
 RETURN result;
END $$;

CREATE FUNCTION public.revise_substitution_prescriptions(p_id uuid,p_substitution uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s purchase_phyto_substitutions%ROWTYPE; existing treatment_substitution_revisions%ROWTYPE; preview jsonb; candidate jsonb; selected jsonb;
 r treatment_requests%ROWTYPE; products jsonb; plantings jsonb; new_id uuid; result jsonb:='[]'; v_dose numeric; seen uuid[]:='{}';
BEGIN
 SELECT * INTO s FROM purchase_phyto_substitutions WHERE id=p_substitution FOR UPDATE;
 preview:=preview_substitution_prescriptions(p_substitution);
 SELECT * INTO existing FROM treatment_substitution_revisions WHERE id=p_id;
 IF FOUND THEN
  IF existing.requested_by=auth.uid() AND existing.substitution_id=p_substitution AND existing.input=p_input THEN RETURN existing.result; END IF;
  RAISE EXCEPTION 'Identifiant de révision déjà utilisé';
 END IF;
 IF (p_input->>'confirmed')::boolean IS DISTINCT FROM true OR length(btrim(coalesce(p_input->>'reason','')))<5 THEN RAISE EXCEPTION 'Confirmation des produits et justification requises'; END IF;
 IF preview->>'source_fingerprint' IS DISTINCT FROM p_input->>'source_fingerprint' THEN RAISE EXCEPTION 'Usage du remplaçant modifié : actualiser l’aperçu'; END IF;
 v_dose:=(p_input->>'dose')::numeric;
 IF v_dose IS NULL OR v_dose<=0 OR v_dose>='Infinity'::numeric OR v_dose<(preview->>'dose_min')::numeric OR v_dose>(preview->>'dose_max')::numeric THEN RAISE EXCEPTION 'Dose hors intervalle du remplaçant'; END IF;
 IF jsonb_typeof(p_input->'occurrences') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'occurrences') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Sélectionner de 1 à 50 occurrences'; END IF;
 -- Stable lock order protects against simultaneous revision and application.
 FOR selected IN SELECT value FROM jsonb_array_elements(p_input->'occurrences') ORDER BY value->>'id' LOOP
  SELECT * INTO r FROM treatment_requests WHERE id=(selected->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR r.id=ANY(seen) THEN RAISE EXCEPTION 'Occurrence absente ou dupliquée'; END IF;
  seen:=array_append(seen,r.id);
  PERFORM 1 FROM treatment_request_products WHERE treatment_request_id=r.id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM treatment_request_targets WHERE treatment_request_id=r.id ORDER BY id FOR UPDATE;
  preview:=preview_substitution_prescriptions(p_substitution,v_dose);
  IF preview->>'source_fingerprint' IS DISTINCT FROM p_input->>'source_fingerprint' THEN RAISE EXCEPTION 'Usage du remplaçant modifié : actualiser l’aperçu'; END IF;
  SELECT value INTO candidate FROM jsonb_array_elements(preview->'candidates') WHERE value->>'id'=r.id::text;
  IF candidate IS NULL OR candidate->>'fingerprint' IS DISTINCT FROM selected->>'fingerprint' THEN RAISE EXCEPTION 'Occurrence modifiée, exécutée ou non éligible : actualiser la sélection'; END IF;
  IF (candidate->>'new_quantity')::numeric IS NULL OR (candidate->>'new_quantity')::numeric<=0 THEN RAISE EXCEPTION 'Quantité non calculable : contrôler surface, bouillie et unité'; END IF;
  SELECT jsonb_agg(CASE WHEN p.stock_item_id=s.original_stock_item_id AND (p.biological_target_id=(preview->>'target_id')::uuid OR (p.biological_target_id IS NULL AND normalize_positive_list_key(coalesce(p.target_name,r.target_name))=normalize_positive_list_key(preview->>'target_name'))) THEN
   to_jsonb(p)||jsonb_build_object('stock_item_id',s.replacement_stock_item_id,'catalog_product_id',preview->>'product_id','biological_target_id',preview->>'target_id','target_name',preview->>'target_name',
   'dose',v_dose,'dose_unit',preview->>'dose_unit','planned_quantity',1,'quantity_is_manual',false,'quantity_override_justification',NULL,'phi_days',preview->'phi_days','rei_hours',preview->'rei_hours','label_confirmed',true)
   ELSE to_jsonb(p)||jsonb_build_object('label_confirmed',true) END ORDER BY p.id) INTO products FROM treatment_request_products p WHERE p.treatment_request_id=r.id;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(products) p GROUP BY p->>'catalog_product_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Le remplaçant figure déjà dans ce mélange : révision manuelle nécessaire'; END IF;
  SELECT jsonb_agg(campaign_planting_id ORDER BY campaign_planting_id) INTO plantings FROM treatment_request_targets WHERE treatment_request_id=r.id;
  new_id:=submit_treatment_request(to_jsonb(r)||jsonb_build_object('warehouse_id',s.warehouse_id,'target_planting_ids',coalesce(plantings,jsonb_build_array(r.campaign_planting_id)),
   'justification',r.justification||E'\nRévision fournisseur : '||(p_input->>'reason'),'notes',concat_ws(E'\n',r.notes,'Remplace la prescription '||r.id::text||' ; substitution '||s.id::text)),products);
  IF (SELECT status FROM treatment_requests WHERE id=new_id)<>'soumise' THEN RAISE EXCEPTION 'Nouvelle validation obligatoire'; END IF;
  UPDATE treatment_requests SET status='annulee',notes=concat_ws(E'\n',notes,'Révisée par '||auth.uid()::text||' : nouvelle prescription '||new_id::text),updated_at=now() WHERE id=r.id;
  UPDATE treatment_schedule_occurrences SET status='cancelled' WHERE treatment_request_id=r.id AND domain_id=s.domain_id;
  result:=result||jsonb_build_array(jsonb_build_object('old_request_id',r.id,'new_request_id',new_id,'planned_at',r.planned_at));
 END LOOP;
 INSERT INTO treatment_substitution_revisions(id,domain_id,substitution_id,requested_by,input,result) VALUES(p_id,s.domain_id,s.id,auth.uid(),p_input,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.preview_substitution_prescriptions(uuid,numeric),public.revise_substitution_prescriptions(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_substitution_prescriptions(uuid,numeric),public.revise_substitution_prescriptions(uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
