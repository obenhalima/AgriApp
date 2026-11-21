BEGIN;
SET LOCAL lock_timeout='5s';

-- Preserve the original imported precision and values; review is a separate gate.
ALTER TABLE public.employee_attendance_records
 ALTER COLUMN normal_hours TYPE numeric,
 ALTER COLUMN overtime_hours TYPE numeric,
 ADD COLUMN source_references jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN original_hours jsonb,
 ADD COLUMN needs_review boolean NOT NULL DEFAULT false,
 ADD COLUMN review_status text CHECK(review_status IN('pending','confirmed','resolved')),
 ADD COLUMN review_reason text CHECK(review_reason IN('duplicate','entry_error','advance','other')),
 ADD COLUMN review_note text,
 ADD COLUMN reviewed_by uuid REFERENCES auth.users(id),
 ADD COLUMN reviewed_at timestamptz,
 ADD COLUMN review_history jsonb NOT NULL DEFAULT '[]';
DO $$ DECLARE constraint_row record; BEGIN
 FOR constraint_row IN SELECT conname FROM pg_constraint WHERE conrelid='public.employee_attendance_records'::regclass
  AND contype='c' AND pg_get_constraintdef(oid) LIKE '%24%' AND (pg_get_constraintdef(oid) LIKE '%normal_hours%' OR pg_get_constraintdef(oid) LIKE '%overtime_hours%')
 LOOP EXECUTE format('ALTER TABLE public.employee_attendance_records DROP CONSTRAINT %I',constraint_row.conname); END LOOP;
END $$;
ALTER TABLE public.employee_attendance_records ADD CONSTRAINT attendance_hours_finite_nonnegative CHECK(
 (normal_hours IS NULL OR (normal_hours>=0 AND normal_hours<=99999999 AND normal_hours::text NOT IN('NaN','Infinity','-Infinity'))) AND
 (overtime_hours IS NULL OR (overtime_hours>=0 AND overtime_hours<=99999999 AND overtime_hours::text NOT IN('NaN','Infinity','-Infinity'))));
UPDATE public.employee_attendance_records SET original_hours=jsonb_build_object('normal_hours',normal_hours,'overtime_hours',overtime_hours);

CREATE FUNCTION public.attendance_hours_need_review(n numeric,s numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(n,0)+coalesce(s,0)>24 OR coalesce(n<>round(n,2),false) OR coalesce(s<>round(s,2),false)
$$;
REVOKE ALL ON FUNCTION public.attendance_hours_need_review(numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.attendance_hours_need_review(numeric,numeric) TO authenticated;

CREATE FUNCTION public.track_attendance_review() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.original_hours:=jsonb_build_object('normal_hours',NEW.normal_hours,'overtime_hours',NEW.overtime_hours);
  NEW.needs_review:=attendance_hours_need_review(NEW.normal_hours,NEW.overtime_hours);
  NEW.review_status:=CASE WHEN NEW.needs_review THEN 'pending' END;
 ELSIF NEW.normal_hours IS DISTINCT FROM OLD.normal_hours OR NEW.overtime_hours IS DISTINCT FROM OLD.overtime_hours OR NEW.source_filename IS DISTINCT FROM OLD.source_filename OR NEW.source_references IS DISTINCT FROM OLD.source_references THEN
  NEW.original_hours:=OLD.original_hours;
  NEW.needs_review:=attendance_hours_need_review(NEW.normal_hours,NEW.overtime_hours) OR OLD.review_status IS NOT NULL;
  NEW.review_status:=CASE WHEN NEW.needs_review THEN 'pending' END;
  NEW.review_reason:=NULL;NEW.review_note:=NULL;NEW.reviewed_by:=NULL;NEW.reviewed_at:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.track_attendance_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER track_attendance_review BEFORE INSERT OR UPDATE ON public.employee_attendance_records FOR EACH ROW EXECUTE FUNCTION public.track_attendance_review();

CREATE FUNCTION public.guard_unreviewed_attendance() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status='validated' AND EXISTS(SELECT 1 FROM employee_attendance_records WHERE period_id=NEW.id AND needs_review) THEN
  RAISE EXCEPTION 'Des anomalies de pointage restent à contrôler. Renseignez le motif et résolvez ou confirmez chaque anomalie avant validation.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_unreviewed_attendance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_unreviewed_attendance BEFORE UPDATE OF status ON public.employee_attendance_periods FOR EACH ROW EXECUTE FUNCTION public.guard_unreviewed_attendance();

-- Also protect payroll at the database boundary, including attempted manual bypasses.
CREATE FUNCTION public.guard_payroll_attendance_review() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM employee_attendance_periods p JOIN employee_attendance_records r ON r.period_id=p.id
  WHERE p.domain_id=NEW.domain_id AND p.farm_id=NEW.farm_id AND p.start_date=NEW.start_date AND r.needs_review
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.rows) line WHERE line->>'worker_id'=r.worker_id::text)) THEN
  RAISE EXCEPTION 'Paie bloquée : des anomalies de pointage restent à contrôler pour les employés sélectionnés.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_payroll_attendance_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_payroll_attendance_review BEFORE INSERT OR UPDATE ON public.payroll_preparations FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_attendance_review();

