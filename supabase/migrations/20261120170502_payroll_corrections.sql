BEGIN;
SET LOCAL lock_timeout='5s';

-- The validated snapshot and payments survive every correction. Posting happens
-- atomically on revalidation, using the same period and slip IDs.
CREATE TABLE public.payroll_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 domain_id uuid NOT NULL REFERENCES public.domains(id),
 preparation_id uuid NOT NULL REFERENCES public.payroll_preparations(id),
 mode text NOT NULL CHECK(mode IN ('reopen','regularization')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','applied','cancelled')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
 original_preparation jsonb NOT NULL,original_slips jsonb NOT NULL,original_costs jsonb NOT NULL,
 revised_preparation jsonb,paid_at_open numeric NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 closed_by uuid REFERENCES auth.users(id),closed_at timestamptz,
 request_id uuid NOT NULL,UNIQUE(preparation_id,request_id)
);
CREATE UNIQUE INDEX payroll_one_open_correction ON public.payroll_corrections(preparation_id) WHERE status='open';
CREATE INDEX payroll_corrections_domain ON public.payroll_corrections(domain_id,preparation_id,created_at);
ALTER TABLE public.payroll_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_corrections_read ON public.payroll_corrections FOR SELECT TO authenticated USING (
 (coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(public.is_domain_member(domain_id,auth.uid()),false))
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'rh_paie','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
);
REVOKE ALL ON public.payroll_corrections FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.payroll_corrections TO authenticated;
ALTER TABLE public.payroll_preparations ADD COLUMN correction_id uuid REFERENCES public.payroll_corrections(id),
 ADD COLUMN correction_mode text CHECK(correction_mode IN ('reopen','regularization')),
 ADD COLUMN published_rows jsonb;

CREATE FUNCTION public.begin_payroll_correction(p_domain uuid,p_preparation uuid,p_revision integer,p_reason text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prep payroll_preparations%ROWTYPE;audit payroll_corrections%ROWTYPE;paid numeric;slips jsonb;costs jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
 OR NOT (coalesce(is_platform_admin(auth.uid()),false) OR coalesce(is_domain_member(p_domain,auth.uid()),false))
 OR NOT coalesce(has_domain_permission(p_domain,auth.uid(),'rh_paie','admin'),false)
 THEN RAISE EXCEPTION 'Correction de paie non autorisée' USING ERRCODE='42501'; END IF;
 SELECT * INTO prep FROM payroll_preparations WHERE id=p_preparation AND domain_id=p_domain;
 IF NOT FOUND THEN RAISE EXCEPTION 'Paie inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-month:'||prep.farm_id::text||':'||date_trunc('month',prep.start_date)::date::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-preparation:'||prep.farm_id::text||':'||prep.start_date::text,0));
 SELECT * INTO prep FROM payroll_preparations WHERE id=p_preparation FOR UPDATE;
 IF p_request IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Renseignez le motif de la correction'; END IF;
 SELECT * INTO audit FROM payroll_corrections WHERE preparation_id=prep.id AND request_id=p_request;
 IF FOUND THEN
   IF audit.reason<>btrim(p_reason) THEN RAISE EXCEPTION 'Requête de correction déjà utilisée'; END IF;
   RETURN to_jsonb(prep)-'last_request_fingerprint';
 END IF;
 IF prep.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'La préparation a changé. Rechargez la période.'; END IF;
 IF prep.status<>'validated' OR prep.correction_id IS NOT NULL THEN RAISE EXCEPTION 'Seule une paie validée peut être corrigée'; END IF;
 PERFORM w.id FROM workers w WHERE w.id IN(SELECT (r->>'worker_id')::uuid FROM jsonb_array_elements(prep.rows) r) ORDER BY w.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM payslips s JOIN payroll_periods period ON period.id=s.period_id
   WHERE s.worker_id IN(SELECT (r->>'worker_id')::uuid FROM jsonb_array_elements(prep.rows) r)
   AND period.start_date>prep.start_date AND date_trunc('month',period.start_date)=date_trunc('month',prep.start_date)
   AND period.status IN('valide','paye','cloture')) THEN
   RAISE EXCEPTION 'Une paie suivante du même mois est validée. Son impact doit être traité avant de corriger cette quinzaine.';
 END IF;
 SELECT coalesce(sum(amount),0) INTO paid FROM payroll_preparation_payments WHERE preparation_id=prep.id;
 IF EXISTS(SELECT 1 FROM payslips s WHERE s.period_id=prep.payroll_period_id AND s.status='paye'
 AND s.net_salary>coalesce((SELECT sum(amount) FROM payroll_preparation_payments WHERE payslip_id=s.id),0))
 THEN RAISE EXCEPTION 'Un bulletin est payé sans paiement détaillé. Rapprochez les paiements avant correction.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO slips FROM payslips s WHERE period_id=prep.payroll_period_id;
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO costs FROM cost_entries c WHERE payroll_period_id=prep.payroll_period_id;
 INSERT INTO payroll_corrections(domain_id,preparation_id,mode,reason,original_preparation,original_slips,original_costs,paid_at_open,created_by,request_id)
 VALUES(p_domain,prep.id,CASE WHEN paid>0 THEN 'regularization' ELSE 'reopen' END,btrim(p_reason),to_jsonb(prep)-'last_request_fingerprint',slips,costs,paid,auth.uid(),p_request) RETURNING * INTO audit;
 UPDATE payroll_preparations SET status='draft',correction_id=audit.id,correction_mode=audit.mode,published_rows=rows,
 rows=(SELECT jsonb_agg(r||jsonb_build_object('deductions_confirmed',false)) FROM jsonb_array_elements(rows) r),
 revision=revision+1,updated_by=auth.uid(),updated_at=now(),last_request_id=gen_random_uuid(),last_request_fingerprint='correction'
 WHERE id=prep.id RETURNING * INTO prep;
 RETURN to_jsonb(prep)-'last_request_fingerprint';
