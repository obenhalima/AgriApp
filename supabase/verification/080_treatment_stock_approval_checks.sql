-- Contrôles en lecture seule après application de la migration 080.
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('treatment_requests','treatment_request_products','stock_exit_requests')
ORDER BY table_name;

SELECT r.code, p.code AS approval_permission, rp.granted
FROM public.role_permissions rp
JOIN public.roles r ON r.id=rp.role_id
JOIN public.permissions p ON p.id=rp.permission_id
WHERE r.code='chef_exploitation'
  AND p.code IN ('agronomie.admin','stocks.admin')
ORDER BY p.code;

SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema='public'
  AND trigger_name='trg_guard_approved_stock_exit';
