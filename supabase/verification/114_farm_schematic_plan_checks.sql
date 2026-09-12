-- Contrôles en lecture seule, après application de 114.
SELECT to_regclass('public.farm_schematic_plans') AS table_plan,
 to_regprocedure('public.save_farm_schematic_plan(uuid,integer,jsonb)') AS sauvegarde_rpc;
SELECT relrowsecurity AS rls_active FROM pg_class WHERE oid='public.farm_schematic_plans'::regclass;
SELECT has_table_privilege('authenticated','public.farm_schematic_plans','SELECT') AS lecture,
 has_table_privilege('authenticated','public.farm_schematic_plans','INSERT') AS insertion_directe_doit_etre_false,
 has_table_privilege('authenticated','public.farm_schematic_plans','UPDATE') AS modification_directe_doit_etre_false;
-- Attendu : zéro ligne (aucun plan associé au mauvais client).
SELECT p.farm_id FROM public.farm_schematic_plans p JOIN public.farms f ON f.id=p.farm_id
 WHERE p.domain_id IS DISTINCT FROM f.domain_id;
-- Attendu : zéro ligne (aucune forme liée à une serre étrangère / supprimée).
SELECT p.farm_id,shape->>'greenhouse_id' AS greenhouse_id
 FROM public.farm_schematic_plans p CROSS JOIN LATERAL jsonb_array_elements(p.shapes) shape
 LEFT JOIN public.greenhouses g ON g.id=(shape->>'greenhouse_id')::uuid
 WHERE g.id IS NULL OR g.farm_id IS DISTINCT FROM p.farm_id;
