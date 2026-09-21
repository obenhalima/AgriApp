-- Correction administrative uniquement. Ne constitue pas une dérogation DAR.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.guard_harvest_dar() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; greenhouse UUID; message TEXT;
BEGIN
 SELECT cp.domain_id,cp.greenhouse_id INTO d,greenhouse FROM campaign_plantings cp WHERE cp.id=NEW.campaign_planting_id;
 IF d IS NULL OR d IS DISTINCT FROM NEW.domain_id THEN RAISE EXCEPTION 'Plantation hors du client de la récolte'; END IF;
 IF TG_OP='UPDATE' THEN
  -- total_qty est généré depuis les quantités, qui restent comparées ici.
  -- Toute autre modification (date, plantation, poids, client...) garde le contrôle.
  IF (to_jsonb(NEW)-ARRAY['harvest_people','total_qty'])
     IS NOT DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['harvest_people','total_qty'])
  THEN RETURN NEW; END IF;
 END IF;
 SELECT string_agg(product||' : '||CASE WHEN eligible_date IS NULL THEN 'DAR inconnu, régularisation requise'
  ELSE 'récolte autorisée à partir du '||to_char(eligible_date,'DD/MM/YYYY') END,' ; ')
 INTO message FROM harvest_dar_blockers(d,greenhouse,NEW.harvest_date);
 IF message IS NOT NULL THEN RAISE EXCEPTION 'Récolte bloquée — DAR : %',message; END IF;
 RETURN NEW;
END $$;
COMMIT;
