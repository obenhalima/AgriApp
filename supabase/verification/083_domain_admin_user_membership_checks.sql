SELECT routine_name FROM information_schema.routines
WHERE routine_schema='public' AND routine_name='set_user_membership_in_managed_domain';

SELECT d.code,p.email,r.code AS role_code,dm.is_active,dm.is_default
FROM domain_memberships dm JOIN domains d ON d.id=dm.domain_id
JOIN profiles p ON p.id=dm.user_id JOIN roles r ON r.id=dm.role_id
ORDER BY d.code,p.email;
