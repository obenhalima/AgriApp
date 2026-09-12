SELECT to_regprocedure('public.validate_positive_list_globally(uuid)') AS global_validation_rpc;
SELECT authorization_status,safety_data_verified,count(*) FROM public.plant_protection_products WHERE authorization_number LIKE 'IMPORT-LP-%' GROUP BY authorization_status,safety_data_verified;
SELECT review_status,count(*) FROM public.phyto_positive_list_entries GROUP BY review_status;
