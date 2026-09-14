-- 125 : une cible biologique par ligne de produit. Prérequis : 124.
-- Pas de réécriture des prescriptions, applications ou attestations historiques.
BEGIN;
ALTER TABLE public.treatment_request_products
 ADD COLUMN biological_target_id UUID REFERENCES public.phyto_targets(id) ON DELETE RESTRICT,
 ADD COLUMN target_name TEXT;

-- Les définitions existantes incluent les correctifs stock, CUMP et habilitations.
-- Remplacements ciblés et vérifiés : une base divergente provoque un rollback.
CREATE FUNCTION pg_temp.patch125(signature TEXT, old_text TEXT, new_text TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE definition TEXT;
BEGIN
 definition:=pg_get_functiondef(signature::regprocedure);
 IF position(old_text IN definition)=0 THEN RAISE EXCEPTION '125 : définition inattendue pour %',signature; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

SELECT pg_temp.patch125('public.submit_treatment_request(jsonb,jsonb)',
 'catalog_product_id,dose,dose_unit,planned_quantity,calculated_quantity',
 'catalog_product_id,biological_target_id,target_name,dose,dose_unit,planned_quantity,calculated_quantity');
SELECT pg_temp.patch125('public.submit_treatment_request(jsonb,jsonb)',
 $old$NULLIF(v_line->>'catalog_product_id','')::UUID,(v_line->>'dose')::NUMERIC$old$,
 $new$NULLIF(v_line->>'catalog_product_id','')::UUID,NULLIF(v_line->>'biological_target_id','')::UUID,NULLIF(v_line->>'target_name',''),(v_line->>'dose')::NUMERIC$new$);

SELECT pg_temp.patch125('public.guard_treatment_product_dose_and_quantity()',
 $old$IF v_domain IS DISTINCT FROM NEW.domain_id THEN RAISE EXCEPTION 'Prescription hors client'; END IF;$old$,
 $new$IF v_domain IS DISTINCT FROM NEW.domain_id THEN RAISE EXCEPTION 'Prescription hors client'; END IF;
  IF NEW.biological_target_id IS NOT NULL THEN
    SELECT canonical_name INTO v_target FROM phyto_targets
     WHERE id=NEW.biological_target_id AND is_active AND is_verified AND merged_into_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cible biologique absente, inactive ou non vérifiée'; END IF;
  END IF;
  -- Le nom est un instantané serveur ; une valeur forgée par le client est ignorée.
  NEW.target_name:=v_target;$new$);
SELECT pg_temp.patch125('public.guard_treatment_product_dose_and_quantity()',
 $old$NEW.product_name:=v_name;$old$,
 $new$NEW.product_name:=v_name;
  IF NEW.biological_target_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM treatment_request_products p WHERE p.treatment_request_id=NEW.treatment_request_id
   AND p.catalog_product_id=v_product AND p.id IS DISTINCT FROM NEW.id)
  THEN RAISE EXCEPTION 'Un produit ne doit figurer qu’une fois dans la prescription pour éviter un double dosage'; END IF;$new$);
DROP TRIGGER trg_guard_treatment_product_dose ON public.treatment_request_products;
CREATE TRIGGER trg_guard_treatment_product_dose BEFORE INSERT OR UPDATE OF
 stock_item_id,catalog_product_id,domain_id,treatment_request_id,biological_target_id,target_name,
 dose,dose_unit,planned_quantity,quantity_is_manual,quantity_override_justification
 ON public.treatment_request_products FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_product_dose_and_quantity();

SELECT pg_temp.patch125('public.guard_treatment_execution_readiness()',
 'r.target_name','COALESCE(NULLIF(line.target_name,''''),r.target_name)');
SELECT pg_temp.patch125('public.build_treatment_dar_snapshot(uuid,jsonb)',
 'r.target_name','COALESCE(NULLIF(line.target_name,''''),r.target_name)');
-- Chaque source de conformité reste attachée à sa ligne, y compris pour le DAR.
SELECT pg_temp.patch125('public.guard_treatment_execution_readiness()',
 $old$'product_id',p.id,'authorized_use_id',u.id$old$,
 $new$'request_product_id',line.id,'biological_target_id',line.biological_target_id,'target_name',COALESCE(line.target_name,r.target_name),'product_id',p.id,'authorized_use_id',u.id$new$);
SELECT pg_temp.patch125('public.build_treatment_dar_snapshot(uuid,jsonb)',
 $old$AND src->>'product_id'=line.catalog_product_id::TEXT$old$,
 $new$AND src->>'product_id'=line.catalog_product_id::TEXT
    AND (src->>'request_product_id' IS NULL OR src->>'request_product_id'=line.id::TEXT)$new$);

SELECT pg_temp.patch125('public.treatment_station_snapshot(uuid)',
 $old$normalize_positive_list_key(r.target_name)) x ON true$old$,
 $new$normalize_positive_list_key(COALESCE(NULLIF(p.target_name,''),r.target_name))) x ON true$new$);
SELECT pg_temp.patch125('public.treatment_station_snapshot(uuid)',
 $old$'risk',CASE WHEN NOT EXISTS$old$,
 $new$'risk',CASE WHEN p.biological_target_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM phyto_targets t WHERE t.id=p.biological_target_id AND t.is_active AND t.is_verified AND t.merged_into_id IS NULL)
 THEN 'unknown' WHEN NOT EXISTS$new$);

CREATE FUNCTION public.submit_treatment_schedule_multitarget(p_schedule JSONB,p_request JSONB,p_products JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line JSONB; target public.phyto_targets%ROWTYPE; normalized JSONB:='[]'; names TEXT[]:='{}'; title TEXT;
BEGIN
 IF jsonb_typeof(p_products) IS DISTINCT FROM 'array' OR jsonb_array_length(p_products)=0
 THEN RAISE EXCEPTION 'Au moins une ligne cible et produit est obligatoire'; END IF;
 IF jsonb_array_length(p_products)>50 THEN RAISE EXCEPTION 'Maximum 50 produits par prescription'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_products) p GROUP BY p->>'catalog_product_id' HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Un produit ne doit figurer qu’une fois dans la prescription pour éviter un double dosage'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_products) LOOP
  IF NULLIF(line->>'catalog_product_id','') IS NULL OR NULLIF(line->>'biological_target_id','') IS NULL
  THEN RAISE EXCEPTION 'Choisir une cible biologique et un produit sur chaque ligne'; END IF;
  SELECT * INTO target FROM phyto_targets WHERE id=(line->>'biological_target_id')::UUID
   AND is_active AND is_verified AND merged_into_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cible biologique absente, inactive ou non vérifiée'; END IF;
  normalized:=normalized||jsonb_build_array(line||jsonb_build_object('target_name',target.canonical_name));
  IF NOT target.canonical_name=ANY(names) THEN names:=array_append(names,target.canonical_name); END IF;
 END LOOP;
 title:=array_to_string(names,' / ');
 -- Champ historique varchar(180) : résumé court, noms complets conservés sur les lignes.
 IF length(title)>180 THEN title:='Prescription multicible ('||cardinality(names)||' cibles)'; END IF;
 RETURN public.submit_treatment_schedule(p_schedule||jsonb_build_object('name',title),
   p_request||jsonb_build_object('target_name',title),normalized);
END $$;
REVOKE ALL ON FUNCTION public.submit_treatment_schedule_multitarget(JSONB,JSONB,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_treatment_schedule_multitarget(JSONB,JSONB,JSONB) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
