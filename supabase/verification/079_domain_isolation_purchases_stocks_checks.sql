SELECT d.code,count(DISTINCT s.id) suppliers,count(DISTINCT po.id) purchase_orders,count(DISTINCT si.id) supplier_invoices,count(DISTINCT st.id) stock_items,count(DISTINCT sm.id) stock_movements
FROM public.domains d LEFT JOIN suppliers s ON s.domain_id=d.id LEFT JOIN purchase_orders po ON po.domain_id=d.id LEFT JOIN supplier_invoices si ON si.domain_id=d.id LEFT JOIN stock_items st ON st.domain_id=d.id LEFT JOIN stock_movements sm ON sm.domain_id=d.id
GROUP BY d.id,d.code ORDER BY d.code;

SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='domain_id' AND table_name IN ('suppliers','purchase_orders','purchase_order_lines','supplier_invoices','payments_made','stock_items','stock_movements') ORDER BY table_name;
