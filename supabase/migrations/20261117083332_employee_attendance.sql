BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE public.employee_attendance_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid NOT NULL REFERENCES public.domains(id),
  farm_id uuid NOT NULL REFERENCES public.farms(id),
  start_date date NOT NULL, end_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','validated')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  validated_by uuid REFERENCES auth.users(id), validated_at timestamptz,
  last_request_id uuid NOT NULL, last_request_fingerprint text NOT NULL,
  UNIQUE(farm_id,start_date),
  CHECK((extract(day FROM start_date)=1 AND end_date=start_date+14) OR
    (extract(day FROM start_date)=16 AND end_date=(date_trunc('month',start_date)+interval '1 month - 1 day')::date))
);
CREATE INDEX employee_attendance_client_period ON public.employee_attendance_periods(domain_id,start_date);

CREATE TABLE public.employee_attendance_records (
  period_id uuid NOT NULL REFERENCES public.employee_attendance_periods(id),
  domain_id uuid NOT NULL REFERENCES public.domains(id),
  worker_id uuid NOT NULL REFERENCES public.workers(id), work_date date NOT NULL,
  normal_hours numeric(5,2), overtime_hours numeric(5,2),
  entry_source text NOT NULL CHECK(entry_source IN('manual','excel')), source_filename text,
  worker_name_snapshot text NOT NULL, worker_code_snapshot text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(period_id,worker_id,work_date),
  CHECK(normal_hours IS NULL OR normal_hours BETWEEN 0 AND 24),
  CHECK(overtime_hours IS NULL OR overtime_hours BETWEEN 0 AND 24),
  CHECK(coalesce(normal_hours,0)+coalesce(overtime_hours,0)<=24),
  CHECK(source_filename IS NULL OR length(source_filename)<=255)
);
CREATE INDEX employee_attendance_records_client ON public.employee_attendance_records(domain_id,period_id);

