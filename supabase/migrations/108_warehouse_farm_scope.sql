-- 108 : rattachement entrepôt/ferme et périmètre des prescriptions. Après 107B.
BEGIN;
-- NOT VALID conserve les anciens entrepôts sans ferme ; nouvelles écritures contrôlées.
ALTER TABLE public.warehouses ADD CONSTRAINT warehouse_farm_required
 CHECK (farm_id IS NOT NULL) NOT VALID;

CREATE OR REPLACE FUNCTION public.guard_warehouse_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.code:=upper(btrim(NEW.code)); NEW.name:=btrim(NEW.name);
 IF NULLIF(NEW.code,'') IS NULL OR NULLIF(NEW.name,'') IS NULL THEN
  RAISE EXCEPTION 'Code et nom de l’entrepôt obligatoires'; END IF;
 IF NEW.farm_id IS NULL OR NOT EXISTS(SELECT 1 FROM farms
  WHERE id=NEW.farm_id AND domain_id=NEW.domain_id AND is_active)
 THEN RAISE EXCEPTION 'Sélectionner une ferme active du même client pour cet entrepôt'; END IF;
 IF TG_OP='UPDATE' AND NEW.domain_id IS DISTINCT FROM OLD.domain_id THEN
  RAISE EXCEPTION 'Le client d’un entrepôt existant ne peut pas être changé'; END IF;
 IF TG_OP='UPDATE' AND OLD.farm_id IS NOT NULL AND
  (NEW.farm_id IS DISTINCT FROM OLD.farm_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id)
 THEN
  IF EXISTS(SELECT 1 FROM warehouse_stocks WHERE warehouse_id=OLD.id AND current_qty<>0)
   OR EXISTS(SELECT 1 FROM stock_movements WHERE warehouse_id=OLD.id)
   OR EXISTS(SELECT 1 FROM treatment_requests WHERE warehouse_id=OLD.id)
   OR EXISTS(SELECT 1 FROM stock_exit_requests WHERE warehouse_id=OLD.id)
   OR EXISTS(SELECT 1 FROM stock_transfers WHERE source_id=OLD.id OR destination_id=OLD.id)
  THEN RAISE EXCEPTION 'Entrepôt déjà utilisé : conserver sa ferme et passer par un transfert de stock'; END IF;
 END IF;
 IF NEW.is_default AND NOT NEW.is_active THEN RAISE EXCEPTION 'L’entrepôt principal doit rester actif'; END IF;
 NEW.updated_at:=NOW(); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_treatment_warehouse()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE farm UUID;
BEGIN
 SELECT g.farm_id INTO farm FROM campaign_plantings cp
 JOIN greenhouses g ON g.id=cp.greenhouse_id JOIN farms f ON f.id=g.farm_id
 WHERE cp.id=NEW.campaign_planting_id AND cp.domain_id=NEW.domain_id
 AND f.domain_id=NEW.domain_id AND f.is_active;
 IF farm IS NULL OR NOT EXISTS(SELECT 1 FROM warehouses w
  WHERE w.id=NEW.warehouse_id AND w.domain_id=NEW.domain_id AND w.farm_id=farm AND w.is_active)
 THEN RAISE EXCEPTION 'L’entrepôt doit être actif et rattaché à la ferme de la prescription'; END IF;
 IF EXISTS(SELECT 1 FROM treatment_request_targets t
  JOIN campaign_plantings cp ON cp.id=t.campaign_planting_id
  JOIN greenhouses g ON g.id=cp.greenhouse_id
  WHERE t.treatment_request_id=NEW.id AND (cp.domain_id IS DISTINCT FROM NEW.domain_id OR g.farm_id IS DISTINCT FROM farm))
 THEN RAISE EXCEPTION 'Toutes les serres doivent appartenir à la même ferme'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_treatment_warehouse ON public.treatment_requests;
CREATE TRIGGER trg_treatment_warehouse BEFORE INSERT OR UPDATE OF warehouse_id,domain_id,campaign_planting_id
 ON public.treatment_requests FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_warehouse();

CREATE OR REPLACE FUNCTION public.guard_treatment_target_farm()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM treatment_requests r
  JOIN warehouses w ON w.id=r.warehouse_id AND w.domain_id=r.domain_id AND w.is_active
  JOIN campaign_plantings cp ON cp.id=NEW.campaign_planting_id AND cp.domain_id=r.domain_id
  JOIN greenhouses g ON g.id=cp.greenhouse_id AND g.farm_id=w.farm_id
  WHERE r.id=NEW.treatment_request_id AND r.domain_id=NEW.domain_id)
 THEN RAISE EXCEPTION 'Serre hors de la ferme de l’entrepôt sélectionné'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_treatment_target_farm BEFORE INSERT OR UPDATE ON public.treatment_request_targets
 FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_target_farm();

-- Recontrôle à l'application des anciennes prescriptions, sans réécrire leur historique.
CREATE OR REPLACE FUNCTION public.guard_application_warehouse_farm()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r treatment_requests%ROWTYPE; farm UUID;
BEGIN
 IF NEW.application_status='non_realisee' THEN RETURN NEW; END IF;
 SELECT * INTO r FROM treatment_requests WHERE id=NEW.treatment_request_id;
 SELECT g.farm_id INTO farm FROM campaign_plantings cp JOIN greenhouses g ON g.id=cp.greenhouse_id
 WHERE cp.id=r.campaign_planting_id AND cp.domain_id=r.domain_id;
 IF NOT EXISTS(SELECT 1 FROM warehouses w JOIN farms f ON f.id=w.farm_id AND f.is_active
  WHERE w.id=r.warehouse_id AND w.domain_id=r.domain_id AND f.domain_id=r.domain_id
  AND w.farm_id=farm AND w.is_active)
 OR EXISTS(SELECT 1 FROM treatment_request_targets t
  JOIN campaign_plantings cp ON cp.id=t.campaign_planting_id JOIN greenhouses g ON g.id=cp.greenhouse_id
  WHERE t.treatment_request_id=r.id AND (cp.domain_id IS DISTINCT FROM r.domain_id OR g.farm_id IS DISTINCT FROM farm))
 THEN RAISE EXCEPTION 'Rattachement entrepôt/ferme à régulariser avant application'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_application_warehouse_farm BEFORE INSERT ON public.treatment_applications
 FOR EACH ROW EXECUTE FUNCTION public.guard_application_warehouse_farm();
COMMIT;

SELECT w.id,w.domain_id,w.code,w.name,w.farm_id,'Ferme à rattacher' AS action_requise
FROM public.warehouses w WHERE w.farm_id IS NULL ORDER BY w.domain_id,w.name;
