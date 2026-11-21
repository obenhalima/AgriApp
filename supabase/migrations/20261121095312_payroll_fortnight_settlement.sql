BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE public.payroll_fortnight_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid NOT NULL REFERENCES public.domains(id),
 preparation_id uuid NOT NULL REFERENCES public.payroll_preparations(id),preparation_revision integer NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0),worker_count integer NOT NULL CHECK(worker_count>0),
 payment_date date NOT NULL,payment_method text NOT NULL CHECK(payment_method IN('cash','virement','cheque')),
 reference text CHECK(length(reference)<=255),payments jsonb NOT NULL CHECK(jsonb_typeof(payments)='array'),
 expected_total numeric NOT NULL,request_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(preparation_id,request_id)
);
CREATE INDEX payroll_fortnight_settlement_scope ON public.payroll_fortnight_settlements(domain_id,preparation_id,created_at);
ALTER TABLE public.payroll_fortnight_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_fortnight_settlement_read ON public.payroll_fortnight_settlements FOR SELECT TO authenticated USING(
 (coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(public.is_domain_member(domain_id,auth.uid()),false))
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'rh_paie','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
REVOKE ALL ON public.payroll_fortnight_settlements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.payroll_fortnight_settlements TO authenticated;

-- Payment flags are not new financial amounts. Do not repost costs when only
-- paid status/date change, including when the original cost entries are absent.
DO $guards$
DECLARE definition text;patched text;
BEGIN
 definition:=pg_get_functiondef('public.trg_payslip_change()'::regprocedure);
 patched:=regexp_replace(definition,'\mBEGIN\M',
 'BEGIN
 IF TG_OP=''UPDATE'' AND (to_jsonb(NEW)-ARRAY[''status'',''paid_at'',''updated_at'']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY[''status'',''paid_at'',''updated_at'']) THEN RETURN NEW; END IF;', 'i');
 IF patched=definition THEN RAISE EXCEPTION 'Déclencheur de coût des bulletins inattendu'; END IF;
 EXECUTE patched;
 definition:=pg_get_functiondef('public.trg_payroll_period_status_change()'::regprocedure);
 patched:=regexp_replace(definition,'\mBEGIN\M',
 'BEGIN
 IF OLD.status IN(''valide'',''paye'',''cloture'') AND NEW.status IN(''paye'',''cloture'') THEN RETURN NEW; END IF;', 'i');
 IF patched=definition THEN RAISE EXCEPTION 'Déclencheur de coût de la période inattendu'; END IF;
 EXECUTE patched;
END $guards$;

CREATE FUNCTION public.settle_payroll_fortnight(p_preparation uuid,p_revision integer,p_expected_total numeric,p_date date,p_method text,p_reference text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prep payroll_preparations%ROWTYPE;receipt payroll_fortnight_settlements%ROWTYPE;
 item record;payment jsonb;posted jsonb:='[]';total numeric:=0;workers integer:=0;
BEGIN
 SELECT * INTO prep FROM payroll_preparations WHERE id=p_preparation FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
 OR NOT (coalesce(is_platform_admin(auth.uid()),false) OR coalesce(is_domain_member(prep.domain_id,auth.uid()),false))
 OR NOT coalesce(has_domain_permission(prep.domain_id,auth.uid(),'rh_paie','edit'),false)
 THEN RAISE EXCEPTION 'Règlement de paie non autorisé' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_revision IS NULL OR p_date IS NULL OR p_date<'1900-01-01' OR p_date>'2200-12-31'
 OR p_method IS NULL OR p_method NOT IN('cash','virement','cheque') OR length(coalesce(p_reference,''))>255
 OR p_expected_total IS NULL OR p_expected_total::text IN('NaN','Infinity','-Infinity') OR p_expected_total<0
 OR p_expected_total<>round(p_expected_total,2) THEN RAISE EXCEPTION 'Règlement de quinzaine invalide'; END IF;
 SELECT * INTO receipt FROM payroll_fortnight_settlements WHERE preparation_id=prep.id AND request_id=p_request;
 IF FOUND THEN
  IF receipt.preparation_revision<>p_revision OR receipt.expected_total<>p_expected_total OR receipt.payment_date<>p_date
  OR receipt.payment_method<>p_method OR receipt.reference IS DISTINCT FROM nullif(btrim(p_reference),'')
  THEN RAISE EXCEPTION 'Requête de règlement déjà utilisée'; END IF;
  RETURN to_jsonb(receipt);
 END IF;
 IF prep.status<>'validated' OR prep.correction_id IS NOT NULL THEN RAISE EXCEPTION 'Validez la paie et terminez les corrections avant de la marquer payée.'; END IF;
 IF prep.revision<>p_revision THEN RAISE EXCEPTION 'La préparation a changé. Rechargez la période.'; END IF;
 PERFORM id FROM payslips WHERE period_id=prep.payroll_period_id ORDER BY worker_id FOR UPDATE;
 IF jsonb_array_length(prep.rows)=0 OR (SELECT count(*) FROM payslips WHERE period_id=prep.payroll_period_id)<>jsonb_array_length(prep.rows)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(prep.rows) r LEFT JOIN payslips s ON s.period_id=prep.payroll_period_id AND s.worker_id=(r->>'worker_id')::uuid
 WHERE s.id IS NULL OR s.net_salary IS NULL OR s.net_salary<0 OR s.net_salary IS DISTINCT FROM (r->>'net_salary')::numeric)
 THEN RAISE EXCEPTION 'Les bulletins et la paie ne correspondent pas. Vérifiez la période avant règlement.'; END IF;
 FOR item IN SELECT s.worker_id,greatest(0,s.net_salary-coalesce((SELECT sum(p.amount) FROM payroll_preparation_payments p
 WHERE p.preparation_id=prep.id AND p.worker_id=s.worker_id),0)) balance FROM payslips s WHERE s.period_id=prep.payroll_period_id ORDER BY s.worker_id LOOP
  total:=total+item.balance;IF item.balance>0 THEN workers:=workers+1;END IF;
 END LOOP;
 IF total IS DISTINCT FROM p_expected_total THEN RAISE EXCEPTION 'Les paiements ont changé. Actualisez la quinzaine avant de confirmer.'; END IF;
 IF total=0 THEN RAISE EXCEPTION 'Aucun solde à payer pour cette quinzaine.'; END IF;
 FOR item IN SELECT s.worker_id,greatest(0,s.net_salary-coalesce((SELECT sum(p.amount) FROM payroll_preparation_payments p
 WHERE p.preparation_id=prep.id AND p.worker_id=s.worker_id),0)) balance FROM payslips s WHERE s.period_id=prep.payroll_period_id ORDER BY s.worker_id LOOP
  IF item.balance=0 THEN CONTINUE; END IF;
  payment:=record_payroll_preparation_payment(prep.id,item.worker_id,item.balance,p_date,p_method,p_reference,gen_random_uuid());
  posted:=posted||jsonb_build_array(payment);
 END LOOP;
 INSERT INTO payroll_fortnight_settlements(domain_id,preparation_id,preparation_revision,amount,worker_count,payment_date,payment_method,reference,payments,expected_total,request_id,created_by)
 VALUES(prep.domain_id,prep.id,prep.revision,total,workers,p_date,p_method,nullif(btrim(p_reference),''),posted,p_expected_total,p_request,auth.uid()) RETURNING * INTO receipt;
 RETURN to_jsonb(receipt);
END $$;
REVOKE ALL ON FUNCTION public.settle_payroll_fortnight(uuid,integer,numeric,date,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_payroll_fortnight(uuid,integer,numeric,date,text,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
