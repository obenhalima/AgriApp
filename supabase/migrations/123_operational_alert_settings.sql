BEGIN;
CREATE TABLE public.operational_alert_settings (
 domain_id UUID PRIMARY KEY REFERENCES public.domains(id),
 stock_enabled BOOLEAN NOT NULL DEFAULT true,
 treatment_enabled BOOLEAN NOT NULL DEFAULT true,
 harvest_enabled BOOLEAN NOT NULL DEFAULT true,
 treatment_horizon_days INTEGER NOT NULL DEFAULT 15 CHECK(treatment_horizon_days BETWEEN 1 AND 365),
 treatment_delay_hours INTEGER NOT NULL DEFAULT 0 CHECK(treatment_delay_hours BETWEEN 0 AND 720),
 no_harvest_days INTEGER NOT NULL DEFAULT 3 CHECK(no_harvest_days BETWEEN 1 AND 365)
);
ALTER TABLE public.operational_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY operational_alert_read ON public.operational_alert_settings FOR SELECT TO authenticated
 USING(public.is_domain_member(domain_id,auth.uid()));
CREATE POLICY operational_alert_admin ON public.operational_alert_settings FOR ALL TO authenticated
 USING(public.is_domain_admin(domain_id,auth.uid())) WITH CHECK(public.is_domain_admin(domain_id,auth.uid()));
REVOKE ALL ON public.operational_alert_settings FROM anon;
GRANT SELECT,INSERT,UPDATE ON public.operational_alert_settings TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
