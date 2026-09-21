-- Récolte : pointage collectif explicitement rapproché des kilos récoltés.
-- À appliquer après revue sur Supabase. Aucune reprise automatique de l'historique.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.harvest_labor_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain_id uuid NOT NULL REFERENCES public.domains(id),
 farm_id uuid NOT NULL REFERENCES public.farms(id), effective_from date NOT NULL,
 kg_per_person_hour numeric(12,2) NOT NULL CHECK(kg_per_person_hour>0 AND kg_per_person_hour<100000),
 created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(farm_id,effective_from)
);
CREATE TABLE public.harvest_labor_allocations (
 id uuid PRIMARY KEY, domain_id uuid NOT NULL REFERENCES public.domains(id),
 labor_entry_id uuid UNIQUE REFERENCES public.labor_entries(id) ON DELETE SET NULL,
 harvest_id uuid NOT NULL REFERENCES public.harvests(id), farm_id uuid NOT NULL REFERENCES public.farms(id),
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id), greenhouse_id uuid NOT NULL REFERENCES public.greenhouses(id),
 team_id uuid NOT NULL REFERENCES public.teams(id), work_date date NOT NULL,
 worker_count integer NOT NULL CHECK(worker_count BETWEEN 1 AND 10000),
 hours_per_person numeric(5,2) NOT NULL CHECK(hours_per_person>0 AND hours_per_person<=24),
 person_hours numeric GENERATED ALWAYS AS (worker_count*hours_per_person) STORED,
 quantity_kg numeric(12,2) NOT NULL CHECK(quantity_kg>0 AND quantity_kg<1000000000),
 target_id uuid REFERENCES public.harvest_labor_targets(id), target_rate numeric(12,2),
 notes text, created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 cancelled_at timestamptz, cancelled_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX ON public.harvest_labor_allocations(harvest_id) WHERE cancelled_at IS NULL;
CREATE INDEX ON public.harvest_labor_allocations(domain_id,campaign_id,work_date);
ALTER TABLE public.harvest_labor_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_labor_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.harvest_labor_targets,public.harvest_labor_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.harvest_labor_targets,public.harvest_labor_allocations TO authenticated;
CREATE POLICY harvest_target_read ON public.harvest_labor_targets FOR SELECT TO authenticated USING (
 public.is_domain_member(domain_id,auth.uid()) AND (public.has_domain_permission(domain_id,auth.uid(),'pointage','view') OR public.has_domain_permission(domain_id,auth.uid(),'productivite','view')));
CREATE POLICY harvest_work_read ON public.harvest_labor_allocations FOR SELECT TO authenticated USING (
 public.is_domain_member(domain_id,auth.uid()) AND (public.has_domain_permission(domain_id,auth.uid(),'pointage','view') OR public.has_domain_permission(domain_id,auth.uid(),'productivite','view')));

