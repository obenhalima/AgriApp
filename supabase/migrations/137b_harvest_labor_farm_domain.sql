-- Complément si 137 est déjà appliquée : le domaine des serres vient de farms.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.record_harvest_labor(p_id uuid,p_harvest uuid,p_team uuid,p_count integer,p_hours numeric,p_kg numeric,p_notes text DEFAULT NULL) RETURNS uuid
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
REVOKE ALL ON FUNCTION public.record_harvest_labor(uuid,uuid,uuid,integer,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_harvest_labor(uuid,uuid,uuid,integer,numeric,numeric,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