ALTER TABLE public.employee_attendance_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_period_read ON public.employee_attendance_periods FOR SELECT TO authenticated
USING (coalesce(public.is_domain_member(domain_id,auth.uid()),false)
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'pointage','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
CREATE POLICY attendance_record_read ON public.employee_attendance_records FOR SELECT TO authenticated
USING (coalesce(public.is_domain_member(domain_id,auth.uid()),false)
 AND coalesce(public.has_domain_permission(domain_id,auth.uid(),'pointage','view'),false)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
REVOKE ALL ON public.employee_attendance_periods,public.employee_attendance_records FROM anon,authenticated;
GRANT SELECT ON public.employee_attendance_periods,public.employee_attendance_records TO authenticated;

-- All writes are atomic and permission-checked here, including validation and reopening.
CREATE FUNCTION public.save_employee_attendance(
 p_domain uuid,p_farm uuid,p_start date,p_end date,p_revision integer,p_rows jsonb,
 p_action text,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 period public.employee_attendance_periods%ROWTYPE;
 fingerprint text; found_period boolean; days_count integer; expected_end date;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
   OR NOT coalesce(is_domain_member(p_domain,auth.uid()),false) THEN
   RAISE EXCEPTION 'Pointage non autorisé' USING ERRCODE='42501';
 END IF;
 IF p_request IS NULL OR p_start IS NULL OR p_end IS NULL OR p_revision IS NULL OR p_revision<0
   OR p_action IS NULL OR p_action NOT IN('save','validate','reopen')
   OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Pointage invalide'; END IF;
 IF NOT EXISTS(SELECT 1 FROM farms f JOIN domains d ON d.id=f.domain_id
   WHERE f.id=p_farm AND f.domain_id=p_domain AND f.is_active AND d.is_active) THEN
   RAISE EXCEPTION 'Ferme inaccessible pour ce client';
 END IF;
 IF extract(day FROM p_start)=1 THEN expected_end:=p_start+14;
 ELSIF extract(day FROM p_start)=16 THEN expected_end:=(date_trunc('month',p_start)+interval '1 month - 1 day')::date;
 ELSE RAISE EXCEPTION 'Choisissez une quinzaine du 1 au 15 ou du 16 à la fin du mois'; END IF;
 IF p_end<>expected_end THEN RAISE EXCEPTION 'Dates de la quinzaine incohérentes'; END IF;
 days_count:=p_end-p_start+1;
 IF jsonb_array_length(p_rows)>8000 OR octet_length(p_rows::text)>4000000 THEN
   RAISE EXCEPTION 'Le pointage est limité à 500 employés par quinzaine';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('employee-attendance:'||p_farm::text||':'||p_start::text,0));
 SELECT * INTO period FROM employee_attendance_periods WHERE farm_id=p_farm AND start_date=p_start FOR UPDATE;
 found_period:=FOUND;
 IF found_period AND period.domain_id<>p_domain THEN RAISE EXCEPTION 'Période inaccessible pour ce client' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(has_domain_permission(p_domain,auth.uid(),'pointage',CASE WHEN found_period THEN 'edit' ELSE 'create' END),false) THEN
   RAISE EXCEPTION 'Modification du pointage non autorisée' USING ERRCODE='42501';
 END IF;
 IF p_action IN('validate','reopen') AND NOT coalesce(has_domain_permission(p_domain,auth.uid(),'pointage','admin'),false) THEN
   RAISE EXCEPTION 'Validation du pointage réservée au responsable autorisé' USING ERRCODE='42501';
 END IF;
 fingerprint:=md5(p_domain::text||p_farm::text||p_start::text||p_end::text||p_action||p_rows::text);
 IF found_period AND period.last_request_id=p_request THEN
   IF period.last_request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Requête déjà utilisée pour un autre pointage'; END IF;
   RETURN to_jsonb(period)-'last_request_fingerprint';
 END IF;
 IF (found_period AND period.revision<>p_revision) OR (NOT found_period AND p_revision<>0) THEN
   RAISE EXCEPTION 'Le pointage a changé. Rechargez la période avant d’enregistrer.';
 END IF;
 IF p_action='reopen' THEN
   IF NOT found_period OR period.status<>'validated' THEN RAISE EXCEPTION 'Ce pointage ne peut pas être rouvert'; END IF;
   UPDATE employee_attendance_periods SET status='draft',revision=revision+1,updated_by=auth.uid(),updated_at=now(),
    validated_by=NULL,validated_at=NULL,last_request_id=p_request,last_request_fingerprint=fingerprint
    WHERE id=period.id RETURNING * INTO period;
   RETURN to_jsonb(period)-'last_request_fingerprint';
 END IF;
 IF found_period AND period.status='validated' THEN RAISE EXCEPTION 'Rouvrez le pointage avant de le modifier'; END IF;

 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) row WHERE
   jsonb_typeof(row) IS DISTINCT FROM 'object'
   OR coalesce(row->>'worker_id','')='' OR coalesce(row->>'work_date','') !~ '^\d{4}-\d{2}-\d{2}$'
   OR coalesce(row->>'entry_source','') NOT IN('manual','excel')
   OR length(coalesce(row->>'source_filename',''))>255
   OR NOT(row ? 'normal_hours') OR NOT(row ? 'overtime_hours')
   OR jsonb_typeof(row->'normal_hours') NOT IN('number','null')
   OR jsonb_typeof(row->'overtime_hours') NOT IN('number','null')) THEN RAISE EXCEPTION 'Ligne de pointage invalide'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS row(worker_id uuid,work_date date,normal_hours numeric,overtime_hours numeric)
   WHERE row.work_date NOT BETWEEN p_start AND p_end
   OR row.normal_hours<0 OR row.overtime_hours<0 OR row.normal_hours>24 OR row.overtime_hours>24
   OR row.normal_hours<>round(row.normal_hours,2) OR row.overtime_hours<>round(row.overtime_hours,2)
   OR coalesce(row.normal_hours,0)+coalesce(row.overtime_hours,0)>24) THEN
   RAISE EXCEPTION 'Heures invalides : entre 0 et 24 heures par jour, deux décimales maximum';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS row(worker_id uuid,work_date date)
   GROUP BY worker_id,work_date HAVING count(*)>1) THEN RAISE EXCEPTION 'Employé et date présents plusieurs fois'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS row(worker_id uuid,work_date date)
   GROUP BY worker_id HAVING count(*)<>days_count) THEN RAISE EXCEPTION 'Chaque employé doit disposer de tous les jours de la quinzaine'; END IF;
 -- Keep the farm attachment and employee snapshots stable until this save commits.
 PERFORM worker.id FROM workers worker WHERE worker.id IN(
   SELECT row.worker_id FROM jsonb_to_recordset(p_rows) AS row(worker_id uuid))
   ORDER BY worker.id FOR SHARE;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS row(worker_id uuid)
   LEFT JOIN workers worker ON worker.id=row.worker_id WHERE worker.id IS NULL OR worker.farm_id IS DISTINCT FROM p_farm) THEN
   RAISE EXCEPTION 'Un employé n’appartient plus à la ferme sélectionnée';
 END IF;
 IF p_action='validate' AND (jsonb_array_length(p_rows)=0 OR EXISTS(
   SELECT 1 FROM jsonb_to_recordset(p_rows) AS row(normal_hours numeric,overtime_hours numeric)
   WHERE normal_hours IS NULL OR overtime_hours IS NULL)) THEN
   RAISE EXCEPTION 'Renseignez les cellules vides ou confirmez-les à zéro avant validation';
 END IF;
 IF NOT found_period THEN
   INSERT INTO employee_attendance_periods(domain_id,farm_id,start_date,end_date,created_by,updated_by,
     last_request_id,last_request_fingerprint) VALUES(p_domain,p_farm,p_start,p_end,auth.uid(),auth.uid(),p_request,fingerprint)
   RETURNING * INTO period;
 END IF;
 DELETE FROM employee_attendance_records previous WHERE previous.period_id=period.id AND NOT EXISTS(
   SELECT 1 FROM jsonb_to_recordset(p_rows) AS row(worker_id uuid,work_date date)
   WHERE row.worker_id=previous.worker_id AND row.work_date=previous.work_date);
 INSERT INTO employee_attendance_records(period_id,domain_id,worker_id,work_date,normal_hours,overtime_hours,
   entry_source,source_filename,worker_name_snapshot,worker_code_snapshot,created_by,updated_by)
 SELECT period.id,p_domain,row.worker_id,row.work_date,row.normal_hours,row.overtime_hours,row.entry_source,
   row.source_filename,btrim(worker.last_name||' '||worker.first_name),coalesce(nullif(worker.matricule,''),worker.id::text),auth.uid(),auth.uid()
 FROM jsonb_to_recordset(p_rows) AS row(worker_id uuid,work_date date,normal_hours numeric,overtime_hours numeric,entry_source text,source_filename text)
 JOIN workers worker ON worker.id=row.worker_id
 ON CONFLICT(period_id,worker_id,work_date) DO UPDATE SET normal_hours=excluded.normal_hours,overtime_hours=excluded.overtime_hours,
   entry_source=excluded.entry_source,source_filename=excluded.source_filename,worker_name_snapshot=excluded.worker_name_snapshot,
   worker_code_snapshot=excluded.worker_code_snapshot,updated_by=auth.uid(),updated_at=now();
 UPDATE employee_attendance_periods SET status=CASE WHEN p_action='validate' THEN 'validated' ELSE 'draft' END,
   revision=CASE WHEN found_period THEN revision+1 ELSE revision END,updated_by=auth.uid(),updated_at=now(),
   validated_by=CASE WHEN p_action='validate' THEN auth.uid() ELSE NULL END,
   validated_at=CASE WHEN p_action='validate' THEN now() ELSE NULL END,
   last_request_id=p_request,last_request_fingerprint=fingerprint
 WHERE id=period.id RETURNING * INTO period;
 RETURN to_jsonb(period)-'last_request_fingerprint';
END $$;
REVOKE ALL ON FUNCTION public.save_employee_attendance(uuid,uuid,date,date,integer,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_employee_attendance(uuid,uuid,date,date,integer,jsonb,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