CREATE FUNCTION public.set_harvest_labor_target(p_farm uuid,p_from date,p_rate numeric) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid; result uuid;
BEGIN
 SELECT domain_id INTO d FROM farms WHERE id=p_farm FOR UPDATE;
 IF d IS NULL OR NOT coalesce(is_domain_member(d,auth.uid()),false)
 OR NOT coalesce(has_domain_permission(d,auth.uid(),'pointage','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Modification des objectifs non autorisée'; END IF;
 IF p_from IS NULL OR p_rate IS NULL OR NOT(p_rate>0 AND p_rate<100000) THEN RAISE EXCEPTION 'Date et objectif positif requis'; END IF;
 INSERT INTO harvest_labor_targets(domain_id,farm_id,effective_from,kg_per_person_hour,created_by)
 VALUES(d,p_farm,p_from,p_rate,auth.uid()) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.record_harvest_labor(p_id uuid,p_harvest uuid,p_team uuid,p_count integer,p_hours numeric,p_kg numeric,p_notes text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h harvests%ROWTYPE; cp campaign_plantings%ROWTYPE; g greenhouses%ROWTYPE;
 target harvest_labor_targets%ROWTYPE; prior harvest_labor_allocations%ROWTYPE; labor uuid; used numeric;
BEGIN
 SELECT * INTO h FROM harvests WHERE id=p_harvest FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Récolte introuvable'; END IF;
 IF NOT coalesce(is_domain_member(h.domain_id,auth.uid()),false)
 OR NOT coalesce(has_domain_permission(h.domain_id,auth.uid(),'pointage','create'),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Pointage non autorisé'; END IF;
 SELECT * INTO prior FROM harvest_labor_allocations WHERE id=p_id;
 IF FOUND THEN
  IF prior.created_by=auth.uid() AND prior.harvest_id=p_harvest AND prior.team_id=p_team AND prior.worker_count=p_count
  AND prior.hours_per_person=p_hours AND prior.quantity_kg=p_kg AND prior.notes IS NOT DISTINCT FROM p_notes AND prior.cancelled_at IS NULL THEN RETURN prior.id; END IF;
  RAISE EXCEPTION 'Identifiant déjà utilisé : actualisez';
 END IF;
 IF p_id IS NULL OR p_count IS NULL OR p_count NOT BETWEEN 1 AND 10000 OR p_hours IS NULL OR NOT(p_hours>0 AND p_hours<=24)
 OR p_kg IS NULL OR NOT(p_kg>0 AND p_kg<1000000000) OR p_hours<>round(p_hours,2) OR p_kg<>round(p_kg,2)
 THEN RAISE EXCEPTION 'Effectif, heures (0 à 24) et kilos positifs requis, deux décimales maximum'; END IF;
 SELECT * INTO cp FROM campaign_plantings WHERE id=h.campaign_planting_id;
 SELECT * INTO g FROM greenhouses WHERE id=cp.greenhouse_id;
 IF cp.domain_id IS DISTINCT FROM h.domain_id OR NOT EXISTS(SELECT 1 FROM farms WHERE id=g.farm_id AND domain_id=h.domain_id)
 OR NOT EXISTS(SELECT 1 FROM teams WHERE id=p_team AND farm_id=g.farm_id)
 THEN RAISE EXCEPTION 'Équipe et récolte doivent appartenir à la même ferme'; END IF;
 -- Même verrou de ferme que la création des objectifs : choix déterministe du snapshot.
 PERFORM 1 FROM farms WHERE id=g.farm_id FOR UPDATE;
 SELECT coalesce(sum(quantity_kg),0) INTO used FROM harvest_labor_allocations WHERE harvest_id=h.id AND cancelled_at IS NULL;
 IF used+p_kg>coalesce(h.total_qty,0) THEN RAISE EXCEPTION 'Kilos déjà attribués : reste disponible % kg',greatest(0,coalesce(h.total_qty,0)-used); END IF;
 SELECT * INTO target FROM harvest_labor_targets WHERE farm_id=g.farm_id AND effective_from<=h.harvest_date ORDER BY effective_from DESC LIMIT 1;
 INSERT INTO labor_entries(campaign_id,greenhouse_id,campaign_planting_id,work_date,operation_type,worker_count,hours_worked,recorded_via,notes)
 VALUES(cp.campaign_id,g.id,cp.id,h.harvest_date,'cueillette',p_count,p_hours,'web',p_notes) RETURNING id INTO labor;
 INSERT INTO harvest_labor_allocations(id,domain_id,labor_entry_id,harvest_id,farm_id,campaign_id,greenhouse_id,team_id,work_date,worker_count,hours_per_person,quantity_kg,target_id,target_rate,notes,created_by)
 VALUES(p_id,h.domain_id,labor,h.id,g.farm_id,cp.campaign_id,g.id,p_team,h.harvest_date,p_count,p_hours,p_kg,target.id,target.kg_per_person_hour,p_notes,auth.uid());
 RETURN p_id;
END $$;

CREATE FUNCTION public.cancel_harvest_labor(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a harvest_labor_allocations%ROWTYPE;
BEGIN
 SELECT * INTO a FROM harvest_labor_allocations WHERE id=p_id;
 IF NOT FOUND OR NOT coalesce(is_domain_member(a.domain_id,auth.uid()),false)
 OR NOT coalesce(has_domain_permission(a.domain_id,auth.uid(),'pointage','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Annulation non autorisée'; END IF;
 PERFORM 1 FROM harvests WHERE id=a.harvest_id FOR UPDATE;
 UPDATE harvest_labor_allocations SET cancelled_at=now(),cancelled_by=auth.uid() WHERE id=p_id AND cancelled_at IS NULL;
 DELETE FROM labor_entries WHERE id=a.labor_entry_id;
END $$;

CREATE FUNCTION public.guard_harvest_labor_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='labor_entries' THEN
  IF EXISTS(SELECT 1 FROM harvest_labor_allocations WHERE labor_entry_id=OLD.id AND cancelled_at IS NULL) THEN
   RAISE EXCEPTION 'Pointage récolte lié : annulez-le dans Productivité récolte avant correction';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM harvest_labor_allocations WHERE harvest_id=OLD.id AND cancelled_at IS NULL) AND (
   NEW.campaign_planting_id IS DISTINCT FROM OLD.campaign_planting_id OR NEW.harvest_date IS DISTINCT FROM OLD.harvest_date
   OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
   OR coalesce(NEW.total_qty,0)<(SELECT sum(quantity_kg) FROM harvest_labor_allocations WHERE harvest_id=OLD.id AND cancelled_at IS NULL))
  THEN RAISE EXCEPTION 'Récolte déjà rapprochée du pointage : annulez les attributions avant cette correction'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER harvest_labor_entry_guard BEFORE UPDATE OR DELETE ON public.labor_entries FOR EACH ROW EXECUTE FUNCTION public.guard_harvest_labor_source();
CREATE TRIGGER harvest_labor_quantity_guard BEFORE UPDATE ON public.harvests FOR EACH ROW EXECUTE FUNCTION public.guard_harvest_labor_source();
REVOKE ALL ON FUNCTION public.guard_harvest_labor_source() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_harvest_labor_target(uuid,date,numeric),public.record_harvest_labor(uuid,uuid,uuid,integer,numeric,numeric,text),public.cancel_harvest_labor(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_harvest_labor_target(uuid,date,numeric),public.record_harvest_labor(uuid,uuid,uuid,integer,numeric,numeric,text),public.cancel_harvest_labor(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
