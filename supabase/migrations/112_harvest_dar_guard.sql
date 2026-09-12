-- Lot 3A / 112. Prérequis : 111. Aucun mécanisme de dérogation dans ce lot.
BEGIN;
ALTER TABLE public.treatment_applications ADD COLUMN dar_snapshot JSONB;

CREATE FUNCTION public.build_treatment_dar_snapshot(p_request UUID,p_sources JSONB)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH target_ids AS (
  SELECT campaign_planting_id FROM treatment_requests WHERE id=p_request
  UNION SELECT campaign_planting_id FROM treatment_request_targets WHERE treatment_request_id=p_request
 ), targets AS (
  SELECT DISTINCT cp.greenhouse_id FROM target_ids t JOIN campaign_plantings cp ON cp.id=t.campaign_planting_id
 ), products AS (
  SELECT line.id,line.catalog_product_id,COALESCE(line.product_name,p.commercial_name,'Produit') AS name,
   CASE WHEN source.phi IS NOT NULL THEN GREATEST(source.phi,line.phi_days)
    WHEN p.safety_data_verified AND p.authorization_status='autorise' AND u.is_active AND u.phi_days IS NOT NULL
     THEN GREATEST(u.phi_days,line.phi_days) ELSE NULL END AS phi
  FROM treatment_request_products line JOIN treatment_requests r ON r.id=line.treatment_request_id
  LEFT JOIN plant_protection_products p ON p.id=line.catalog_product_id AND p.domain_id=r.domain_id
  LEFT JOIN LATERAL treatment_planning_use(line.catalog_product_id,r.domain_id,r.target_name) u ON TRUE
  LEFT JOIN LATERAL (
   SELECT max(e.phi_days) AS phi FROM jsonb_array_elements(COALESCE(p_sources,'[]'::JSONB)) src
   JOIN phyto_positive_list_entries e ON e.id=(src->>'entry_id')::UUID
   WHERE e.product_id=line.catalog_product_id AND e.domain_id=r.domain_id
    AND src->>'product_id'=line.catalog_product_id::TEXT
  ) source ON TRUE WHERE line.treatment_request_id=p_request
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object('greenhouse_id',t.greenhouse_id,
  'product_id',p.catalog_product_id,'request_product_id',p.id,'product',p.name,'phi_days',p.phi)), '[]'::JSONB)
 FROM targets t CROSS JOIN products p
$$;
REVOKE ALL ON FUNCTION public.build_treatment_dar_snapshot(UUID,JSONB) FROM PUBLIC;

-- Reconstitution prudente : les données insuffisantes restent inconnues.
UPDATE public.treatment_applications a SET dar_snapshot=public.build_treatment_dar_snapshot(
 a.treatment_request_id,a.station_compliance_sources) WHERE a.application_status IN ('realisee','partielle');
UPDATE public.treatment_applications SET dar_snapshot='[]'::JSONB WHERE dar_snapshot IS NULL;
ALTER TABLE public.treatment_applications ALTER COLUMN dar_snapshot SET NOT NULL;

CREATE FUNCTION public.snapshot_application_dar() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.dar_snapshot IS DISTINCT FROM OLD.dar_snapshot
   OR NEW.actual_started_at IS DISTINCT FROM OLD.actual_started_at
   OR NEW.actual_ended_at IS DISTINCT FROM OLD.actual_ended_at
   OR NEW.application_status IS DISTINCT FROM OLD.application_status
   OR NEW.treatment_request_id IS DISTINCT FROM OLD.treatment_request_id
   OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
  THEN RAISE EXCEPTION 'Application confirmée : données DAR historiques non modifiables'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.actual_ended_at<NEW.actual_started_at THEN RAISE EXCEPTION 'Fin d’application antérieure au début'; END IF;
 NEW.dar_snapshot:=CASE WHEN NEW.application_status='non_realisee' THEN '[]'::JSONB
  ELSE build_treatment_dar_snapshot(NEW.treatment_request_id,NEW.station_compliance_sources) END;
 IF NEW.application_status<>'non_realisee' AND jsonb_array_length(NEW.dar_snapshot)=0 THEN
  RAISE EXCEPTION 'Aucune donnée produit/serre pour établir le contrôle DAR'; END IF;
 RETURN NEW;
END $$;
-- Après le contrôle de conformité qui renseigne station_compliance_sources.
CREATE TRIGGER trg_zz_snapshot_application_dar BEFORE INSERT OR UPDATE ON public.treatment_applications
 FOR EACH ROW EXECUTE FUNCTION public.snapshot_application_dar();

