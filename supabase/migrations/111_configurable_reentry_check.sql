-- 111 : contrôle du délai de rentrée configurable par client. Après 110.
BEGIN;
ALTER TABLE public.phyto_compliance_settings ADD COLUMN IF NOT EXISTS require_reentry_delay BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.treatment_applications ADD COLUMN IF NOT EXISTS safety_warnings JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE TABLE IF NOT EXISTS public.phyto_reentry_setting_audit (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),domain_id UUID NOT NULL REFERENCES public.domains(id),
 previous_value BOOLEAN NOT NULL,new_value BOOLEAN NOT NULL,
 changed_by UUID REFERENCES public.profiles(id),changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.phyto_reentry_setting_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY reentry_audit_read ON public.phyto_reentry_setting_audit FOR SELECT TO authenticated
 USING(public.has_domain_permission(domain_id,auth.uid(),'agronomie','view'));
REVOKE INSERT,UPDATE,DELETE ON public.phyto_reentry_setting_audit FROM authenticated;
GRANT SELECT ON public.phyto_reentry_setting_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_reentry_setting()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous BOOLEAN;
BEGIN
 previous:=CASE WHEN TG_OP='INSERT' THEN TRUE ELSE OLD.require_reentry_delay END;
 IF NEW.require_reentry_delay IS DISTINCT FROM previous THEN
  IF NOT COALESCE(is_domain_responsible(NEW.domain_id,auth.uid(),'agronomie'),FALSE)
   AND NOT COALESCE(is_platform_admin(auth.uid()),FALSE)
  THEN RAISE EXCEPTION 'Modification réservée aux responsables habilités'; END IF;
  INSERT INTO phyto_reentry_setting_audit(domain_id,previous_value,new_value,changed_by)
   VALUES(NEW.domain_id,previous,NEW.require_reentry_delay,auth.uid());
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_reentry_setting BEFORE INSERT OR UPDATE ON public.phyto_compliance_settings
 FOR EACH ROW EXECUTE FUNCTION public.audit_reentry_setting();

CREATE OR REPLACE FUNCTION public.guard_treatment_execution_readiness() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r treatment_requests%ROWTYPE; line treatment_request_products%ROWTYPE;
 p plant_protection_products%ROWTYPE; u product_authorized_uses%ROWTYPE;
 source RECORD; trusted BOOLEAN; issues TEXT[]; dar INTEGER; require_rei BOOLEAN;
BEGIN
 NEW.station_compliance_sources:='[]'::JSONB;
 NEW.safety_warnings:='[]'::JSONB;
 IF NEW.application_status='non_realisee' THEN RETURN NEW; END IF;
 SELECT * INTO r FROM treatment_requests WHERE id=NEW.treatment_request_id;
 SELECT COALESCE((SELECT require_reentry_delay FROM phyto_compliance_settings WHERE domain_id=r.domain_id),TRUE) INTO require_rei;
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
  IF u.rei_hours IS NULL THEN
   IF require_rei THEN issues:=array_append(issues,'délai de rentrée (heures) non renseigné');
   ELSE NEW.safety_warnings:=NEW.safety_warnings||jsonb_build_array(jsonb_build_object(
    'code','reentry_delay_unknown','product_id',line.catalog_product_id,'product',line.product_name,
    'rei_hours',NULL,'message','Délai de rentrée non renseigné — ne constitue pas une autorisation de rentrée',
    'confirmed_by',auth.uid(),'confirmed_at',NOW()));
   END IF;
  END IF;
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

