SELECT public.normalize_phyto_dose_unit(value) AS normalized_unit,value AS original_unit
FROM (VALUES ('mL / 100 L'),('ml/hl'),('cc/hl'),('g/hl'),('L/ha'),('kg/1000 m²')) AS samples(value);

SELECT dose_unit,count(*)
FROM public.product_authorized_uses
GROUP BY dose_unit ORDER BY dose_unit;

SELECT to_regprocedure('public.normalize_phyto_dose_unit(text)') AS normalization_function,
       to_regprocedure('public.guard_treatment_product_dose_and_quantity()') AS quantity_guard;
