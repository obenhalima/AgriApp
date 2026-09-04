SELECT d.code, count(DISTINCT bv.id) budget_versions, count(DISTINCT bl.id) budget_lines, count(DISTINCT ce.id) cost_entries
FROM public.domains d
LEFT JOIN public.budget_versions bv ON bv.domain_id=d.id
LEFT JOIN public.budget_lines bl ON bl.domain_id=d.id
LEFT JOIN public.cost_entries ce ON ce.domain_id=d.id
GROUP BY d.id,d.code ORDER BY d.code;

SELECT 'budget_versions' entity,count(*) missing FROM public.budget_versions WHERE domain_id IS NULL
UNION ALL SELECT 'budget_lines',count(*) FROM public.budget_lines WHERE domain_id IS NULL
UNION ALL SELECT 'cost_entries',count(*) FROM public.cost_entries WHERE domain_id IS NULL;
