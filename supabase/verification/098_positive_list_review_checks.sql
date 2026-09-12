-- Vérifications migration 098
SELECT to_regprocedure('public.activate_phyto_positive_list(uuid)') AS activation_rpc;
SELECT to_regprocedure('public.normalize_positive_list_key(text)') AS normalization_function;
SELECT domain_id,count(*) FROM public.phyto_positive_lists WHERE status='active' GROUP BY domain_id HAVING count(*)>1;
SELECT list_id,count(*) AS remaining_to_review FROM public.phyto_positive_list_entries WHERE review_status='a_controler' GROUP BY list_id;
