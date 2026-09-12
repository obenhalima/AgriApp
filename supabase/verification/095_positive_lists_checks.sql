SELECT to_regclass('public.phyto_targets') AS targets,
       to_regclass('public.phyto_positive_lists') AS positive_lists,
       to_regclass('public.phyto_positive_list_entries') AS positive_list_entries;
SELECT canonical_name,category,aliases FROM public.phyto_targets ORDER BY category,canonical_name;
SELECT domain_id,version,status,count(*) OVER(PARTITION BY domain_id,status) AS versions_with_same_status
FROM public.phyto_positive_lists ORDER BY imported_at DESC;
