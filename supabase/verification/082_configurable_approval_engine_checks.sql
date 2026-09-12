SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('approval_policies','approval_requests','approval_decisions')
ORDER BY table_name;

SELECT d.code,p.process_code,p.operation_type,p.validation_enabled,r.code AS responsible_role,p.approval_levels,p.amount_threshold
FROM approval_policies p JOIN domains d ON d.id=p.domain_id LEFT JOIN roles r ON r.id=p.responsible_role_id
ORDER BY d.code,p.process_code,p.operation_type;

SELECT trigger_name,event_object_table FROM information_schema.triggers
WHERE trigger_schema='public' AND trigger_name IN ('trg_guard_purchase_approval','trg_optional_treatment_validation','trg_optional_stock_exit_validation')
ORDER BY trigger_name;