CREATE OR REPLACE FUNCTION public.save_employee_attendance(
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
   OR (row ? 'source_references' AND (jsonb_typeof(row->'source_references') IS DISTINCT FROM 'array' OR octet_length((row->'source_references')::text)>20000))
   OR NOT(row ? 'normal_hours') OR NOT(row ? 'overtime_hours')
   OR jsonb_typeof(row->'normal_hours') NOT IN('number','null')
   OR jsonb_typeof(row->'overtime_hours') NOT IN('number','null')) THEN RAISE EXCEPTION 'Ligne de pointage invalide'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS row(worker_id uuid,work_date date,normal_hours numeric,overtime_hours numeric)
   WHERE row.work_date NOT BETWEEN p_start AND p_end
   OR row.normal_hours<0 OR row.overtime_hours<0 OR row.normal_hours>99999999 OR row.overtime_hours>99999999
   OR row.normal_hours::text IN('NaN','Infinity','-Infinity') OR row.overtime_hours::text IN('NaN','Infinity','-Infinity')) THEN
   RAISE EXCEPTION 'Heures invalides : nombres positifs ou nuls et inférieurs à 100 millions';
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
   entry_source,source_filename,source_references,worker_name_snapshot,worker_code_snapshot,created_by,updated_by)
 SELECT period.id,p_domain,row.worker_id,row.work_date,row.normal_hours,row.overtime_hours,row.entry_source,
   row.source_filename,coalesce(row.source_references,'[]'::jsonb),btrim(worker.last_name||' '||worker.first_name),coalesce(nullif(worker.matricule,''),worker.id::text),auth.uid(),auth.uid()
 FROM jsonb_to_recordset(p_rows) AS row(worker_id uuid,work_date date,normal_hours numeric,overtime_hours numeric,entry_source text,source_filename text,source_references jsonb)
 JOIN workers worker ON worker.id=row.worker_id
 ON CONFLICT(period_id,worker_id,work_date) DO UPDATE SET normal_hours=excluded.normal_hours,overtime_hours=excluded.overtime_hours,
   entry_source=excluded.entry_source,source_filename=excluded.source_filename,source_references=excluded.source_references,worker_name_snapshot=excluded.worker_name_snapshot,
   worker_code_snapshot=excluded.worker_code_snapshot,updated_by=auth.uid(),updated_at=now();
 UPDATE employee_attendance_periods SET status=CASE WHEN p_action='validate' THEN 'validated' ELSE 'draft' END,
   revision=CASE WHEN found_period THEN revision+1 ELSE revision END,updated_by=auth.uid(),updated_at=now(),
   validated_by=CASE WHEN p_action='validate' THEN auth.uid() ELSE NULL END,
   validated_at=CASE WHEN p_action='validate' THEN now() ELSE NULL END,
   last_request_id=p_request,last_request_fingerprint=fingerprint
 WHERE id=period.id RETURNING * INTO period;
 RETURN to_jsonb(period)-'last_request_fingerprint';
END $$;

