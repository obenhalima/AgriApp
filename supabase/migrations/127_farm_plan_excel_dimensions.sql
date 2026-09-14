-- Preserve Excel layout proportions; drawing dimensions never modify official areas.
BEGIN;
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.save_farm_schematic_plan(uuid,integer,jsonb)'::regprocedure) INTO definition;
 IF position('w NOT BETWEEN 60 AND 300 OR h NOT BETWEEN 40 AND 300' IN definition)>0 THEN
  definition:=replace(definition,'w NOT BETWEEN 60 AND 300 OR h NOT BETWEEN 40 AND 300','w NOT BETWEEN 12 AND 1160 OR h NOT BETWEEN 12 AND 760');
  EXECUTE definition;
 ELSIF position('w NOT BETWEEN 12 AND 1160 OR h NOT BETWEEN 12 AND 760' IN definition)=0 THEN
  RAISE EXCEPTION 'Unexpected plan validator: review migration before applying';
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
