-- Run whole file as postgres in the Supabase SQL Editor (without RLS mode).
-- DOES NOT CALL any delete/reset/truncate routine or change business rows.
-- Intentionally disables the legacy /admin/demo-reset destructive RPCs for API roles.
-- Their implementation is retained, with an additional fail-closed platform-admin gate.
-- The direct destructive helper is internal too: no anon/authenticated/service_role EXECUTE.
-- Do not rerun legacy 036/067 or the old recovery SQL from /admin/demo-reset afterwards.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $secure_resets$
DECLARE signature text; f oid; definition text; role_name text; language_name text;
BEGIN
 IF to_regprocedure('public.is_platform_admin(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Helper is_platform_admin absent : transaction annulée'; END IF;
 FOREACH signature IN ARRAY ARRAY[
  'public.admin_delete_campaign(uuid)',
  'public.admin_nuclear_wipe()',
  'public.admin_operational_reset()',
  'public._admin_truncate_table(text)'
 ] LOOP
  f:=to_regprocedure(signature);
  IF f IS NULL THEN RAISE EXCEPTION 'Fonction attendue absente : %, transaction annulée',signature; END IF;
  SELECT l.lanname INTO language_name FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=f;
  definition:=pg_get_functiondef(f);
  IF language_name<>'plpgsql' OR definition !~* '\mBEGIN\M' THEN
   RAISE EXCEPTION 'Définition inattendue pour % : transmettre la définition pour revue',signature;
  END IF;
  IF position('-- ITRIX_SECURITY_RESET_GATE_V1' IN definition)=0 THEN
   -- This mandatory guard precedes the legacy NULL-prone check and ALL side effects.
   definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n -- ITRIX_SECURITY_RESET_GATE_V1\n IF auth.uid() IS NULL OR NOT coalesce(public.is_platform_admin(auth.uid()),false) THEN\n  RAISE EXCEPTION ''Opération de maintenance globale interdite depuis ce contexte.'' USING ERRCODE=''42501'';\n END IF;','i');
   EXECUTE definition;
  END IF;
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f::regprocedure);
  -- Check effective grants, including PUBLIC and inherited roles. Never weaken membership globally.
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_function_privilege(role_name,f,'EXECUTE') THEN
    RAISE EXCEPTION 'EXECUTE hérité reste présent pour % sur % : transaction annulée, transmettre cette erreur',role_name,signature;
   END IF;
  END LOOP;
 END LOOP;
END;
$secure_resets$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Expected: four entries, all three *_execute flags false and guard_present true.
-- The fourth is the private helper used by the two reset routines.
SELECT p.oid::regprocedure::text AS routine,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute,
 position('-- ITRIX_SECURITY_RESET_GATE_V1' IN p.prosrc)>0 AS guard_present
FROM pg_proc p
WHERE p.oid IN (
 'public.admin_delete_campaign(uuid)'::regprocedure,
 'public.admin_nuclear_wipe()'::regprocedure,
 'public.admin_operational_reset()'::regprocedure,
 'public._admin_truncate_table(text)'::regprocedure
)
ORDER BY routine;
