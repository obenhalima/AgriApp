-- 110 : conformité déléguée à la station, sans inventer les données de sécurité.
-- Prérequis : 107B. Ne remplace pas les contrôles entrepôt/applicateur 108/109.
BEGIN;
CREATE OR REPLACE FUNCTION public.mark_positive_entry_station_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- L'approbation Station est distincte du contrôle technique du rapprochement.
 IF NEW.review_status='rejete' THEN
  NEW.station_approved:=FALSE; NEW.station_approved_by:=NULL; NEW.station_approved_at:=NULL;
 ELSE
  NEW.station_approved:=TRUE;
  NEW.station_approved_by:=COALESCE(NEW.station_approved_by,auth.uid(),
   (SELECT imported_by FROM phyto_positive_lists WHERE id=NEW.list_id));
  NEW.station_approved_at:=COALESCE(NEW.station_approved_at,NOW());
 END IF;
 RETURN NEW;
END $$;
-- Les listes historiques rejetées/remplacées ne sont pas réactivées.
UPDATE public.phyto_positive_list_entries e SET station_approved=TRUE
FROM public.phyto_positive_lists l WHERE l.id=e.list_id AND l.domain_id=e.domain_id
 AND l.status IN ('active','a_controler','brouillon') AND e.review_status='valide';

ALTER TABLE public.treatment_applications ADD COLUMN IF NOT EXISTS station_compliance_sources JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE OR REPLACE VIEW public.v_active_station_phyto_products WITH (security_invoker=TRUE) AS
SELECT e.domain_id,e.list_id,l.version,e.target_id,t.canonical_name AS target_name,
 e.product_id,e.authorized_use_id,e.commercial_name,e.station_approved,
 p.authorization_status,p.safety_data_verified,p.is_active,
 EXISTS(SELECT 1 FROM stock_items si WHERE si.domain_id=e.domain_id
  AND si.plant_protection_product_id=e.product_id AND si.category='phytosanitaires' AND si.is_active) AS linked_to_stock,
 (p.is_active AND p.authorization_status NOT IN ('suspendu','retire','expire')
  AND e.phi_days IS NOT NULL AND EXISTS(SELECT 1 FROM product_authorized_uses u
   WHERE u.id=e.authorized_use_id AND u.product_id=e.product_id AND u.domain_id=e.domain_id
   AND u.rei_hours IS NOT NULL AND u.dose_max IS NOT NULL AND u.dose_unit IS NOT NULL)) AS regulatory_ready
FROM phyto_positive_list_entries e
JOIN phyto_positive_lists l ON l.id=e.list_id AND l.status='active'
JOIN plant_protection_products p ON p.id=e.product_id
LEFT JOIN phyto_targets t ON t.id=e.target_id
WHERE e.review_status='valide' AND e.station_approved;

CREATE OR REPLACE FUNCTION public.guard_treatment_execution_readiness() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r treatment_requests%ROWTYPE; line treatment_request_products%ROWTYPE;
 p plant_protection_products%ROWTYPE; u product_authorized_uses%ROWTYPE;
 source RECORD; trusted BOOLEAN; issues TEXT[]; dar INTEGER;
