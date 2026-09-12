SELECT id,product_id,target_name,is_active FROM public.product_authorized_uses WHERE NOT public.is_plausible_phyto_target(target_name) ORDER BY target_name;
SELECT count(*) AS invalid_active_uses FROM public.product_authorized_uses WHERE is_active AND NOT public.is_plausible_phyto_target(target_name);
