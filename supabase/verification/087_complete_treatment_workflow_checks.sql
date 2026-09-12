-- Contrôles à exécuter après la migration 087.
SELECT to_regclass('public.treatment_request_targets') AS targets,
       to_regclass('public.treatment_applications') AS applications,
       to_regclass('public.treatment_application_products') AS application_products,
       to_regclass('public.treatment_efficacy_checks') AS efficacy_checks;

SELECT stock_item_id,name,current_qty,reserved_qty,projected_qty
FROM public.get_phyto_stock_projection((SELECT id FROM public.domains ORDER BY created_at LIMIT 1))
ORDER BY name;

SELECT tr.id,tr.status,count(DISTINCT trt.id) AS target_count,count(DISTINCT trp.id) AS product_count
FROM public.treatment_requests tr
LEFT JOIN public.treatment_request_targets trt ON trt.treatment_request_id=tr.id
LEFT JOIN public.treatment_request_products trp ON trp.treatment_request_id=tr.id
GROUP BY tr.id,tr.status
ORDER BY tr.created_at DESC;

SELECT tablename,policyname
FROM pg_policies
WHERE schemaname='public' AND tablename IN (
 'treatment_request_targets','treatment_applications','treatment_application_products','treatment_efficacy_checks'
)
ORDER BY tablename,policyname;
