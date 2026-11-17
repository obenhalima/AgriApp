BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.workers ADD COLUMN is_declared boolean;
COMMENT ON COLUMN public.workers.is_declared IS 'Explicit payroll declaration status. NULL means not yet reviewed.';

CREATE FUNCTION public.payroll_net_at_gross(p_gross_cents bigint,p_start date,p_dependents integer,p_prior jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE total numeric;cap numeric;annual_factor integer;fee_rate integer;fees numeric;taxable numeric;rate integer;deduction numeric;family numeric;tax numeric;values jsonb;field text;net numeric;year integer;
BEGIN
 year:=extract(year FROM p_start)::integer;
 annual_factor:=CASE WHEN extract(day FROM p_start)=1 THEN 24 ELSE 12 END;
 total:=round(coalesce((p_prior->>'prior_gross')::numeric,0)*100)+p_gross_cents;
 cap:=least(total,7200000::numeric/annual_factor);
 values:=jsonb_build_object('cnss_employee',round(cap*448/10000),'amo_employee',round(total*226/10000),
 'cnss_employer',round(cap*898/10000),'amo_employer',round(total*411/10000),
 'family_allowance_employer',round(total*640/10000),'prof_training_employer',round(total*160/10000));
 fee_rate:=CASE WHEN total*annual_factor<=7800000 THEN 3500 ELSE 2500 END;
 fees:=least(round(total*fee_rate/10000),round(3500000::numeric/annual_factor));
 taxable:=greatest(0,total-(values->>'cnss_employee')::numeric-(values->>'amo_employee')::numeric-fees)*annual_factor;
 IF year>=2025 THEN
   IF taxable<=4000000 THEN rate:=0;deduction:=0;
   ELSIF taxable<=6000000 THEN rate:=1000;deduction:=400000;
   ELSIF taxable<=8000000 THEN rate:=2000;deduction:=1000000;
   ELSIF taxable<=10000000 THEN rate:=3000;deduction:=1800000;
   ELSIF taxable<=18000000 THEN rate:=3400;deduction:=2200000;
   ELSE rate:=3700;deduction:=2740000;END IF;
 ELSE
   IF taxable<=3000000 THEN rate:=0;deduction:=0;
   ELSIF taxable<=5000000 THEN rate:=1000;deduction:=300000;
   ELSIF taxable<=6000000 THEN rate:=2000;deduction:=800000;
   ELSIF taxable<=8000000 THEN rate:=3000;deduction:=1400000;
   ELSIF taxable<=18000000 THEN rate:=3400;deduction:=1720000;
   ELSE rate:=3800;deduction:=2440000;END IF;
 END IF;
 family:=CASE WHEN year>=2026 THEN 60000 WHEN year=2025 THEN 50000 ELSE 36000 END*least(6,greatest(0,coalesce(p_dependents,0)));
 tax:=round(greatest(0,taxable*rate-(deduction+family)*10000)/(10000*annual_factor));
 values:=values||jsonb_build_object('ir_amount',tax);
 FOREACH field IN ARRAY ARRAY['cnss_employee','amo_employee','ir_amount','cnss_employer','amo_employer','family_allowance_employer','prof_training_employer'] LOOP
   values:=jsonb_set(values,ARRAY[field],to_jsonb((values->>field)::numeric-round(coalesce((p_prior->>field)::numeric,0)*100)));
 END LOOP;
 net:=p_gross_cents-(values->>'cnss_employee')::numeric-(values->>'amo_employee')::numeric-(values->>'ir_amount')::numeric;
 RETURN jsonb_build_object('net',net,'values',values);
END $$;
REVOKE ALL ON FUNCTION public.payroll_net_at_gross(bigint,date,integer,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.payroll_net_amounts(p_net numeric,p_declared boolean,p_start date,p_dependents integer,p_prior jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE target bigint;boundary bigint;first_cent bigint;last_cent bigint;low bigint;high bigint;middle bigint;candidate bigint;part integer;answer jsonb;amounts jsonb;field text;employer numeric;
BEGIN
 IF p_net IS NULL OR p_net<0 OR p_net>99999999 OR p_net<>round(p_net,2) THEN RAISE EXCEPTION 'Net acquis invalide'; END IF;
 target:=round(p_net*100);
 IF p_declared IS DISTINCT FROM true THEN
   RETURN jsonb_build_object('gross_salary',p_net,'net_before_adjustments',p_net,'total_employer_cost',p_net,'cnss_employee',0,'amo_employee',0,'ir_amount',0,'cnss_employer',0,'amo_employer',0,'family_allowance_employer',0,'prof_training_employer',0);
 END IF;
 IF extract(year FROM p_start) NOT BETWEEN 2023 AND 2026 THEN RAISE EXCEPTION 'Barème automatique disponible de 2023 à 2026'; END IF;
 boundary:=floor(7800000::numeric/CASE WHEN extract(day FROM p_start)=1 THEN 24 ELSE 12 END)-round(coalesce((p_prior->>'prior_gross')::numeric,0)*100);
 FOR part IN 1..2 LOOP
   first_cent:=CASE WHEN part=1 THEN 0 ELSE greatest(0,boundary+1) END;
   last_cent:=CASE WHEN part=1 THEN least(9999999900,boundary) ELSE 9999999900 END;
   IF last_cent<first_cent THEN CONTINUE; END IF;
   low:=first_cent;high:=last_cent;
   WHILE low<high LOOP
     middle:=(low+high)/2;
     answer:=payroll_net_at_gross(middle,p_start,p_dependents,p_prior);
     IF (answer->>'net')::numeric<target THEN low:=middle+1; ELSE high:=middle; END IF;
   END LOOP;
   FOR candidate IN SELECT generate_series(greatest(first_cent,low-12),least(last_cent,low+12)) LOOP
     answer:=payroll_net_at_gross(candidate,p_start,p_dependents,p_prior);
     IF (answer->>'net')::numeric<>target THEN CONTINUE; END IF;
     amounts:=answer->'values';
     employer:=(amounts->>'cnss_employer')::numeric+(amounts->>'amo_employer')::numeric+(amounts->>'family_allowance_employer')::numeric+(amounts->>'prof_training_employer')::numeric;
     FOREACH field IN ARRAY ARRAY['cnss_employee','amo_employee','ir_amount','cnss_employer','amo_employer','family_allowance_employer','prof_training_employer'] LOOP
       amounts:=jsonb_set(amounts,ARRAY[field],to_jsonb((amounts->>field)::numeric/100));
     END LOOP;
     RETURN amounts||jsonb_build_object('gross_salary',candidate::numeric/100,'net_before_adjustments',p_net,'total_employer_cost',(candidate+employer)/100);
   END LOOP;
 END LOOP;
 RAISE EXCEPTION 'Régularisation mensuelle incompatible avec le net acquis. Vérifiez les paies précédentes.';
END $$;
REVOKE ALL ON FUNCTION public.payroll_net_amounts(numeric,boolean,date,integer,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.payroll_net_context(p_domain uuid,p_farm uuid,p_start date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
 OR NOT coalesce(is_domain_member(p_domain,auth.uid()),false) OR NOT coalesce(has_domain_permission(p_domain,auth.uid(),'rh_paie','view'),false)
 OR NOT EXISTS(SELECT 1 FROM farms WHERE id=p_farm AND domain_id=p_domain) THEN RAISE EXCEPTION 'Paie non autorisée' USING ERRCODE='42501'; END IF;
 WITH context AS (
 SELECT w.id worker_id,w.is_declared,coalesce(w.dependents,0) dependents,
 coalesce(sum(s.gross_salary) FILTER(WHERE period.start_date<p_start),0) prior_gross,
 coalesce(sum(s.cnss_employee) FILTER(WHERE period.start_date<p_start),0) cnss_employee,
 coalesce(sum(s.amo_employee) FILTER(WHERE period.start_date<p_start),0) amo_employee,
 coalesce(sum(s.ir_amount) FILTER(WHERE period.start_date<p_start),0) ir_amount,
 coalesce(sum(s.cnss_employer) FILTER(WHERE period.start_date<p_start),0) cnss_employer,
 coalesce(sum(s.amo_employer) FILTER(WHERE period.start_date<p_start),0) amo_employer,
 coalesce(sum(s.family_allowance_employer) FILTER(WHERE period.start_date<p_start),0) family_allowance_employer,
 coalesce(sum(s.prof_training_employer) FILTER(WHERE period.start_date<p_start),0) prof_training_employer,
 coalesce(bool_or(period.start_date>p_start),false) has_later_payroll
 FROM workers w
 LEFT JOIN payslips s ON s.worker_id=w.id AND EXISTS(
   SELECT 1 FROM payroll_periods pp LEFT JOIN payroll_preparations prep ON prep.id=pp.preparation_id
   WHERE pp.id=s.period_id AND (prep.id IS NULL OR prep.domain_id=p_domain)
   AND pp.status IN('valide','paye','cloture') AND date_trunc('month',pp.start_date)=date_trunc('month',p_start))
 LEFT JOIN payroll_periods period ON period.id=s.period_id
 WHERE w.farm_id=p_farm GROUP BY w.id,w.is_declared,w.dependents
 )
 SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('fingerprint',md5(to_jsonb(c)::text))),'[]') INTO result FROM context c;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.payroll_net_context(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.payroll_net_context(uuid,uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_payroll_preparation(
 p_domain uuid,p_farm uuid,p_start date,p_end date,p_campaign uuid,p_pay_date date,
 p_attendance_revision integer,p_revision integer,p_rows jsonb,p_action text,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 prep payroll_preparations%ROWTYPE; att employee_attendance_periods%ROWTYPE; worker workers%ROWTYPE;
 found_prep boolean; row jsonb; previous jsonb; enriched jsonb:='[]'; fingerprint text;
 normal numeric; overtime numeric; rate_n numeric; rate_s numeric; amount_n numeric; amount_s numeric;
 gross numeric; net numeric; employer numeric; field text; value numeric; original_n numeric; original_s numeric;
 total_n numeric; total_s numeric; has_attendance boolean:=false; new_period_id uuid; end_expected date; auto jsonb; ctx jsonb; contexts jsonb; target_net numeric;
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
 contexts:=payroll_net_context(p_domain,p_farm,p_start);
 FOR row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
   IF jsonb_typeof(row) IS DISTINCT FROM 'object' OR coalesce(row->>'source','') NOT IN('attendance','manual')
   OR jsonb_typeof(row->'deductions_confirmed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Ligne de paie invalide'; END IF;
   SELECT * INTO worker FROM workers WHERE id=(row->>'worker_id')::uuid AND farm_id=p_farm;
   IF NOT FOUND THEN RAISE EXCEPTION 'Employé inaccessible pour cette ferme'; END IF;
   FOREACH field IN ARRAY ARRAY['normal_hours','overtime_hours','normal_rate','overtime_rate','bonuses','advance','other_deductions'] LOOP
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
   SELECT x INTO ctx FROM jsonb_array_elements(contexts) x WHERE x->>'worker_id'=worker.id::text;
   IF p_action='validate' AND worker.is_declared IS NULL THEN RAISE EXCEPTION 'Statut déclaré à renseigner dans la fiche employé'; END IF;
   IF p_action='validate' AND ((worker.is_declared IS TRUE AND (ctx->>'has_later_payroll')::boolean) OR row#>>'{tax_context,fingerprint}' IS DISTINCT FROM ctx->>'fingerprint') THEN RAISE EXCEPTION 'Le statut salarié ou les bases mensuelles ont changé. Rechargez la préparation et validez les quinzaines dans l’ordre.'; END IF;
   target_net:=amount_n+amount_s+(row->>'bonuses')::numeric;
   auto:=payroll_net_amounts(target_net,worker.is_declared,p_start,coalesce(worker.dependents,0),ctx);
   row:=row||auto;
   gross:=(auto->>'gross_salary')::numeric;
   net:=target_net-(row->>'advance')::numeric-(row->>'other_deductions')::numeric;
   employer:=(auto->>'total_employer_cost')::numeric;
   IF net<0 OR employer>99999999 THEN RAISE EXCEPTION 'Les retenues dépassent le brut ou le montant est trop élevé'; END IF;
   -- Whitelist input fields. Client-calculated amounts and names are never trusted.
   SELECT jsonb_object_agg(e.key,e.value) INTO row FROM jsonb_each(row) e WHERE e.key IN('worker_id','source','normal_hours','overtime_hours','normal_rate','overtime_rate','bonuses','advance','other_deductions','cnss_employee','amo_employee','ir_amount','cnss_employer','amo_employer','family_allowance_employer','prof_training_employer','deductions_confirmed');
   enriched:=enriched||jsonb_build_array(row||jsonb_build_object('worker_name',btrim(worker.last_name||' '||worker.first_name),'worker_code',coalesce(nullif(worker.matricule,''),worker.id::text),'original_normal_rate',original_n,'original_overtime_rate',original_s,'calculation_basis','net-v1','is_declared',worker.is_declared,'dependents',coalesce(worker.dependents,0),'payroll_start',p_start,'tax_context',ctx,'net_before_adjustments',target_net,'gross_overtime_amount',CASE WHEN target_net>0 THEN round(gross*amount_s/target_net,2) ELSE 0 END,'gross_bonus_amount',CASE WHEN target_net-amount_s>0 THEN round((gross-round(gross*amount_s/target_net,2))*(row->>'bonuses')::numeric/(target_net-amount_s),2) ELSE 0 END,'worker_category',CASE WHEN previous IS NOT NULL THEN previous->>'worker_category' ELSE worker.category END,'base_amount',amount_n,'overtime_amount',amount_s,'gross_salary',gross,'net_salary',net,'total_employer_cost',employer));
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
   SELECT new_period_id,(r->>'worker_id')::uuid,round((r->>'normal_hours')::numeric/8,2),(r->>'normal_hours')::numeric,(r->>'overtime_hours')::numeric,(r->>'gross_salary')::numeric-(r->>'gross_overtime_amount')::numeric-(r->>'gross_bonus_amount')::numeric,(r->>'gross_overtime_amount')::numeric,(r->>'gross_bonus_amount')::numeric,(r->>'gross_salary')::numeric,(r->>'cnss_employee')::numeric,(r->>'amo_employee')::numeric,(r->>'ir_amount')::numeric,(r->>'other_deductions')::numeric+(r->>'advance')::numeric,(r->>'net_salary')::numeric,(r->>'cnss_employer')::numeric,(r->>'amo_employer')::numeric,(r->>'family_allowance_employer')::numeric,(r->>'prof_training_employer')::numeric,(r->>'total_employer_cost')::numeric,'valide','Préparation horaire '||prep.id::text FROM jsonb_array_elements(enriched) r;
   UPDATE payroll_preparations SET status='validated',payroll_period_id=new_period_id,validated_by=auth.uid(),validated_at=now() WHERE id=prep.id RETURNING * INTO prep;
   -- The existing payroll trigger generates the cost entries atomically.
   UPDATE payroll_periods SET status='valide',validated_at=now() WHERE id=new_period_id;
 END IF;
 RETURN to_jsonb(prep)-'last_request_fingerprint';
END $$;
REVOKE ALL ON FUNCTION public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.import_employee_recovery(
  p_domain uuid, p_farm uuid, p_filename text, p_rows jsonb, p_apply boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  item jsonb; source_record jsonb; source_key text; existing workers%ROWTYPE;
  report jsonb := '[]'; staged jsonb := '[]'; seen text[] := '{}';
  created_count integer := 0; skipped_count integer := 0; conflict_count integer := 0;
  result_status text; issue text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
    OR NOT coalesce(has_domain_permission(p_domain,auth.uid(),'rh_employes','create'),false) THEN
    RAISE EXCEPTION 'Import des employés non autorisé' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM domains WHERE id=p_domain AND is_active)
    OR NOT EXISTS(SELECT 1 FROM farms WHERE id=p_farm AND domain_id=p_domain AND is_active) THEN
    RAISE EXCEPTION 'Sélectionnez une ferme active du client sélectionné';
  END IF;
  IF p_filename IS NULL OR length(btrim(p_filename)) NOT BETWEEN 1 AND 255
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Fichier invalide'; END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000 OR octet_length(p_rows::text)>2000000 THEN
    RAISE EXCEPTION 'Le fichier doit contenir entre 1 et 1 000 employés';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('employee-recovery:'||p_domain::text||':'||p_farm::text,0));
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF coalesce(length(btrim(item->>'source_name')),0) NOT BETWEEN 1 AND 100
      OR length(coalesce(item->>'source_number',''))>100 THEN RAISE EXCEPTION 'Identité source invalide'; END IF;
    source_key := lower(regexp_replace(btrim(item->>'source_name'),'\s+',' ','g'));
    IF source_key=ANY(seen) THEN RAISE EXCEPTION 'Nom présent plusieurs fois dans le fichier'; END IF;
    seen := array_append(seen,source_key);
    IF length(coalesce(item->>'payment_name',''))>255 OR length(coalesce(item->>'notes',''))>10000 THEN
      RAISE EXCEPTION 'Texte source trop long';
    END IF;
    IF item ? 'profile' AND jsonb_typeof(item->'profile')<>'object' THEN RAISE EXCEPTION 'Informations employé invalides'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(item->'profile','{}')) field WHERE
      field.key NOT IN('first_name','last_name','cin','cnss_number','phone','email','start_date','date_birth','is_declared')
      OR jsonb_typeof(field.value)<>'string' OR length(field.value #>> '{}')>CASE
        WHEN field.key IN('first_name','last_name') THEN 100
        WHEN field.key IN('cin','cnss_number') THEN 20 WHEN field.key='phone' THEN 50 ELSE 255 END) THEN
      RAISE EXCEPTION 'Informations employé invalides';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(item->'profile','{}')) field WHERE
      field.key IN('start_date','date_birth') AND (field.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'Date source invalide';
    END IF;
    IF item->'profile' ? 'is_declared' AND item->'profile'->>'is_declared' NOT IN('true','false') THEN RAISE EXCEPTION 'Statut déclaré invalide'; END IF;
    IF item->'is_active' IS DISTINCT FROM 'null'::jsonb AND item ? 'is_active'
      AND jsonb_typeof(item->'is_active')<>'boolean' THEN RAISE EXCEPTION 'Statut invalide'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(item) field WHERE field.key IN
      ('normal_hourly_rate','overtime_hourly_rate','daily_rate','seniority_rate')
      AND field.value<>'null'::jsonb AND jsonb_typeof(field.value)<>'number') THEN
      RAISE EXCEPTION 'Tarif source invalide';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(item) field WHERE field.key IN
      ('normal_hourly_rate','overtime_hourly_rate','daily_rate','seniority_rate')
      AND field.value<>'null'::jsonb AND ((field.value::text)::numeric<0
      OR (field.value::text)::numeric>CASE WHEN field.key='seniority_rate' THEN 1 ELSE 1000000 END)) THEN
      RAISE EXCEPTION 'Tarif source invalide';
    END IF;
    source_record := jsonb_build_object('source_number',item->'source_number','source_name',item->'source_name',
      'payment_name',item->'payment_name','normal_hourly_rate',item->'normal_hourly_rate',
      'overtime_hourly_rate',item->'overtime_hourly_rate','daily_rate',item->'daily_rate',
      'seniority_rate',item->'seniority_rate','is_active',item->'is_active','notes',item->'notes',
      'profile',coalesce(item->'profile','{}'));
    result_status := 'create'; issue := NULL;
    SELECT * INTO existing FROM workers WHERE farm_id=p_farm AND employee_import->>'source_key'=source_key;
    IF FOUND THEN
      IF existing.employee_import->'source_record'=source_record THEN result_status := 'skip';
      ELSE result_status := 'conflict'; issue := 'Source modifiée : fiche existante préservée'; END IF;
    ELSIF EXISTS(SELECT 1 FROM workers WHERE farm_id=p_farm AND (
      lower(regexp_replace(btrim(last_name||' '||first_name),'\s+',' ','g'))=source_key OR
      lower(regexp_replace(btrim(first_name||' '||last_name),'\s+',' ','g'))=source_key OR
      (nullif(item->'profile'->>'cin','') IS NOT NULL AND cin=item->'profile'->>'cin'))) THEN
      result_status := 'conflict'; issue := 'Employé déjà présent : rapprochement à vérifier';
    END IF;
    IF result_status='create' THEN
      created_count := created_count+1;
      staged := staged||jsonb_build_array(jsonb_build_object('source_key',source_key,'source_record',source_record,'row',item));
    ELSIF result_status='skip' THEN skipped_count := skipped_count+1;
    ELSE conflict_count := conflict_count+1; END IF;
    report := report||jsonb_build_array(jsonb_build_object('excel_row',item->'excel_row','source_name',item->'source_name','status',result_status,'issue',issue));
  END LOOP;
  IF p_apply AND conflict_count>0 THEN RAISE EXCEPTION 'Résolvez les rapprochements avant de valider cet import'; END IF;
  IF p_apply THEN
    FOR item IN SELECT value FROM jsonb_array_elements(staged) LOOP
      source_record := item->'source_record';
      INSERT INTO workers(first_name,last_name,farm_id,is_active,normal_hourly_rate,overtime_hourly_rate,
        daily_rate,seniority_rate,notes,category,contract_type,pay_frequency,base_salary,family_status,
        dependents,payment_method,cin,cnss_number,phone,email,start_date,date_birth,is_declared,employee_import)
      VALUES(coalesce(source_record->'profile'->>'first_name',''),
        CASE WHEN source_record->'profile' ? 'first_name' OR source_record->'profile' ? 'last_name'
          THEN coalesce(source_record->'profile'->>'last_name','') ELSE source_record->>'source_name' END,
        p_farm,(source_record->>'is_active')::boolean,
        (source_record->>'normal_hourly_rate')::numeric,(source_record->>'overtime_hourly_rate')::numeric,
        (source_record->>'daily_rate')::numeric,(source_record->>'seniority_rate')::numeric,
        source_record->>'notes',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
        source_record->'profile'->>'cin',source_record->'profile'->>'cnss_number',
        source_record->'profile'->>'phone',source_record->'profile'->>'email',
        (source_record->'profile'->>'start_date')::date,(source_record->'profile'->>'date_birth')::date,
        (source_record->'profile'->>'is_declared')::boolean,
        jsonb_build_object('domain_id',p_domain,'source_key',item->>'source_key','source_record',source_record,
          'filename',btrim(p_filename),'sheet','Employés','excel_row',item->'row'->'excel_row',
          'imported_by',auth.uid(),'imported_at',now()));
    END LOOP;
  END IF;
  RETURN jsonb_build_object('created',created_count,'skipped',skipped_count,'conflicts',conflict_count,
    'applied',p_apply,'rows',report);
END $$;
REVOKE ALL ON FUNCTION public.import_employee_recovery(uuid,uuid,text,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_employee_recovery(uuid,uuid,text,jsonb,boolean) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