CREATE FUNCTION public.harvest_dar_eligible_date(p_end TIMESTAMPTZ,p_days INTEGER)
RETURNS DATE LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN p_end IS NULL OR p_days IS NULL THEN NULL
  WHEN p_days=0 THEN (p_end AT TIME ZONE 'Africa/Casablanca')::DATE ELSE
  ((p_end AT TIME ZONE 'Africa/Casablanca')::DATE+p_days+
   CASE WHEN (p_end AT TIME ZONE 'Africa/Casablanca')::TIME=TIME '00:00' THEN 0 ELSE 1 END) END
$$;

DO $tests$
BEGIN
 IF harvest_dar_eligible_date('2026-09-10 14:00:00+01',7) IS DISTINCT FROM DATE '2026-09-18'
 OR harvest_dar_eligible_date('2026-09-10 00:00:00+01',7) IS DISTINCT FROM DATE '2026-09-17'
 OR harvest_dar_eligible_date('2026-09-10 14:00:00+01',0) IS DISTINCT FROM DATE '2026-09-10'
 OR harvest_dar_eligible_date('2026-09-10 14:00:00+01',NULL) IS NOT NULL
 THEN RAISE EXCEPTION 'Échec des tests de calcul DAR'; END IF;
END $tests$;

CREATE FUNCTION public.harvest_dar_blockers(p_domain UUID,p_greenhouse UUID,p_date DATE)
RETURNS TABLE(application_id UUID,product TEXT,phi_days INTEGER,eligible_date DATE)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT a.id,entry->>'product',(entry->>'phi_days')::INTEGER,
  harvest_dar_eligible_date(COALESCE(a.actual_ended_at,a.actual_started_at),(entry->>'phi_days')::INTEGER)
 FROM treatment_applications a CROSS JOIN LATERAL jsonb_array_elements(a.dar_snapshot) entry
 WHERE a.domain_id=p_domain AND a.application_status IN ('realisee','partielle')
 AND (entry->>'greenhouse_id')::UUID=p_greenhouse
 AND (a.actual_started_at AT TIME ZONE 'Africa/Casablanca')::DATE<=p_date
 AND ((entry->>'phi_days') IS NULL OR p_date<harvest_dar_eligible_date(
  COALESCE(a.actual_ended_at,a.actual_started_at),(entry->>'phi_days')::INTEGER))
$$;
REVOKE ALL ON FUNCTION public.harvest_dar_blockers(UUID,UUID,DATE) FROM PUBLIC;

CREATE FUNCTION public.get_harvest_dar_blocks(p_planting UUID,p_date DATE)
RETURNS TABLE(application_id UUID,product TEXT,phi_days INTEGER,eligible_date DATE)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; greenhouse UUID;
BEGIN
 SELECT cp.domain_id,cp.greenhouse_id INTO d,greenhouse FROM campaign_plantings cp WHERE cp.id=p_planting;
 IF d IS NULL OR NOT COALESCE(has_domain_permission(d,auth.uid(),'recoltes','view'),FALSE)
 THEN RAISE EXCEPTION 'Récoltes inaccessibles pour ce client'; END IF;
 RETURN QUERY SELECT * FROM harvest_dar_blockers(d,greenhouse,p_date);
END $$;
REVOKE ALL ON FUNCTION public.get_harvest_dar_blocks(UUID,DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_harvest_dar_blocks(UUID,DATE) TO authenticated;

CREATE FUNCTION public.guard_harvest_dar() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; greenhouse UUID; message TEXT;
BEGIN
 SELECT cp.domain_id,cp.greenhouse_id INTO d,greenhouse FROM campaign_plantings cp WHERE cp.id=NEW.campaign_planting_id;
 IF d IS NULL OR d IS DISTINCT FROM NEW.domain_id THEN RAISE EXCEPTION 'Plantation hors du client de la récolte'; END IF;
 SELECT string_agg(product||' : '||CASE WHEN eligible_date IS NULL THEN 'DAR inconnu, régularisation requise'
  ELSE 'récolte autorisée à partir du '||to_char(eligible_date,'DD/MM/YYYY') END,' ; ')
 INTO message FROM harvest_dar_blockers(d,greenhouse,NEW.harvest_date);
 IF message IS NOT NULL THEN RAISE EXCEPTION 'Récolte bloquée — DAR : %',message; END IF;
 RETURN NEW;
END $$;
-- Vérifie aussi les changements de quantité, pas uniquement la date.
CREATE TRIGGER trg_zz_guard_harvest_dar BEFORE INSERT OR UPDATE ON public.harvests
 FOR EACH ROW EXECUTE FUNCTION public.guard_harvest_dar();
COMMIT;

-- Audit en lecture seule des récoltes historiques ; aucune suppression ni modification.
SELECT h.id AS harvest_id,h.harvest_date,cp.greenhouse_id,b.*
FROM harvests h JOIN campaign_plantings cp ON cp.id=h.campaign_planting_id
CROSS JOIN LATERAL harvest_dar_blockers(cp.domain_id,cp.greenhouse_id,h.harvest_date) b
ORDER BY h.harvest_date DESC;
