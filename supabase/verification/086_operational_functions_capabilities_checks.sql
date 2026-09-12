-- Contrôles à exécuter après la migration 086.
SELECT code,name FROM public.operational_functions ORDER BY code;
SELECT code,name,is_sensitive FROM public.business_capabilities ORDER BY code;

SELECT ap.name,ap.approval_levels,apl.level_number,bc.code AS required_capability,r.name AS fallback_role
FROM public.approval_policies ap
LEFT JOIN public.approval_policy_levels apl ON apl.policy_id=ap.id
LEFT JOIN public.business_capabilities bc ON bc.id=apl.required_capability_id
LEFT JOIN public.roles r ON r.id=apl.responsible_role_id
ORDER BY ap.domain_id,ap.priority,apl.level_number;

SELECT tablename,policyname
FROM pg_policies
WHERE schemaname='public' AND tablename IN (
  'operational_functions','business_capabilities','function_capabilities',
  'user_function_assignments','user_capability_overrides','approval_policy_levels','organization_security_audit'
)
ORDER BY tablename,policyname;

-- Doit rester faux pour toute demande appartenant au même utilisateur :
SELECT ar.id,ar.requested_by=ar.requested_by AS requester_identity_check
FROM public.approval_requests ar LIMIT 5;