BEGIN
 NEW.station_compliance_sources:='[]'::JSONB;
 IF NEW.application_status='non_realisee' THEN RETURN NEW; END IF;
 SELECT * INTO r FROM treatment_requests WHERE id=NEW.treatment_request_id;
 FOR line IN SELECT * FROM treatment_request_products WHERE treatment_request_id=r.id LOOP
  issues:=ARRAY[]::TEXT[];
  IF line.stock_item_id IS NULL OR NOT EXISTS(SELECT 1 FROM stock_items WHERE id=line.stock_item_id
    AND domain_id=r.domain_id AND is_active AND plant_protection_product_id=line.catalog_product_id)
  THEN issues:=array_append(issues,'article de stock actif à rattacher'); END IF;
  SELECT * INTO p FROM plant_protection_products WHERE id=line.catalog_product_id AND domain_id=r.domain_id;
  SELECT * INTO u FROM treatment_planning_use(line.catalog_product_id,r.domain_id,r.target_name);
  SELECT e.id,e.list_id,l.version,l.source_file_name,e.station_approved_at,e.phi_days
   INTO source FROM phyto_positive_list_entries e
   JOIN phyto_positive_lists l ON l.id=e.list_id AND l.domain_id=e.domain_id AND l.status='active'
   JOIN phyto_targets t ON t.id=e.target_id
   WHERE e.domain_id=r.domain_id AND e.product_id=line.catalog_product_id
    AND e.review_status='valide' AND e.station_approved AND e.authorized_use_id=u.id
    AND normalize_positive_list_key(t.canonical_name)=normalize_positive_list_key(r.target_name)
   ORDER BY (e.phi_days IS NOT NULL) DESC,e.phi_days DESC,e.id LIMIT 1;
  trusted:=FOUND;
  IF p.id IS NULL OR NOT p.is_active THEN issues:=array_append(issues,'produit absent ou inactif'); END IF;
  IF p.authorization_status IN ('suspendu','retire','expire') THEN
   issues:=array_append(issues,'produit explicitement suspendu, retiré ou expiré');
  ELSIF NOT trusted AND (p.authorization_status IS DISTINCT FROM 'autorise' OR NOT COALESCE(p.safety_data_verified,FALSE)) THEN
   issues:=array_append(issues,'conformité ONSSA à vérifier : aucune validation Station active pour cet usage');
  END IF;
  IF u.id IS NULL THEN issues:=array_append(issues,'usage correspondant à la cible absent');
  ELSIF NOT u.is_active AND NOT trusted THEN issues:=array_append(issues,'usage non validé'); END IF;
  dar:=CASE WHEN trusted THEN source.phi_days ELSE u.phi_days END;
  IF dar IS NULL THEN issues:=array_append(issues,'DAR non renseigné dans la source'); END IF;
  IF u.rei_hours IS NULL THEN issues:=array_append(issues,'délai de rentrée (heures) non renseigné'); END IF;
  IF NOT line.label_confirmed THEN issues:=array_append(issues,'vérification de l’étiquette non confirmée'); END IF;
  IF EXISTS(SELECT 1 FROM phyto_positive_lists WHERE domain_id=r.domain_id AND status='active')
    AND NOT EXISTS(SELECT 1 FROM v_active_station_phyto_products e WHERE e.domain_id=r.domain_id
     AND e.product_id=p.id AND normalize_positive_list_key(e.target_name)=normalize_positive_list_key(r.target_name))
  THEN issues:=array_append(issues,'produit absent de la liste active pour cette cible'); END IF;
  IF u.id IS NOT NULL AND (normalize_phyto_dose_unit(line.dose_unit)<>normalize_phyto_dose_unit(u.dose_unit)
    OR u.dose_max IS NULL OR line.dose>u.dose_max OR line.dose<u.dose_min)
  THEN issues:=array_append(issues,'unité ou dose hors de l’usage défini'); END IF;
  IF line.phi_days<dar OR line.rei_hours<u.rei_hours THEN
   issues:=array_append(issues,'DAR ou délai de rentrée de la prescription inférieur à la source : réviser la prescription'); END IF;
  IF cardinality(issues)>0 THEN RAISE EXCEPTION '% : %',COALESCE(line.product_name,p.commercial_name,'Produit'),array_to_string(issues,' ; '); END IF;
  IF trusted THEN NEW.station_compliance_sources:=NEW.station_compliance_sources||jsonb_build_array(jsonb_build_object(
   'product_id',p.id,'authorized_use_id',u.id,'entry_id',source.id,'list_id',source.list_id,
   'version',source.version,'file',source.source_file_name,'station_approved_at',source.station_approved_at)); END IF;
 END LOOP;
 RETURN NEW;
END $$;
COMMIT;
