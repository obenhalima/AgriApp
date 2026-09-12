SELECT to_regprocedure('public.save_phyto_target(uuid,uuid,text,text,text[],boolean)') AS save_rpc;
SELECT to_regprocedure('public.merge_phyto_targets(uuid,uuid,uuid)') AS merge_rpc;
SELECT id,canonical_name,category,aliases,is_active,merged_into_id FROM public.phyto_targets ORDER BY canonical_name;
