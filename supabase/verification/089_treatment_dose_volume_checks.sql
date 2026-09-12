-- Contrôles après migration 089
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='product_authorized_uses'
  AND column_name LIKE 'spray_volume%'
ORDER BY column_name;

SELECT conname,pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.treatment_prescription_schedules'::regclass
  AND conname='treatment_prescription_schedules_frequency_check';

SELECT to_regprocedure('public.guard_treatment_product_dose_and_quantity()') AS dose_guard,
       to_regprocedure('public.submit_treatment_schedule(jsonb,jsonb,jsonb)') AS schedule_function;
