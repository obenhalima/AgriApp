-- Effectif directement dans Récoltes. Ne crée aucun pointage ni coût salarial.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.harvests
 ADD COLUMN harvest_people integer CHECK(harvest_people BETWEEN 1 AND 10000),
 ADD COLUMN harvest_hours numeric(5,2) CHECK(harvest_hours>0 AND harvest_hours<=24),
 ADD COLUMN harvest_full_day boolean NOT NULL DEFAULT false,
 ADD COLUMN harvest_person_target numeric(12,2),
 ADD CONSTRAINT harvest_people_hours_check CHECK((harvest_hours IS NULL AND NOT harvest_full_day) OR harvest_people IS NOT NULL);
CREATE TABLE public.harvest_person_targets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain_id uuid NOT NULL REFERENCES public.domains(id),
 farm_id uuid NOT NULL REFERENCES public.farms(id), effective_from date NOT NULL,
 kg_per_person_day numeric(12,2) NOT NULL CHECK(kg_per_person_day>0 AND kg_per_person_day<1000000),
 created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(farm_id,effective_from)
);
ALTER TABLE public.harvest_person_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.harvest_person_targets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.harvest_person_targets TO authenticated;
CREATE POLICY harvest_person_targets_read ON public.harvest_person_targets FOR SELECT TO authenticated USING(
 is_domain_member(domain_id,auth.uid()) AND (has_domain_permission(domain_id,auth.uid(),'pointage','view') OR has_domain_permission(domain_id,auth.uid(),'productivite','view')));
CREATE FUNCTION public.set_harvest_person_target(p_farm uuid,p_from date,p_rate numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid;
BEGIN
 SELECT domain_id INTO d FROM farms WHERE id=p_farm;
 IF d IS NULL OR NOT coalesce(is_domain_member(d,auth.uid()),false) OR NOT coalesce(has_domain_permission(d,auth.uid(),'pointage','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Objectif non autorisé'; END IF;
 INSERT INTO harvest_person_targets(domain_id,farm_id,effective_from,kg_per_person_day,created_by) VALUES(d,p_farm,p_from,p_rate,auth.uid());
END $$;
CREATE FUNCTION public.snapshot_harvest_person_target() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.harvest_date IS NOT DISTINCT FROM OLD.harvest_date AND NEW.campaign_planting_id IS NOT DISTINCT FROM OLD.campaign_planting_id
  AND OLD.harvest_people IS NOT NULL THEN NEW.harvest_person_target:=OLD.harvest_person_target; RETURN NEW; END IF;
 END IF;
 SELECT t.kg_per_person_day INTO NEW.harvest_person_target FROM harvest_person_targets t
 JOIN greenhouses g ON g.farm_id=t.farm_id JOIN campaign_plantings cp ON cp.greenhouse_id=g.id
 WHERE cp.id=NEW.campaign_planting_id AND t.domain_id=cp.domain_id AND t.effective_from<=NEW.harvest_date
 ORDER BY t.effective_from DESC LIMIT 1;
 RETURN NEW;
END $$;
CREATE TRIGGER harvest_person_target_snapshot BEFORE INSERT OR UPDATE ON public.harvests FOR EACH ROW EXECUTE FUNCTION public.snapshot_harvest_person_target();
REVOKE ALL ON FUNCTION public.snapshot_harvest_person_target() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_harvest_person_target(uuid,date,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_harvest_person_target(uuid,date,numeric) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
