BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE public.payroll_preparations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 domain_id uuid NOT NULL REFERENCES public.domains(id), farm_id uuid NOT NULL REFERENCES public.farms(id),
 start_date date NOT NULL,end_date date NOT NULL,pay_date date NOT NULL,
 campaign_id uuid REFERENCES public.campaigns(id),
 attendance_period_id uuid REFERENCES public.employee_attendance_periods(id), attendance_revision integer,
 payroll_period_id uuid REFERENCES public.payroll_periods(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','validated')),
 revision integer NOT NULL DEFAULT 1,rows jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 validated_by uuid REFERENCES auth.users(id),validated_at timestamptz,
 last_request_id uuid NOT NULL,last_request_fingerprint text NOT NULL,
 UNIQUE(farm_id,start_date),
 CHECK(jsonb_typeof(rows)='array'),CHECK(revision>0),
 CHECK((extract(day FROM start_date)=1 AND end_date=start_date+14) OR
 (extract(day FROM start_date)=16 AND end_date=(date_trunc('month',start_date)+interval '1 month - 1 day')::date))
);
CREATE INDEX payroll_preparation_domain ON public.payroll_preparations(domain_id,start_date);
ALTER TABLE public.payroll_periods ADD COLUMN preparation_id uuid UNIQUE REFERENCES public.payroll_preparations(id);

