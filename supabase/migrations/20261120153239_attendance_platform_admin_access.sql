BEGIN;
SET LOCAL lock_timeout='5s';

-- Match the existing platform-admin access model. No user, role, membership,
-- permission grant, or central membership helper is changed.
DO $migration$
DECLARE signature text; definition text; patched text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.save_employee_attendance(uuid,uuid,date,date,integer,jsonb,text,uuid)',
  'public.review_employee_attendance(uuid,uuid,integer,uuid,date,text,text,text,uuid)',
  'public.payroll_net_context(uuid,uuid,date)',
  'public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid)',
  'public.record_payroll_preparation_payment(uuid,uuid,numeric,date,text,text,uuid)'
 ] LOOP
  IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'Migration RH précédente manquante : %',signature; END IF;
  definition:=pg_get_functiondef(to_regprocedure(signature));
  patched:=replace(definition,'coalesce(is_domain_member(p_domain,auth.uid()),false)',
   '(coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(is_domain_member(p_domain,auth.uid()),false))');
  patched:=replace(patched,'coalesce(is_domain_member(prep.domain_id,auth.uid()),false)',
   '(coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(is_domain_member(prep.domain_id,auth.uid()),false))');
  IF patched=definition THEN RAISE EXCEPTION 'Contrôle de rattachement inattendu dans %. Aucune modification appliquée.',signature; END IF;
  EXECUTE patched;
 END LOOP;
END $migration$;

ALTER POLICY attendance_period_read ON public.employee_attendance_periods USING (
 (coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(public.is_domain_member(domain_id,auth.uid()),false))
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'pointage','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
ALTER POLICY attendance_record_read ON public.employee_attendance_records USING (
 (coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(public.is_domain_member(domain_id,auth.uid()),false))
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'pointage','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
ALTER POLICY preparation_read ON public.payroll_preparations USING (
 (coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(public.is_domain_member(domain_id,auth.uid()),false))
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'rh_paie','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
ALTER POLICY preparation_payment_read ON public.payroll_preparation_payments USING (
 (coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(public.is_domain_member(domain_id,auth.uid()),false))
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'rh_paie','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
NOTIFY pgrst,'reload schema';
COMMIT;
