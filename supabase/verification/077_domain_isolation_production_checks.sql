SELECT d.code,
  count(DISTINCT c.id) campaigns,
  count(DISTINCT cp.id) plantings,
  count(DISTINCT h.id) harvests,
  count(DISTINCT hl.id) harvest_lots
FROM public.domains d
LEFT JOIN public.campaigns c ON c.domain_id = d.id
LEFT JOIN public.campaign_plantings cp ON cp.domain_id = d.id
LEFT JOIN public.harvests h ON h.domain_id = d.id
LEFT JOIN public.harvest_lots hl ON hl.domain_id = d.id
GROUP BY d.id, d.code ORDER BY d.code;

SELECT 'campaigns' entity, count(*) missing FROM public.campaigns WHERE domain_id IS NULL
UNION ALL SELECT 'campaign_plantings', count(*) FROM public.campaign_plantings WHERE domain_id IS NULL
UNION ALL SELECT 'harvests', count(*) FROM public.harvests WHERE domain_id IS NULL
UNION ALL SELECT 'harvest_lots', count(*) FROM public.harvest_lots WHERE domain_id IS NULL;

SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('campaigns','campaign_plantings','harvests','harvest_lots')
ORDER BY tablename, policyname;