CREATE TABLE public.payroll_preparation_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 preparation_id uuid NOT NULL REFERENCES public.payroll_preparations(id),domain_id uuid NOT NULL REFERENCES public.domains(id),
 worker_id uuid NOT NULL REFERENCES public.workers(id), payslip_id uuid NOT NULL REFERENCES public.payslips(id),
 amount numeric(10,2) NOT NULL CHECK(amount>0),payment_date date NOT NULL,
 payment_method text NOT NULL CHECK(payment_method IN('cash','virement','cheque')),reference text,
 request_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(preparation_id,request_id),CHECK(reference IS NULL OR length(reference)<=255)
);
CREATE INDEX payroll_preparation_payment_domain ON public.payroll_preparation_payments(domain_id,preparation_id);
ALTER TABLE public.payroll_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_preparation_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY preparation_read ON public.payroll_preparations FOR SELECT TO authenticated USING(
 coalesce(is_domain_member(domain_id,auth.uid()),false) AND coalesce(has_domain_permission(domain_id,auth.uid(),'rh_paie','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
CREATE POLICY preparation_payment_read ON public.payroll_preparation_payments FOR SELECT TO authenticated USING(
 coalesce(is_domain_member(domain_id,auth.uid()),false) AND coalesce(has_domain_permission(domain_id,auth.uid(),'rh_paie','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
REVOKE ALL ON public.payroll_preparations,public.payroll_preparation_payments FROM anon,authenticated;
GRANT SELECT ON public.payroll_preparations,public.payroll_preparation_payments TO authenticated;

-- Existing permissive administrator policies must also respect the new preparation's domain.
CREATE POLICY prepared_period_scope ON public.payroll_periods AS RESTRICTIVE TO authenticated USING(
 preparation_id IS NULL OR EXISTS(SELECT 1 FROM public.payroll_preparations p WHERE p.id=preparation_id))
 WITH CHECK(preparation_id IS NULL OR EXISTS(SELECT 1 FROM public.payroll_preparations p WHERE p.id=preparation_id));
CREATE POLICY prepared_period_read ON public.payroll_periods FOR SELECT TO authenticated USING(
 preparation_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.payroll_preparations p WHERE p.id=preparation_id));
CREATE POLICY prepared_slip_scope ON public.payslips AS RESTRICTIVE TO authenticated USING(
 EXISTS(SELECT 1 FROM public.payroll_periods p WHERE p.id=period_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.payroll_periods p WHERE p.id=period_id));
CREATE POLICY prepared_slip_read ON public.payslips FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.payroll_periods p WHERE p.id=period_id AND p.preparation_id IS NOT NULL));

CREATE FUNCTION public.guard_prepared_payroll() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE managed boolean;
BEGIN
 IF TG_TABLE_NAME='payroll_periods' THEN
   IF TG_OP='DELETE' THEN managed:=OLD.preparation_id IS NOT NULL;
   ELSIF TG_OP='INSERT' THEN managed:=NEW.preparation_id IS NOT NULL;
   ELSE managed:=OLD.preparation_id IS NOT NULL OR NEW.preparation_id IS NOT NULL; END IF;
 ELSE
   IF TG_OP<>'DELETE' THEN
     PERFORM id FROM workers WHERE id=NEW.worker_id FOR UPDATE;
     IF EXISTS(SELECT 1 FROM payroll_periods period CROSS JOIN payroll_preparations prep
       JOIN payslips other ON other.period_id=prep.payroll_period_id AND other.worker_id=NEW.worker_id
       WHERE prep.status='validated' AND period.id=NEW.period_id AND period.preparation_id IS NULL AND period.start_date<=prep.end_date AND period.end_date>=prep.start_date) THEN
       RAISE EXCEPTION 'Une préparation validée existe déjà pour cet employé sur cette période';
     END IF;
   END IF;
   SELECT EXISTS(SELECT 1 FROM payroll_periods WHERE id IN(
     CASE WHEN TG_OP<>'INSERT' THEN OLD.period_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.period_id END)
     AND preparation_id IS NOT NULL) INTO managed;
 END IF;
 IF managed AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
   RAISE EXCEPTION 'Utilisez la préparation de paie pour cette période' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_prepared_payroll() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_prepared_period BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_periods FOR EACH ROW EXECUTE FUNCTION public.guard_prepared_payroll();
CREATE TRIGGER guard_prepared_slip BEFORE INSERT OR UPDATE OR DELETE ON public.payslips FOR EACH ROW EXECUTE FUNCTION public.guard_prepared_payroll();

CREATE FUNCTION public.guard_paid_attendance() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM payroll_preparations WHERE attendance_period_id=OLD.id AND status='validated') THEN
   RAISE EXCEPTION 'Ce pointage est utilisé par une paie validée';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_paid_attendance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_paid_attendance BEFORE UPDATE OF status,revision ON public.employee_attendance_periods FOR EACH ROW EXECUTE FUNCTION public.guard_paid_attendance();

CREATE FUNCTION public.save_payroll_preparation(
 p_domain uuid,p_farm uuid,p_start date,p_end date,p_campaign uuid,p_pay_date date,
 p_attendance_revision integer,p_revision integer,p_rows jsonb,p_action text,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 prep payroll_preparations%ROWTYPE; att employee_attendance_periods%ROWTYPE; worker workers%ROWTYPE;
 found_prep boolean; row jsonb; previous jsonb; enriched jsonb:='[]'; fingerprint text;
 normal numeric; overtime numeric; rate_n numeric; rate_s numeric; amount_n numeric; amount_s numeric;
 gross numeric; net numeric; employer numeric; field text; value numeric; original_n numeric; original_s numeric;
 total_n numeric; total_s numeric; has_attendance boolean:=false; new_period_id uuid; end_expected date;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
 OR NOT coalesce(is_domain_member(p_domain,auth.uid()),false) THEN RAISE EXCEPTION 'Paie non autorisée' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_start IS NULL OR p_end IS NULL OR p_pay_date IS NULL OR p_revision IS NULL OR p_revision<0
 OR p_action IS NULL OR p_action NOT IN('save','validate') OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_rows)>500 OR octet_length(p_rows::text)>2000000 THEN RAISE EXCEPTION 'Préparation de paie invalide'; END IF;
 IF extract(day FROM p_start)=1 THEN end_expected:=p_start+14;
 ELSIF extract(day FROM p_start)=16 THEN end_expected:=(date_trunc('month',p_start)+interval '1 month - 1 day')::date;
 ELSE RAISE EXCEPTION 'Choisissez une quinzaine'; END IF;
 IF p_end<>end_expected THEN RAISE EXCEPTION 'Dates de la quinzaine incohérentes'; END IF;
 IF NOT EXISTS(SELECT 1 FROM farms f JOIN domains d ON d.id=f.domain_id WHERE f.id=p_farm AND f.domain_id=p_domain AND f.is_active AND d.is_active) THEN RAISE EXCEPTION 'Ferme inaccessible pour ce client'; END IF;
 IF p_campaign IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_campaign AND farm_id=p_farm) THEN RAISE EXCEPTION 'Campagne inaccessible pour cette ferme'; END IF;
 IF p_action='validate' AND (p_campaign IS NULL OR jsonb_array_length(p_rows)=0) THEN RAISE EXCEPTION 'Choisissez une campagne et au moins un employé'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-preparation:'||p_farm::text||':'||p_start::text,0));
 SELECT * INTO prep FROM payroll_preparations WHERE farm_id=p_farm AND start_date=p_start FOR UPDATE;
 found_prep:=FOUND;
 IF found_prep AND prep.domain_id<>p_domain THEN RAISE EXCEPTION 'Préparation inaccessible' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(has_domain_permission(p_domain,auth.uid(),'rh_paie',CASE WHEN found_prep THEN 'edit' ELSE 'create' END),false)
 OR (p_action='validate' AND NOT coalesce(has_domain_permission(p_domain,auth.uid(),'rh_paie','admin'),false)) THEN RAISE EXCEPTION 'Modification de paie non autorisée' USING ERRCODE='42501'; END IF;
 fingerprint:=md5(jsonb_build_array(p_domain,p_farm,p_start,p_end,p_campaign,p_pay_date,p_attendance_revision,p_rows,p_action)::text);
 IF found_prep AND prep.last_request_id=p_request THEN
   IF prep.last_request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Requête déjà utilisée pour une autre préparation'; END IF;
   RETURN to_jsonb(prep)-'last_request_fingerprint';
 END IF;
 IF (found_prep AND prep.revision<>p_revision) OR (NOT found_prep AND p_revision<>0) THEN RAISE EXCEPTION 'La préparation a changé. Rechargez la période.'; END IF;
 IF found_prep AND prep.status='validated' THEN RAISE EXCEPTION 'La paie validée est figée'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r GROUP BY r->>'worker_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Employé présent plusieurs fois'; END IF;
 SELECT * INTO att FROM employee_attendance_periods WHERE domain_id=p_domain AND farm_id=p_farm AND start_date=p_start FOR SHARE;
 -- Stable worker records provide the original rates and the name snapshots.
 PERFORM w.id FROM workers w WHERE w.id IN(SELECT (r->>'worker_id')::uuid FROM jsonb_array_elements(p_rows) r) ORDER BY w.id FOR UPDATE;
 FOR row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
   IF jsonb_typeof(row) IS DISTINCT FROM 'object' OR coalesce(row->>'source','') NOT IN('attendance','manual')
   OR jsonb_typeof(row->'deductions_confirmed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Ligne de paie invalide'; END IF;
   SELECT * INTO worker FROM workers WHERE id=(row->>'worker_id')::uuid AND farm_id=p_farm;
   IF NOT FOUND THEN RAISE EXCEPTION 'Employé inaccessible pour cette ferme'; END IF;
   FOREACH field IN ARRAY ARRAY['normal_hours','overtime_hours','normal_rate','overtime_rate','bonuses','advance','other_deductions','cnss_employee','amo_employee','ir_amount','cnss_employer','amo_employer','family_allowance_employer','prof_training_employer'] LOOP
     IF NOT(row ? field) OR jsonb_typeof(row->field) NOT IN('number','null') THEN RAISE EXCEPTION 'Champ numérique invalide'; END IF;
     value:=(row->>field)::numeric;
     IF value IS NULL AND field NOT IN('normal_hours','overtime_hours','normal_rate','overtime_rate') THEN RAISE EXCEPTION 'Renseignez les ajustements, zéro si aucun'; END IF;
     IF value<0 OR value>99999999 OR value<>round(value,CASE WHEN field IN('normal_rate','overtime_rate') THEN 9 ELSE 2 END) THEN RAISE EXCEPTION 'Valeur numérique invalide'; END IF;
   END LOOP;
   normal:=(row->>'normal_hours')::numeric; overtime:=(row->>'overtime_hours')::numeric;
   rate_n:=(row->>'normal_rate')::numeric; rate_s:=(row->>'overtime_rate')::numeric;
   IF coalesce(normal,0)+coalesce(overtime,0)>(p_end-p_start+1)*24 THEN RAISE EXCEPTION 'Le total des heures dépasse la durée de la période'; END IF;
   SELECT sum(normal_hours),sum(overtime_hours) INTO total_n,total_s FROM employee_attendance_records WHERE period_id=att.id AND worker_id=worker.id;
   IF row->>'source'='attendance' THEN
     IF att.status IS DISTINCT FROM 'validated' OR att.revision IS DISTINCT FROM p_attendance_revision OR total_n IS NULL
     OR normal IS DISTINCT FROM total_n OR overtime IS DISTINCT FROM total_s THEN RAISE EXCEPTION 'Le pointage a changé ou reste à valider. Rechargez la période.'; END IF;
     IF NOT coalesce(has_domain_permission(p_domain,auth.uid(),'pointage','view'),false) THEN RAISE EXCEPTION 'Accès au pointage requis' USING ERRCODE='42501'; END IF;
     has_attendance:=true;
   ELSIF total_n IS NOT NULL OR EXISTS(SELECT 1 FROM employee_attendance_records WHERE period_id=att.id AND worker_id=worker.id) THEN RAISE EXCEPTION 'Un pointage existe pour cet employé. Validez et utilisez son pointage.';
   END IF;
   IF p_action='validate' AND (normal IS NULL OR overtime IS NULL OR (normal>0 AND rate_n IS NULL) OR (overtime>0 AND rate_s IS NULL) OR NOT(row->>'deductions_confirmed')::boolean) THEN RAISE EXCEPTION 'Heures, taux ou retenues à confirmer'; END IF;
   SELECT r INTO previous FROM jsonb_array_elements(coalesce(prep.rows,'[]')) r WHERE r->>'worker_id'=worker.id::text;
   original_n:=CASE WHEN previous IS NOT NULL THEN (previous->>'original_normal_rate')::numeric ELSE worker.normal_hourly_rate END;
   original_s:=CASE WHEN previous IS NOT NULL THEN (previous->>'original_overtime_rate')::numeric ELSE worker.overtime_hourly_rate END;
   amount_n:=round(coalesce(normal,0)*coalesce(rate_n,0),2); amount_s:=round(coalesce(overtime,0)*coalesce(rate_s,0),2);
   gross:=amount_n+amount_s+(row->>'bonuses')::numeric;
   net:=gross-(row->>'advance')::numeric-(row->>'other_deductions')::numeric-(row->>'cnss_employee')::numeric-(row->>'amo_employee')::numeric-(row->>'ir_amount')::numeric;
   employer:=gross+(row->>'cnss_employer')::numeric+(row->>'amo_employer')::numeric+(row->>'family_allowance_employer')::numeric+(row->>'prof_training_employer')::numeric;
   IF net<0 OR employer>99999999 THEN RAISE EXCEPTION 'Les retenues dépassent le brut ou le montant est trop élevé'; END IF;
   -- Whitelist input fields. Client-calculated amounts and names are never trusted.
   SELECT jsonb_object_agg(e.key,e.value) INTO row FROM jsonb_each(row) e WHERE e.key IN('worker_id','source','normal_hours','overtime_hours','normal_rate','overtime_rate','bonuses','advance','other_deductions','cnss_employee','amo_employee','ir_amount','cnss_employer','amo_employer','family_allowance_employer','prof_training_employer','deductions_confirmed');
   enriched:=enriched||jsonb_build_array(row||jsonb_build_object('worker_name',btrim(worker.last_name||' '||worker.first_name),'worker_code',coalesce(nullif(worker.matricule,''),worker.id::text),'original_normal_rate',original_n,'original_overtime_rate',original_s,'worker_category',CASE WHEN previous IS NOT NULL THEN previous->>'worker_category' ELSE worker.category END,'base_amount',amount_n,'overtime_amount',amount_s,'gross_salary',gross,'net_salary',net,'total_employer_cost',employer));
 END LOOP;
 IF NOT found_prep THEN
   INSERT INTO payroll_preparations(domain_id,farm_id,start_date,end_date,pay_date,created_by,updated_by,last_request_id,last_request_fingerprint)
   VALUES(p_domain,p_farm,p_start,p_end,p_pay_date,auth.uid(),auth.uid(),p_request,fingerprint) RETURNING * INTO prep;
 END IF;
 UPDATE payroll_preparations SET rows=enriched,campaign_id=p_campaign,pay_date=p_pay_date,
 attendance_period_id=CASE WHEN has_attendance THEN att.id END,attendance_revision=CASE WHEN has_attendance THEN att.revision END,
 revision=CASE WHEN found_prep THEN revision+1 ELSE revision END,updated_by=auth.uid(),updated_at=now(),
 last_request_id=p_request,last_request_fingerprint=fingerprint WHERE id=prep.id RETURNING * INTO prep;
 IF p_action='validate' THEN
   -- Prevent a second hourly payroll over the same employee and overlapping legacy periods.
   IF EXISTS(SELECT 1 FROM payslips s JOIN payroll_periods p ON p.id=s.period_id WHERE s.worker_id IN(SELECT (r->>'worker_id')::uuid FROM jsonb_array_elements(enriched) r) AND p.start_date<=p_end AND p.end_date>=p_start) THEN RAISE EXCEPTION 'Un bulletin existe déjà pour un employé sur cette période'; END IF;
   INSERT INTO payroll_periods(code,period_year,period_month,period_half,start_date,end_date,pay_date,status,preparation_id)
   VALUES('P-'||replace(prep.id::text,'-','')::varchar(28),extract(year FROM p_start)::int,extract(month FROM p_start)::int,CASE WHEN extract(day FROM p_start)=1 THEN 'first' ELSE 'second' END,p_start,p_end,p_pay_date,'brouillon',prep.id) RETURNING id INTO new_period_id;
   INSERT INTO payslips(period_id,worker_id,days_worked,hours_worked,hours_overtime,base_amount,overtime_amount,bonuses,gross_salary,cnss_employee,amo_employee,ir_amount,other_deductions,net_salary,cnss_employer,amo_employer,family_allowance_employer,prof_training_employer,total_employer_cost,status,notes)
   SELECT new_period_id,(r->>'worker_id')::uuid,round((r->>'normal_hours')::numeric/8,2),(r->>'normal_hours')::numeric,(r->>'overtime_hours')::numeric,(r->>'base_amount')::numeric,(r->>'overtime_amount')::numeric,(r->>'bonuses')::numeric,(r->>'gross_salary')::numeric,(r->>'cnss_employee')::numeric,(r->>'amo_employee')::numeric,(r->>'ir_amount')::numeric,(r->>'other_deductions')::numeric+(r->>'advance')::numeric,(r->>'net_salary')::numeric,(r->>'cnss_employer')::numeric,(r->>'amo_employer')::numeric,(r->>'family_allowance_employer')::numeric,(r->>'prof_training_employer')::numeric,(r->>'total_employer_cost')::numeric,'valide','Préparation horaire '||prep.id::text FROM jsonb_array_elements(enriched) r;
   UPDATE payroll_preparations SET status='validated',payroll_period_id=new_period_id,validated_by=auth.uid(),validated_at=now() WHERE id=prep.id RETURNING * INTO prep;
   -- The existing payroll trigger generates the cost entries atomically.
   UPDATE payroll_periods SET status='valide',validated_at=now() WHERE id=new_period_id;
 END IF;
 RETURN to_jsonb(prep)-'last_request_fingerprint';
END $$;
REVOKE ALL ON FUNCTION public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid) TO authenticated;

CREATE FUNCTION public.record_payroll_preparation_payment(p_preparation uuid,p_worker uuid,p_amount numeric,p_date date,p_method text,p_reference text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prep payroll_preparations%ROWTYPE; slip payslips%ROWTYPE; payment payroll_preparation_payments%ROWTYPE; total numeric;
BEGIN
 SELECT * INTO prep FROM payroll_preparations WHERE id=p_preparation FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
 OR NOT coalesce(is_domain_member(prep.domain_id,auth.uid()),false) OR NOT coalesce(has_domain_permission(prep.domain_id,auth.uid(),'rh_paie','edit'),false) THEN RAISE EXCEPTION 'Paiement non autorisé' USING ERRCODE='42501'; END IF;
 IF prep.status<>'validated' OR p_request IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) OR p_date IS NULL OR p_method IS NULL OR p_method NOT IN('cash','virement','cheque') OR length(coalesce(p_reference,''))>255 THEN RAISE EXCEPTION 'Paiement invalide'; END IF;
 SELECT * INTO payment FROM payroll_preparation_payments WHERE preparation_id=prep.id AND request_id=p_request;
 IF FOUND THEN
   IF payment.worker_id<>p_worker OR payment.amount<>p_amount OR payment.payment_date<>p_date OR payment.payment_method<>p_method OR payment.reference IS DISTINCT FROM nullif(btrim(p_reference),'') THEN RAISE EXCEPTION 'Requête de paiement déjà utilisée'; END IF;
   RETURN to_jsonb(payment);
 END IF;
 SELECT * INTO slip FROM payslips WHERE period_id=prep.payroll_period_id AND worker_id=p_worker FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bulletin inaccessible'; END IF;
 SELECT coalesce(sum(amount),0) INTO total FROM payroll_preparation_payments WHERE preparation_id=prep.id AND worker_id=p_worker;
 IF total+p_amount>slip.net_salary THEN RAISE EXCEPTION 'Le paiement dépasse le net restant à payer'; END IF;
 INSERT INTO payroll_preparation_payments(preparation_id,domain_id,worker_id,payslip_id,amount,payment_date,payment_method,reference,request_id,created_by)
 VALUES(prep.id,prep.domain_id,p_worker,slip.id,p_amount,p_date,p_method,nullif(btrim(p_reference),''),p_request,auth.uid()) RETURNING * INTO payment;
 IF total+p_amount=slip.net_salary THEN UPDATE payslips SET status='paye',paid_at=now() WHERE id=slip.id; END IF;
 IF NOT EXISTS(SELECT 1 FROM payslips WHERE period_id=prep.payroll_period_id AND net_salary>0 AND status<>'paye') THEN UPDATE payroll_periods SET status='paye',paid_at=now() WHERE id=prep.payroll_period_id; END IF;
 RETURN to_jsonb(payment);
END $$;
REVOKE ALL ON FUNCTION public.record_payroll_preparation_payment(uuid,uuid,numeric,date,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_payroll_preparation_payment(uuid,uuid,numeric,date,text,text,uuid) TO authenticated;

-- Prepared payroll uses its explicitly selected campaign and exact cent allocation.
CREATE FUNCTION public.sync_prepared_payroll_costs(p_period_id uuid) RETURNS integer
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE prep payroll_preparations%ROWTYPE; inserted integer;
BEGIN
 SELECT p.* INTO prep FROM payroll_preparations p JOIN payroll_periods period ON period.preparation_id=p.id WHERE period.id=p_period_id AND period.status IN('valide','paye','cloture');
 IF NOT FOUND THEN RETURN 0; END IF;
 IF prep.status<>'validated' OR NOT EXISTS(SELECT 1 FROM campaigns WHERE id=prep.campaign_id AND farm_id=prep.farm_id) THEN RAISE EXCEPTION 'Campagne de paie incohérente'; END IF;
 IF EXISTS(SELECT 1 FROM cost_entries WHERE payroll_period_id=p_period_id) THEN
   SELECT count(*) INTO inserted FROM cost_entries WHERE payroll_period_id=p_period_id;
   RETURN inserted;
 END IF;
 IF EXISTS(
   SELECT 1 FROM jsonb_array_elements(prep.rows) r
   WHERE ((r->>'gross_salary')::numeric>0 AND NOT EXISTS(SELECT 1 FROM account_categories WHERE code=CASE WHEN r->>'worker_category'='staff_admin' THEN 'MO_ADMIN' ELSE 'MOD' END))
   OR ((r->>'total_employer_cost')::numeric>(r->>'gross_salary')::numeric AND NOT EXISTS(SELECT 1 FROM account_categories WHERE code='CHARGES_SOC'))
 ) THEN RAISE EXCEPTION 'Catégorie de coût MOD, MO_ADMIN ou CHARGES_SOC manquante'; END IF;
 WITH amounts AS (
   SELECT CASE WHEN r->>'worker_category'='staff_admin' THEN 'MO_ADMIN' ELSE 'MOD' END code,(r->>'gross_salary')::numeric amount FROM jsonb_array_elements(prep.rows) r
   UNION ALL SELECT 'CHARGES_SOC',(r->>'total_employer_cost')::numeric-(r->>'gross_salary')::numeric FROM jsonb_array_elements(prep.rows) r
 ), totals AS (SELECT code,sum(amount) amount FROM amounts GROUP BY code HAVING sum(amount)>0),
 areas AS (
   SELECT DISTINCT g.id,coalesce(nullif(g.exploitable_area,0),g.total_area,0)::numeric area
   FROM campaign_plantings cp JOIN greenhouses g ON g.id=cp.greenhouse_id
   WHERE cp.campaign_id=prep.campaign_id AND g.farm_id=prep.farm_id AND coalesce(nullif(g.exploitable_area,0),g.total_area,0)>0
 ), weights AS (
   SELECT id,area/sum(area) OVER() weight FROM areas
   UNION ALL SELECT NULL::uuid,1::numeric WHERE NOT EXISTS(SELECT 1 FROM areas)
 ), shares AS (
   SELECT t.code,t.amount,w.id,t.amount*100*w.weight raw_cents FROM totals t CROSS JOIN weights w
 ), ranked AS (
   SELECT *,floor(raw_cents) base_cents,row_number() OVER(PARTITION BY code ORDER BY raw_cents-floor(raw_cents) DESC,id) rank,
   amount*100-sum(floor(raw_cents)) OVER(PARTITION BY code) extra_cents FROM shares
 )
 INSERT INTO cost_entries(campaign_id,greenhouse_id,account_category_id,cost_category,amount,entry_date,description,is_planned,payroll_period_id)
 SELECT prep.campaign_id,r.id,c.id,lower(c.code),(r.base_cents+CASE WHEN r.rank<=r.extra_cents THEN 1 ELSE 0 END)/100,
 prep.pay_date,'Paie horaire '||prep.start_date::text||' — '||c.label,false,p_period_id
 FROM ranked r JOIN account_categories c ON c.code=r.code
 WHERE r.base_cents+CASE WHEN r.rank<=r.extra_cents THEN 1 ELSE 0 END>0;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN inserted;
END $$;
REVOKE ALL ON FUNCTION public.sync_prepared_payroll_costs(uuid) FROM PUBLIC,anon,authenticated;

-- Preserve the existing calculation for all legacy periods.
CREATE OR REPLACE FUNCTION sync_payslip_period_to_cost_entries(p_period_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period payroll_periods%ROWTYPE;
  v_inserted INTEGER := 0;
BEGIN
  SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_period.preparation_id IS NOT NULL THEN
    RETURN public.sync_prepared_payroll_costs(p_period_id);
  END IF;

  DELETE FROM cost_entries WHERE payroll_period_id = p_period_id;

  IF v_period.status NOT IN ('valide', 'paye', 'cloture') THEN
    RETURN 0;
  END IF;

  WITH
    -- 1. Bulletins → champs distincts pour brut et charges sociales
    worker_payslips AS (
      SELECT
        COALESCE(ps.gross_salary, 0) AS gross,
        COALESCE(ps.cnss_employer, 0)
          + COALESCE(ps.amo_employer, 0)
          + COALESCE(ps.family_allowance_employer, 0)
          + COALESCE(ps.prof_training_employer, 0) AS charges_soc,
        CASE
          WHEN w.category = 'staff_admin' THEN 'MO_ADMIN'
          ELSE 'MOD'  -- fermier, saisonnier, tacheron → MOD
        END AS gross_cat_code,
        COALESCE(
          (SELECT id FROM campaigns
           WHERE farm_id = w.farm_id
             AND v_period.pay_date BETWEEN COALESCE(planting_start, DATE '1900-01-01')
                                       AND COALESCE(campaign_end, DATE '2100-12-31')
           ORDER BY planting_start DESC LIMIT 1),
          (SELECT id FROM campaigns WHERE farm_id = w.farm_id ORDER BY created_at DESC LIMIT 1),
          (SELECT id FROM campaigns ORDER BY created_at DESC LIMIT 1)
        ) AS campaign_id
      FROM payslips ps
      JOIN workers w ON w.id = ps.worker_id
      WHERE ps.period_id = p_period_id
    ),
    -- 2. Agrégats : 2 sources d'amounts par campagne
    --    a) gross par (campagne × MOD/MO_ADMIN)
    --    b) charges_soc par campagne → CHARGES_SOC (workers confondus)
    aggregates AS (
      SELECT campaign_id, gross_cat_code AS cat_code, SUM(gross) AS total_amount
      FROM worker_payslips
      GROUP BY campaign_id, gross_cat_code
      HAVING SUM(gross) > 0
      UNION ALL
      SELECT campaign_id, 'CHARGES_SOC' AS cat_code, SUM(charges_soc)
      FROM worker_payslips
      GROUP BY campaign_id
      HAVING SUM(charges_soc) > 0
    ),
    -- 3. Serres de chaque campagne avec surface
    campaign_greenhouses AS (
      SELECT DISTINCT
        cp.campaign_id,
        g.id AS greenhouse_id,
        COALESCE(NULLIF(g.exploitable_area, 0), g.total_area, 0)::numeric AS area
      FROM campaign_plantings cp
      JOIN greenhouses g ON g.id = cp.greenhouse_id
    ),
    campaign_total_area AS (
      SELECT campaign_id, SUM(area) AS total_area
      FROM campaign_greenhouses
      GROUP BY campaign_id
    ),
    -- 4. Répartition au prorata par surface
    distributed AS (
      SELECT
        a.campaign_id,
        a.cat_code,
        cg.greenhouse_id,
        ROUND( (a.total_amount * cg.area / cta.total_area)::numeric, 2 ) AS amount
      FROM aggregates a
      JOIN campaign_greenhouses cg ON cg.campaign_id = a.campaign_id
      JOIN campaign_total_area cta ON cta.campaign_id = a.campaign_id
      WHERE cta.total_area > 0 AND a.total_amount > 0
    ),
    fallback_no_greenhouse AS (
      SELECT
        a.campaign_id,
        a.cat_code,
        NULL::UUID AS greenhouse_id,
        a.total_amount AS amount
      FROM aggregates a
      LEFT JOIN campaign_total_area cta ON cta.campaign_id = a.campaign_id
      WHERE a.total_amount > 0 AND (cta.total_area IS NULL OR cta.total_area = 0)
    ),
    final_distribution AS (
      SELECT * FROM distributed
      UNION ALL
      SELECT * FROM fallback_no_greenhouse
    )
  INSERT INTO cost_entries (
    campaign_id, greenhouse_id, account_category_id, cost_category,
    amount, entry_date, description, is_planned, payroll_period_id
  )
  SELECT
    fd.campaign_id,
    fd.greenhouse_id,
    ac.id,
    LOWER(ac.code),
    fd.amount,
    v_period.pay_date,
    'Paie ' || v_period.code || ' — ' || ac.label
      || COALESCE(' [' || (SELECT code FROM greenhouses WHERE id = fd.greenhouse_id) || ']', ''),
    FALSE,
    p_period_id
  FROM final_distribution fd
  JOIN account_categories ac ON ac.code = fd.cat_code
  WHERE fd.amount > 0
    AND fd.campaign_id IS NOT NULL;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;


NOTIFY pgrst,'reload schema';
COMMIT;
