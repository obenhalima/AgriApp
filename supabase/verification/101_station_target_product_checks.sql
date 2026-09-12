SELECT to_regclass('public.v_active_station_phyto_products') AS eligibility_view;
SELECT authorization_status,catalog_source,count(*) FROM public.plant_protection_products GROUP BY authorization_status,catalog_source ORDER BY 1,2;
SELECT station_approved,review_status,count(*) FROM public.phyto_positive_list_entries GROUP BY station_approved,review_status ORDER BY 1,2;
SELECT domain_id,target_name,commercial_name,authorization_status,safety_data_verified,linked_to_stock,regulatory_ready FROM public.v_active_station_phyto_products ORDER BY target_name,commercial_name;
