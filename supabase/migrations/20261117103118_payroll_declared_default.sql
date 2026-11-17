BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.workers ALTER COLUMN is_declared SET DEFAULT true;
COMMENT ON COLUMN public.workers.is_declared IS 'Declaration defaults to true when omitted or NULL. Explicit false remains undeclared.';
CREATE FUNCTION public.default_worker_declaration() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.is_declared:=coalesce(NEW.is_declared,true);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.default_worker_declaration() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER worker_declaration_default BEFORE INSERT OR UPDATE OF is_declared ON public.workers
FOR EACH ROW EXECUTE FUNCTION public.default_worker_declaration();

-- Preserve the current function bodies and ACLs while changing only the NULL default.
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.payroll_net_amounts(numeric,boolean,date,integer,jsonb)'::regprocedure);
 IF position('IF p_declared IS DISTINCT FROM true THEN' IN definition)=0 THEN RAISE EXCEPTION 'Appliquez payroll_net_rates avant cette migration'; END IF;
 EXECUTE replace(definition,'IF p_declared IS DISTINCT FROM true THEN','IF p_declared IS FALSE THEN');
 definition:=pg_get_functiondef('public.payroll_net_context(uuid,uuid,date)'::regprocedure);
 IF position('w.id worker_id,w.is_declared,' IN definition)=0 THEN RAISE EXCEPTION 'Version du contexte de paie inattendue'; END IF;
 EXECUTE replace(definition,'w.id worker_id,w.is_declared,','w.id worker_id,coalesce(w.is_declared,true) is_declared,');
 definition:=pg_get_functiondef('public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid)'::regprocedure);
 IF position('Statut déclaré à renseigner dans la fiche employé' IN definition)=0 THEN RAISE EXCEPTION 'Version de préparation de paie inattendue'; END IF;
 definition:=replace(definition,'IF p_action=''validate'' AND worker.is_declared IS NULL THEN RAISE EXCEPTION ''Statut déclaré à renseigner dans la fiche employé''; END IF;','');
 definition:=replace(definition,'worker.is_declared IS TRUE','worker.is_declared IS DISTINCT FROM FALSE');
 definition:=replace(definition,'payroll_net_amounts(target_net,worker.is_declared,','payroll_net_amounts(target_net,coalesce(worker.is_declared,true),');
 definition:=replace(definition,'''is_declared'',worker.is_declared,','''is_declared'',coalesce(worker.is_declared,true),');
 EXECUTE definition;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
