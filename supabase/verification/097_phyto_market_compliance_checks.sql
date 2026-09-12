SELECT to_regclass('public.phyto_compliance_settings') settings,to_regclass('public.phyto_market_requirements') markets,to_regclass('public.phyto_mrl_limits') limits;
SELECT domain_id,mrl_strategy,internal_safety_factor FROM public.phyto_compliance_settings;
SELECT to_regprocedure('public.get_effective_phyto_mrl(uuid,text,text,uuid[])') effective_mrl_function;
