BEGIN;
SET LOCAL lock_timeout='5s';

-- Client-scoped records: historical shared cnss_declarations cannot be assigned
-- to a client safely and are deliberately not copied or modified here.
CREATE TABLE public.social_contribution_declarations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid NOT NULL REFERENCES public.domains(id),
 period_year integer NOT NULL CHECK(period_year BETWEEN 1900 AND 2200),
 period_month integer NOT NULL CHECK(period_month BETWEEN 1 AND 12),
 totals jsonb NOT NULL,source_fingerprint text NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 declaration_number text CHECK(length(declaration_number)<=100),declared_at timestamptz,declared_by uuid REFERENCES auth.users(id),
 history jsonb NOT NULL DEFAULT '[]',created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(domain_id,period_year,period_month)
);
CREATE TABLE public.social_contribution_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),declaration_id uuid NOT NULL REFERENCES public.social_contribution_declarations(id),
 domain_id uuid NOT NULL REFERENCES public.domains(id),amount numeric(12,2) NOT NULL CHECK(amount>0),payment_date date NOT NULL,
 payment_method text NOT NULL CHECK(payment_method IN('virement','cheque','cash','other')),
 reference text CHECK(length(reference)<=255),source_totals jsonb NOT NULL,
 request_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(domain_id,request_id)
);
CREATE INDEX social_payments_declaration ON public.social_contribution_payments(domain_id,declaration_id,payment_date);
ALTER TABLE public.social_contribution_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_contribution_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_declarations_read ON public.social_contribution_declarations FOR SELECT TO authenticated USING(
 (coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(public.is_domain_member(domain_id,auth.uid()),false))
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'rh_cnss','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
CREATE POLICY social_payments_read ON public.social_contribution_payments FOR SELECT TO authenticated USING(
 (coalesce(public.is_platform_admin(auth.uid()),false) OR coalesce(public.is_domain_member(domain_id,auth.uid()),false))
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'rh_cnss','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
REVOKE ALL ON public.social_contribution_declarations,public.social_contribution_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.social_contribution_declarations,public.social_contribution_payments TO authenticated;

CREATE FUNCTION public.social_contribution_access(p_domain uuid,p_action text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
 OR NOT (coalesce(is_platform_admin(auth.uid()),false) OR coalesce(is_domain_member(p_domain,auth.uid()),false))
 OR NOT coalesce(has_domain_permission(p_domain,auth.uid(),'rh_cnss',p_action),false)
 OR NOT EXISTS(SELECT 1 FROM domains WHERE id=p_domain AND is_active)
 THEN RAISE EXCEPTION 'Accès aux cotisations non autorisé' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.social_contribution_access(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.social_contribution_source(p_domain uuid,p_year integer,p_month integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=public,pg_temp AS $$
DECLARE result jsonb; correction boolean; period_count integer;
BEGIN
 IF p_year IS NULL OR p_year NOT BETWEEN 1900 AND 2200 OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Période de cotisations invalide'; END IF;
 SELECT jsonb_build_object('nb_workers',count(DISTINCT s.worker_id),'nb_periods',count(DISTINCT period.id),
 'total_gross',coalesce(sum(s.gross_salary),0),
 'total_cnss_employee',coalesce(sum(s.cnss_employee),0),'total_amo_employee',coalesce(sum(s.amo_employee),0),
 'total_cnss_employer',coalesce(sum(s.cnss_employer),0),'total_amo_employer',coalesce(sum(s.amo_employer),0),
 'total_family_allowance',coalesce(sum(s.family_allowance_employer),0),'total_prof_training',coalesce(sum(s.prof_training_employer),0),
 'fingerprint',md5(coalesce(jsonb_agg(jsonb_build_array(s.id,s.worker_id,period.id,s.gross_salary,s.cnss_employee,s.amo_employee,
 s.cnss_employer,s.amo_employer,s.family_allowance_employer,s.prof_training_employer) ORDER BY s.id),'[]')::text)) INTO result
 FROM payslips s JOIN payroll_periods period ON period.id=s.period_id
 LEFT JOIN payroll_preparations prep ON prep.id=period.preparation_id
 JOIN workers w ON w.id=s.worker_id JOIN farms f ON f.id=w.farm_id
 WHERE ((prep.id IS NOT NULL AND prep.domain_id=p_domain) OR (prep.id IS NULL AND f.domain_id=p_domain))
 AND period.period_year=p_year AND period.period_month=p_month AND period.status IN('valide','paye','cloture') AND (prep.id IS NULL OR s.status IN('valide','paye'))
 AND (prep.id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(prep.published_rows,prep.rows)) r
 WHERE r->>'worker_id'=s.worker_id::text AND r->>'is_declared'='false'));
 -- Keep zero-contribution months visible when all employees are undeclared.
 SELECT count(DISTINCT period.id) INTO period_count FROM payroll_periods period
 LEFT JOIN payroll_preparations prep ON prep.id=period.preparation_id
 WHERE period.period_year=p_year AND period.period_month=p_month AND period.status IN('valide','paye','cloture')
 AND ((prep.id IS NOT NULL AND prep.domain_id=p_domain) OR (prep.id IS NULL AND EXISTS(
 SELECT 1 FROM payslips s JOIN workers w ON w.id=s.worker_id JOIN farms f ON f.id=w.farm_id WHERE s.period_id=period.id AND f.domain_id=p_domain)));
 SELECT EXISTS(SELECT 1 FROM payroll_preparations WHERE domain_id=p_domain AND correction_id IS NOT NULL
 AND extract(year FROM start_date)=p_year AND extract(month FROM start_date)=p_month) INTO correction;
 result:=result||jsonb_build_object('open_correction',correction,'nb_periods',period_count,
 'total_employee',(result->>'total_cnss_employee')::numeric+(result->>'total_amo_employee')::numeric,
 'total_employer',(result->>'total_cnss_employer')::numeric+(result->>'total_amo_employer')::numeric+(result->>'total_family_allowance')::numeric+(result->>'total_prof_training')::numeric);
 RETURN result||jsonb_build_object('total_due',(result->>'total_employee')::numeric+(result->>'total_employer')::numeric);
END $$;
REVOKE ALL ON FUNCTION public.social_contribution_source(uuid,integer,integer) FROM PUBLIC,anon,authenticated;

-- Serialize settlements and cooperate with the preparation/revalidation locks.
CREATE FUNCTION public.lock_social_contribution_month(p_domain uuid,p_year integer,p_month integer)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE farm record; first_day date:=make_date(p_year,p_month,1);
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('social-contribution:'||p_domain::text||':'||first_day::text,0));
 FOR farm IN SELECT id FROM farms WHERE domain_id=p_domain ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('payroll-month:'||farm.id::text||':'||first_day::text,0));
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.lock_social_contribution_month(uuid,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.list_social_contributions(p_domain uuid,p_year integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb:='[]';month integer;source jsonb;saved social_contribution_declarations%ROWTYPE;paid numeric;payments jsonb;last_date date;
BEGIN
 PERFORM social_contribution_access(p_domain,'view');
 IF p_year IS NULL OR p_year NOT BETWEEN 1900 AND 2200 THEN RAISE EXCEPTION 'Période de cotisations invalide'; END IF;
 FOR month IN 1..12 LOOP
  source:=social_contribution_source(p_domain,p_year,month);
  SELECT * INTO saved FROM social_contribution_declarations WHERE domain_id=p_domain AND period_year=p_year AND period_month=month;
  IF saved.id IS NULL AND (source->>'nb_periods')::integer=0 THEN CONTINUE; END IF;
  SELECT coalesce(sum(p.amount),0),max(p.payment_date),coalesce(jsonb_agg(to_jsonb(p)-'source_totals'-'request_id' ORDER BY p.payment_date DESC,p.created_at DESC),'[]')
  INTO paid,last_date,payments FROM social_contribution_payments p WHERE p.declaration_id=saved.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',saved.id,'domain_id',p_domain,'period_year',p_year,'period_month',month,
   'source',source,'revision',coalesce(saved.revision,0),'declared_at',saved.declared_at,'declaration_number',saved.declaration_number,
   'stale',saved.id IS NOT NULL AND saved.source_fingerprint<>source->>'fingerprint',
   'paid',paid,'remaining',greatest(0,(source->>'total_due')::numeric-paid),'overpaid',greatest(0,paid-(source->>'total_due')::numeric),
   'last_payment_date',last_date,'payments',payments));
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_social_contributions(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_social_contributions(uuid,integer) TO authenticated;

CREATE FUNCTION public.save_social_contribution_declaration(p_domain uuid,p_year integer,p_month integer,p_revision integer,p_fingerprint text,p_reference text,p_declare boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source jsonb;saved social_contribution_declarations%ROWTYPE;
BEGIN
 PERFORM social_contribution_access(p_domain,CASE WHEN p_declare THEN 'admin' ELSE 'edit' END);
 source:=social_contribution_source(p_domain,p_year,p_month);
 PERFORM lock_social_contribution_month(p_domain,p_year,p_month);
 source:=social_contribution_source(p_domain,p_year,p_month);
 IF source->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'Les cotisations ont changé. Actualisez le mois avant de continuer.'; END IF;
 IF (source->>'nb_periods')::integer=0 OR (source->>'open_correction')::boolean THEN RAISE EXCEPTION 'Validez les paies et terminez les corrections du mois avant de continuer.'; END IF;
 IF p_declare IS NULL OR length(coalesce(p_reference,''))>100 THEN RAISE EXCEPTION 'Référence de déclaration invalide'; END IF;
 SELECT * INTO saved FROM social_contribution_declarations WHERE domain_id=p_domain AND period_year=p_year AND period_month=p_month FOR UPDATE;
 IF coalesce(saved.revision,0) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Le suivi des cotisations a changé. Actualisez.'; END IF;
 IF saved.id IS NULL THEN
  INSERT INTO social_contribution_declarations(domain_id,period_year,period_month,totals,source_fingerprint,created_by,updated_by)
  VALUES(p_domain,p_year,p_month,source,source->>'fingerprint',auth.uid(),auth.uid()) RETURNING * INTO saved;
 ELSE
  UPDATE social_contribution_declarations SET history=history||jsonb_build_array(jsonb_build_object('totals',totals,'source_fingerprint',source_fingerprint,
   'declaration_number',declaration_number,'declared_at',declared_at,'declared_by',declared_by,'changed_by',auth.uid(),'changed_at',now())),
   totals=source,source_fingerprint=source->>'fingerprint',revision=revision+1,updated_by=auth.uid(),updated_at=now(),
   declared_at=CASE WHEN source_fingerprint=source->>'fingerprint' THEN declared_at END,
   declared_by=CASE WHEN source_fingerprint=source->>'fingerprint' THEN declared_by END,
   declaration_number=CASE WHEN source_fingerprint=source->>'fingerprint' THEN declaration_number END
  WHERE id=saved.id RETURNING * INTO saved;
 END IF;
 IF p_declare THEN
  UPDATE social_contribution_declarations SET declaration_number=nullif(btrim(p_reference),''),declared_at=now(),declared_by=auth.uid() WHERE id=saved.id RETURNING * INTO saved;
 END IF;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.save_social_contribution_declaration(uuid,integer,integer,integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_social_contribution_declaration(uuid,integer,integer,integer,text,text,boolean) TO authenticated;

CREATE FUNCTION public.record_social_contribution_payment(p_domain uuid,p_year integer,p_month integer,p_revision integer,p_fingerprint text,p_amount numeric,p_date date,p_method text,p_reference text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source jsonb;saved social_contribution_declarations%ROWTYPE;payment social_contribution_payments%ROWTYPE;paid numeric;
BEGIN
 PERFORM social_contribution_access(p_domain,'edit');
 source:=social_contribution_source(p_domain,p_year,p_month);
 PERFORM lock_social_contribution_month(p_domain,p_year,p_month);
 IF p_request IS NULL OR p_amount IS NULL OR p_amount::text IN('NaN','Infinity','-Infinity') OR p_amount<=0 OR p_amount>9999999999.99
 OR p_amount<>round(p_amount,2) OR p_date IS NULL OR p_date<'1900-01-01' OR p_date>'2200-12-31'
 OR p_method IS NULL OR p_method NOT IN('virement','cheque','cash','other') OR length(coalesce(p_reference,''))>255 THEN RAISE EXCEPTION 'Règlement de cotisations invalide'; END IF;
 SELECT * INTO payment FROM social_contribution_payments WHERE domain_id=p_domain AND request_id=p_request;
 IF FOUND THEN
  IF payment.amount<>p_amount OR payment.payment_date<>p_date OR payment.payment_method<>p_method OR payment.reference IS DISTINCT FROM nullif(btrim(p_reference),'')
  OR NOT EXISTS(SELECT 1 FROM social_contribution_declarations WHERE id=payment.declaration_id AND period_year=p_year AND period_month=p_month)
  THEN RAISE EXCEPTION 'Requête de règlement déjà utilisée'; END IF;
  RETURN to_jsonb(payment);
 END IF;
 source:=social_contribution_source(p_domain,p_year,p_month);
 IF source->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'Les cotisations ont changé. Actualisez le mois avant de continuer.'; END IF;
 IF (source->>'nb_periods')::integer=0 OR (source->>'open_correction')::boolean THEN RAISE EXCEPTION 'Validez les paies et terminez les corrections du mois avant de continuer.'; END IF;
 SELECT * INTO saved FROM social_contribution_declarations WHERE domain_id=p_domain AND period_year=p_year AND period_month=p_month FOR UPDATE;
 IF coalesce(saved.revision,0) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Le suivi des cotisations a changé. Actualisez.'; END IF;
 IF saved.id IS NOT NULL AND saved.source_fingerprint<>source->>'fingerprint' THEN RAISE EXCEPTION 'Recalculez le mois après la modification des paies avant de régler les cotisations.'; END IF;
 IF saved.id IS NULL THEN
  INSERT INTO social_contribution_declarations(domain_id,period_year,period_month,totals,source_fingerprint,created_by,updated_by)
  VALUES(p_domain,p_year,p_month,source,source->>'fingerprint',auth.uid(),auth.uid()) RETURNING * INTO saved;
 END IF;
 SELECT coalesce(sum(amount),0) INTO paid FROM social_contribution_payments WHERE declaration_id=saved.id;
 IF p_amount+paid>(source->>'total_due')::numeric THEN RAISE EXCEPTION 'Le règlement dépasse le reste à payer des cotisations.'; END IF;
 INSERT INTO social_contribution_payments(declaration_id,domain_id,amount,payment_date,payment_method,reference,source_totals,request_id,created_by)
 VALUES(saved.id,p_domain,p_amount,p_date,p_method,nullif(btrim(p_reference),''),source,p_request,auth.uid()) RETURNING * INTO payment;
 UPDATE social_contribution_declarations SET revision=revision+1,updated_by=auth.uid(),updated_at=now() WHERE id=saved.id;
 RETURN to_jsonb(payment);
END $$;
REVOKE ALL ON FUNCTION public.record_social_contribution_payment(uuid,integer,integer,integer,text,numeric,date,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_social_contribution_payment(uuid,integer,integer,integer,text,numeric,date,text,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
