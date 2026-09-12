-- Contrôles après migration 090
SELECT column_name,is_nullable,data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('plant_protection_products','product_authorized_uses')
  AND column_name IN ('toxicology_class','hazard_pictograms','hazard_statements','precautionary_statements','safety_data_verified','dose_type','application_period','treatment_mode','rei_hours')
ORDER BY table_name,column_name;

SELECT to_regprocedure('public.set_phyto_safety_verification_audit()') AS audit_function,
       to_regprocedure('public.require_phyto_safety_before_prescription()') AS prescription_guard;

SELECT commercial_name,safety_data_verified,safety_verified_at
FROM public.plant_protection_products ORDER BY commercial_name;