END $$;
REVOKE ALL ON FUNCTION public.begin_payroll_correction(uuid,uuid,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_payroll_correction(uuid,uuid,integer,text,uuid) TO authenticated;

CREATE FUNCTION public.cancel_payroll_correction(p_domain uuid,p_preparation uuid,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prep payroll_preparations%ROWTYPE;audit payroll_corrections%ROWTYPE;original payroll_preparations%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
 OR NOT (coalesce(is_platform_admin(auth.uid()),false) OR coalesce(is_domain_member(p_domain,auth.uid()),false))
 OR NOT coalesce(has_domain_permission(p_domain,auth.uid(),'rh_paie','admin'),false)
 THEN RAISE EXCEPTION 'Correction de paie non autorisée' USING ERRCODE='42501'; END IF;
 SELECT * INTO prep FROM payroll_preparations WHERE id=p_preparation AND domain_id=p_domain;
 IF NOT FOUND THEN RAISE EXCEPTION 'Paie inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-month:'||prep.farm_id::text||':'||date_trunc('month',prep.start_date)::date::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-preparation:'||prep.farm_id::text||':'||prep.start_date::text,0));
 SELECT * INTO prep FROM payroll_preparations WHERE id=p_preparation FOR UPDATE;
 IF prep.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'La préparation a changé. Rechargez la période.'; END IF;
 SELECT * INTO audit FROM payroll_corrections WHERE id=prep.correction_id AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aucune correction en cours'; END IF;
 SELECT * INTO original FROM jsonb_populate_record(NULL::payroll_preparations,audit.original_preparation);
 UPDATE payroll_preparations SET status='validated',rows=original.rows,campaign_id=original.campaign_id,pay_date=original.pay_date,
 attendance_period_id=original.attendance_period_id,attendance_revision=original.attendance_revision,
 correction_id=NULL,correction_mode=NULL,published_rows=NULL,revision=revision+1,
 updated_by=auth.uid(),updated_at=now(),last_request_id=gen_random_uuid(),last_request_fingerprint='cancel-correction'
 WHERE id=prep.id RETURNING * INTO prep;
 UPDATE payroll_corrections SET status='cancelled',closed_by=auth.uid(),closed_at=now() WHERE id=audit.id;
 RETURN to_jsonb(prep)-'last_request_fingerprint';
END $$;
REVOKE ALL ON FUNCTION public.cancel_payroll_correction(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_payroll_correction(uuid,uuid,integer) TO authenticated;

-- Preserve the current calculation, attendance, tenant and precision guards.
DO $patch$
DECLARE body text;old text;replacement text;
BEGIN
 body:=pg_get_functiondef('public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid)'::regprocedure);
 old:='AND p.start_date<=p_end AND p.end_date>=p_start) THEN RAISE EXCEPTION ''Un bulletin existe déjà pour un employé sur cette période'';';
 replacement:='AND p.start_date<=p_end AND p.end_date>=p_start AND p.id IS DISTINCT FROM prep.payroll_period_id) THEN RAISE EXCEPTION ''Un bulletin existe déjà pour un employé sur cette période'';';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'Version de save_payroll_preparation inattendue (périodes)'; END IF;
 body:=replace(body,old,replacement);
 old:='''brouillon'',prep.id) RETURNING id INTO new_period_id;';
 replacement:='''brouillon'',prep.id) ON CONFLICT (preparation_id) DO UPDATE SET status=''brouillon'',paid_at=NULL,pay_date=EXCLUDED.pay_date RETURNING id INTO new_period_id;
   DELETE FROM payslips WHERE period_id=new_period_id AND worker_id NOT IN(SELECT (r->>''worker_id'')::uuid FROM jsonb_array_elements(enriched) r);';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'Version de save_payroll_preparation inattendue (publication)'; END IF;
 body:=replace(body,old,replacement);
 old:='FROM jsonb_array_elements(enriched) r;';
 replacement:='FROM jsonb_array_elements(enriched) r ON CONFLICT (period_id,worker_id) DO UPDATE SET
 days_worked=EXCLUDED.days_worked,hours_worked=EXCLUDED.hours_worked,hours_overtime=EXCLUDED.hours_overtime,
 base_amount=EXCLUDED.base_amount,overtime_amount=EXCLUDED.overtime_amount,bonuses=EXCLUDED.bonuses,
 gross_salary=EXCLUDED.gross_salary,cnss_employee=EXCLUDED.cnss_employee,amo_employee=EXCLUDED.amo_employee,
 ir_amount=EXCLUDED.ir_amount,other_deductions=EXCLUDED.other_deductions,net_salary=EXCLUDED.net_salary,
 cnss_employer=EXCLUDED.cnss_employer,amo_employer=EXCLUDED.amo_employer,
 family_allowance_employer=EXCLUDED.family_allowance_employer,prof_training_employer=EXCLUDED.prof_training_employer,
 total_employer_cost=EXCLUDED.total_employer_cost,status=EXCLUDED.status,paid_at=NULL,notes=EXCLUDED.notes;
   DELETE FROM cost_entries WHERE payroll_period_id=new_period_id;';
 IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Version de save_payroll_preparation inattendue (bulletins)'; END IF;
 body:=replace(body,old,replacement);
 EXECUTE body;
END $patch$;
-- An open correction still owns its published slips. The standard payroll path
-- must not create a second payroll over those employees and dates.
DO $guard$
DECLARE body text;
BEGIN
 body:=pg_get_functiondef('public.guard_prepared_payroll()'::regprocedure);
 IF position('WHERE prep.status=''validated'' AND' IN body)=0 THEN RAISE EXCEPTION 'Version de guard_prepared_payroll inattendue'; END IF;
 EXECUTE replace(body,'WHERE prep.status=''validated'' AND','WHERE (prep.status=''validated'' OR prep.correction_id IS NOT NULL) AND');
END $guard$;
ALTER FUNCTION public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid) RENAME TO save_payroll_preparation_core;
REVOKE ALL ON FUNCTION public.save_payroll_preparation_core(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_payroll_preparation(
 p_domain uuid,p_farm uuid,p_start date,p_end date,p_campaign uuid,p_pay_date date,
 p_attendance_revision integer,p_revision integer,p_rows jsonb,p_action text,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prep payroll_preparations%ROWTYPE;audit payroll_corrections%ROWTYPE;result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
 OR NOT (coalesce(is_platform_admin(auth.uid()),false) OR coalesce(is_domain_member(p_domain,auth.uid()),false))
 OR NOT EXISTS(SELECT 1 FROM farms WHERE id=p_farm AND domain_id=p_domain)
 THEN RAISE EXCEPTION 'Modification de paie non autorisée' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-month:'||p_farm::text||':'||date_trunc('month',p_start)::date::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-preparation:'||p_farm::text||':'||p_start::text,0));
 SELECT * INTO prep FROM payroll_preparations WHERE farm_id=p_farm AND start_date=p_start FOR UPDATE;
 IF p_action='validate' AND EXISTS(
 SELECT 1 FROM payroll_preparations earlier WHERE earlier.farm_id=p_farm AND earlier.start_date<p_start
 AND date_trunc('month',earlier.start_date)=date_trunc('month',p_start) AND earlier.correction_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(earlier.published_rows,earlier.rows)) oldrow
 JOIN jsonb_array_elements(p_rows) newrow ON newrow->>'worker_id'=oldrow->>'worker_id')) THEN
   RAISE EXCEPTION 'Terminez la correction de la quinzaine précédente avant de valider cette paie.';
 END IF;
 IF prep.correction_id IS NOT NULL THEN
   SELECT * INTO audit FROM payroll_corrections WHERE id=prep.correction_id AND status='open' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Correction de paie incohérente'; END IF;
   IF EXISTS(SELECT 1 FROM payroll_preparation_payments payment WHERE payment.preparation_id=prep.id
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE r->>'worker_id'=payment.worker_id::text)) THEN
     RAISE EXCEPTION 'Un employé déjà payé ne peut pas être retiré. Corrigez son montant et contrôlez le trop-perçu.';
   END IF;
 END IF;
 result:=save_payroll_preparation_core(p_domain,p_farm,p_start,p_end,p_campaign,p_pay_date,p_attendance_revision,p_revision,p_rows,p_action,p_request);
 IF p_action='validate' AND audit.id IS NOT NULL THEN
   UPDATE payroll_preparations SET correction_id=NULL,correction_mode=NULL,published_rows=NULL WHERE id=prep.id RETURNING * INTO prep;
   UPDATE payroll_corrections SET status='applied',revised_preparation=to_jsonb(prep)-'last_request_fingerprint',closed_by=auth.uid(),closed_at=now() WHERE id=audit.id;
   UPDATE payslips s SET status=CASE WHEN paid.amount>=s.net_salary THEN 'paye' ELSE 'valide' END,
    paid_at=CASE WHEN paid.amount>=s.net_salary THEN paid.last_date END
   FROM (SELECT worker_id,sum(amount) amount,max(created_at) last_date FROM payroll_preparation_payments WHERE preparation_id=prep.id GROUP BY worker_id) paid
   WHERE s.period_id=prep.payroll_period_id AND s.worker_id=paid.worker_id;
   IF NOT EXISTS(SELECT 1 FROM payslips WHERE period_id=prep.payroll_period_id AND net_salary>0 AND status<>'paye') THEN
     UPDATE payroll_periods SET status='paye',paid_at=now() WHERE id=prep.payroll_period_id;
   END IF;
   result:=to_jsonb(prep)-'last_request_fingerprint';
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
