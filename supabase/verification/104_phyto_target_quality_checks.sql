SELECT canonical_name,is_active,is_verified FROM public.phyto_targets ORDER BY is_verified,canonical_name;
SELECT id,list_id,source_page,source_row,target_label,review_status FROM public.phyto_positive_list_entries WHERE target_label='Cible à identifier';
SELECT target_name,count(*) FROM public.v_active_station_phyto_products GROUP BY target_name ORDER BY target_name;
