SELECT domain_id,default_spray_volume_l_ha FROM public.phyto_compliance_settings ORDER BY domain_id;
SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('treatment_applications','treatment_application_products') AND column_name IN ('actual_treated_area_m2','actual_water_volume_liters','actual_spray_volume_l_ha','calculated_actual_quantity','quantity_is_manual','quantity_override_justification') ORDER BY table_name,column_name;
SELECT to_regprocedure('public.confirm_treatment_application(uuid,jsonb,jsonb)') AS confirmation_rpc;
