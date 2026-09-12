SELECT jsonb_build_object(
 'report_function',to_regprocedure('public.get_production_cost_data(uuid,uuid,date,date)') IS NOT NULL,
 'receipt_function',to_regprocedure('public.receive_costed_purchase(uuid,jsonb)') IS NOT NULL,
 'snapshot_function',to_regprocedure('public.confirm_treatment_application(uuid,jsonb,jsonb)') IS NOT NULL,
 'direct_order_function',to_regprocedure('public.create_costed_direct_order(jsonb)') IS NOT NULL,
 'archived_purchase_costs',(SELECT count(*) FROM public.inventory_cost_migration_archive),
 'consumption_cost_lines',(SELECT count(*) FROM public.cost_entries WHERE source_stock_movement_id IS NOT NULL),
 'opening_value_events',(SELECT count(*) FROM public.inventory_value_events WHERE event_kind='opening'),
 'balances_with_unknown_value',(SELECT count(*) FROM public.warehouse_stocks WHERE current_qty>0 AND inventory_value IS NULL),
 'balances_needing_confirmation',(SELECT count(*) FROM public.warehouse_stocks WHERE current_qty>0 AND NOT valuation_verified)
) AS deployment_verification;