CREATE FUNCTION public.review_employee_attendance(p_domain uuid,p_period uuid,p_revision integer,p_worker uuid,p_date date,p_reason text,p_note text,p_action text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE period employee_attendance_periods%ROWTYPE; item employee_attendance_records%ROWTYPE; fp text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(is_domain_member(p_domain,auth.uid()),false) OR NOT coalesce(has_domain_permission(p_domain,auth.uid(),'pointage','admin'),false) THEN
  RAISE EXCEPTION 'Contrôle du pointage réservé au responsable autorisé' USING ERRCODE='42501'; END IF;
 SELECT * INTO period FROM employee_attendance_periods WHERE id=p_period AND domain_id=p_domain;
 IF NOT FOUND THEN RAISE EXCEPTION 'Période inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('employee-attendance:'||period.farm_id::text||':'||period.start_date::text,0));
 SELECT * INTO period FROM employee_attendance_periods WHERE id=p_period AND domain_id=p_domain FOR UPDATE;
 IF p_request IS NULL OR p_revision IS NULL OR p_worker IS NULL OR p_date IS NULL OR p_reason IS NULL OR p_reason NOT IN('duplicate','entry_error','advance','other')
  OR p_action IS NULL OR p_action NOT IN('confirm','resolve') OR length(coalesce(p_note,''))>1000 OR (p_reason='other' AND length(btrim(coalesce(p_note,'')))=0) THEN
  RAISE EXCEPTION 'Renseignez le motif et, pour Autre, un commentaire.'; END IF;
 fp:=md5(jsonb_build_array('review',p_domain,p_period,p_worker,p_date,p_reason,p_note,p_action)::text);
 IF period.last_request_id=p_request THEN
  IF period.last_request_fingerprint<>fp THEN RAISE EXCEPTION 'Requête déjà utilisée pour un autre contrôle'; END IF;
  RETURN to_jsonb(period)-'last_request_fingerprint'; END IF;
 IF period.revision<>p_revision THEN RAISE EXCEPTION 'Le pointage a changé. Rechargez avant de contrôler.'; END IF;
 IF period.status<>'draft' THEN RAISE EXCEPTION 'Rouvrez le pointage avant de le contrôler'; END IF;
 SELECT * INTO item FROM employee_attendance_records WHERE period_id=p_period AND worker_id=p_worker AND work_date=p_date AND domain_id=p_domain FOR UPDATE;
 IF NOT FOUND OR NOT item.needs_review THEN RAISE EXCEPTION 'Cette ligne ne nécessite plus de contrôle'; END IF;
 IF p_action='resolve' AND attendance_hours_need_review(item.normal_hours,item.overtime_hours) THEN
  RAISE EXCEPTION 'Corrigez puis enregistrez les heures avant de résoudre cette anomalie.'; END IF;
 IF p_reason='advance' AND p_action='confirm' THEN
  RAISE EXCEPTION 'Une avance ne constitue pas des heures : corrigez le pointage, résolvez l’anomalie puis saisissez le montant dans la paie.'; END IF;
 UPDATE employee_attendance_records SET needs_review=false,review_status=CASE WHEN p_action='confirm' THEN 'confirmed' ELSE 'resolved' END,
  review_reason=p_reason,review_note=nullif(btrim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_by=auth.uid(),updated_at=now(),
  review_history=review_history||jsonb_build_array(jsonb_build_object('action',p_action,'reason',p_reason,'note',nullif(btrim(p_note),''),
    'user',auth.uid(),'at',now(),'normal_hours',normal_hours,'overtime_hours',overtime_hours))
 WHERE period_id=p_period AND worker_id=p_worker AND work_date=p_date;
 UPDATE employee_attendance_periods SET revision=revision+1,updated_by=auth.uid(),updated_at=now(),last_request_id=p_request,last_request_fingerprint=fp
 WHERE id=p_period RETURNING * INTO period;
 RETURN to_jsonb(period)-'last_request_fingerprint';
END $$;
REVOKE ALL ON FUNCTION public.review_employee_attendance(uuid,uuid,integer,uuid,date,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_employee_attendance(uuid,uuid,integer,uuid,date,text,text,text,uuid) TO authenticated;
ALTER TABLE public.payslips ALTER COLUMN hours_worked TYPE numeric, ALTER COLUMN hours_overtime TYPE numeric;

-- Preserve the deployed payroll rules and permissions, including declaration defaults.
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.save_payroll_preparation(uuid,uuid,date,date,uuid,date,integer,integer,jsonb,text,uuid)'::regprocedure);
 IF position('CASE WHEN field IN(''normal_rate'',''overtime_rate'') THEN 9 ELSE 2 END' IN definition)=0
 OR position('IF coalesce(normal,0)+coalesce(overtime,0)>(p_end-p_start+1)*24' IN definition)=0 THEN
  RAISE EXCEPTION 'Version de préparation de paie inattendue. Vérifiez les migrations de paie précédentes.';
 END IF;
 definition:=replace(definition,'CASE WHEN field IN(''normal_rate'',''overtime_rate'') THEN 9 ELSE 2 END',
  'CASE WHEN field IN(''normal_rate'',''overtime_rate'') OR (row->>''source''=''attendance'' AND field IN(''normal_hours'',''overtime_hours'')) THEN 9 ELSE 2 END');
 definition:=replace(definition,'IF coalesce(normal,0)+coalesce(overtime,0)>(p_end-p_start+1)*24',
  'IF row->>''source''<>''attendance'' AND coalesce(normal,0)+coalesce(overtime,0)>(p_end-p_start+1)*24');
 EXECUTE definition;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
