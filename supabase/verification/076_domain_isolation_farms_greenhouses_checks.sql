SELECT d.code AS domain_code, count(f.id) AS farms
FROM public.domains d LEFT JOIN public.farms f ON f.domain_id = d.id
GROUP BY d.id, d.code ORDER BY d.code;

SELECT d.code AS domain_code, count(g.id) AS greenhouses
FROM public.domains d
LEFT JOIN public.farms f ON f.domain_id = d.id
LEFT JOIN public.greenhouses g ON g.farm_id = f.id
GROUP BY d.id, d.code ORDER BY d.code;

SELECT count(*) AS farms_without_domain FROM public.farms WHERE domain_id IS NULL;

SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('farms', 'greenhouses')
ORDER BY tablename, policyname;
