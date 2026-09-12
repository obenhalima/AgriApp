SELECT column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='treatment_request_products'
  AND column_name IN ('calculated_quantity','quantity_is_manual','quantity_override_justification')
ORDER BY column_name;

SELECT to_regprocedure('public.guard_treatment_product_dose_and_quantity()') AS quantity_guard,
       to_regprocedure('public.submit_treatment_request(jsonb,jsonb)') AS submission_function;

SELECT conname,pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.treatment_request_products'::regclass
  AND conname='treatment_product_manual_quantity_justified';
