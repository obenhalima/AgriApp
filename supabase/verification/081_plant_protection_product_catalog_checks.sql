SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('plant_protection_products','product_authorized_uses')
ORDER BY table_name;

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='stock_items' AND column_name='plant_protection_product_id';

SELECT trigger_name,event_object_table FROM information_schema.triggers
WHERE trigger_schema='public' AND trigger_name IN ('trg_sync_phyto_use_domain','trg_guard_stock_phyto_product')
ORDER BY trigger_name;
