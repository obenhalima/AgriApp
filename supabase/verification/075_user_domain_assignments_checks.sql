SELECT p.email, d.code AS domain_code, r.code AS role_code, dm.is_active, dm.is_default
FROM public.domain_memberships dm
JOIN public.profiles p ON p.id = dm.user_id
JOIN public.domains d ON d.id = dm.domain_id
JOIN public.roles r ON r.id = dm.role_id
ORDER BY p.email, dm.is_default DESC, d.code;

SELECT user_id, count(*) AS default_count
FROM public.domain_memberships
WHERE is_default
GROUP BY user_id
HAVING count(*) > 1;
