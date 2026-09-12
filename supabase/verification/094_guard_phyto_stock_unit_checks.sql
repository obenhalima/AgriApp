SELECT p.commercial_name,s.name AS stock_item,s.unit,
       string_agg(DISTINCT public.normalize_phyto_dose_unit(u.dose_unit),', ') AS dose_units
FROM stock_items s JOIN plant_protection_products p ON p.id=s.plant_protection_product_id
LEFT JOIN product_authorized_uses u ON u.product_id=p.id AND u.domain_id=s.domain_id AND u.is_active
GROUP BY p.commercial_name,s.name,s.unit
HAVING NOT bool_or(public.phyto_stock_unit_compatible(s.unit,u.dose_unit));

SELECT to_regprocedure('public.phyto_stock_unit_compatible(text,text)') AS compatibility_function;
