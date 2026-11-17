SET ROLE authenticated;
SELECT set_config('test.actor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE
 d uuid:='11111111-1111-4111-8111-111111111111'; f uuid:='33333333-3333-4333-8333-333333333333';
 r jsonb; result jsonb; again jsonb; request uuid:=gen_random_uuid();
BEGIN
 SELECT jsonb_agg(jsonb_build_object('worker_id','55555555-5555-4555-8555-555555555555','work_date',day::date,'normal_hours',NULL,'overtime_hours',NULL,'entry_source','manual','source_filename',NULL))
 INTO r FROM generate_series('2026-11-01'::date,'2026-11-15'::date,'1 day') day;
 result:=save_employee_attendance(d,f,'2026-11-01','2026-11-15',0,r,'save',request);
 IF result->>'revision'<>'1' OR (SELECT count(*) FROM employee_attendance_records)<>15 THEN RAISE EXCEPTION 'draft failed'; END IF;
 again:=save_employee_attendance(d,f,'2026-11-01','2026-11-15',0,r,'save',request);
 IF result<>again THEN RAISE EXCEPTION 'retry was not idempotent'; END IF;
 BEGIN
  PERFORM save_employee_attendance(d,f,'2026-11-01','2026-11-15',1,r,'validate',gen_random_uuid());
  RAISE EXCEPTION 'missing values accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 SELECT jsonb_agg(jsonb_set(jsonb_set(row,'{normal_hours}','16'),'{overtime_hours}','2')) INTO r FROM jsonb_array_elements(r) row;
 BEGIN
  PERFORM save_employee_attendance(d,f,'2026-11-01','2026-11-15',1,r,'save',request);
  RAISE EXCEPTION 'request id reused for different data' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM save_employee_attendance(d,f,'2026-11-01','2026-11-15',0,r,'save',gen_random_uuid());
  RAISE EXCEPTION 'stale revision accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM save_employee_attendance(d,f,'2026-11-01','2026-11-15',1,jsonb_set(r,'{0,overtime_hours}','9'),'save',gen_random_uuid());
  RAISE EXCEPTION 'over 24 hours accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM save_employee_attendance(d,f,'2026-11-01','2026-11-15',1,jsonb_set(r,'{0,worker_id}','"66666666-6666-4666-8666-666666666666"'),'save',gen_random_uuid());
  RAISE EXCEPTION 'foreign worker accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 result:=save_employee_attendance(d,f,'2026-11-01','2026-11-15',1,r,'validate',gen_random_uuid());
 IF result->>'status'<>'validated' OR result->>'revision'<>'2' OR (SELECT sum(normal_hours) FROM employee_attendance_records)<>240 THEN RAISE EXCEPTION 'validation failed'; END IF;
 BEGIN
  PERFORM save_employee_attendance(d,f,'2026-11-01','2026-11-15',2,r,'save',gen_random_uuid());
  RAISE EXCEPTION 'validated period changed' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 result:=save_employee_attendance(d,f,'2026-11-01','2026-11-15',2,r,'reopen',gen_random_uuid());
 IF result->>'status'<>'draft' OR result->>'revision'<>'3' THEN RAISE EXCEPTION 'reopen failed'; END IF;
 BEGIN
  UPDATE employee_attendance_records SET normal_hours=0;
  RAISE EXCEPTION 'direct mutation permitted' USING ERRCODE='XX001';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('test.allowed','no',false);
 IF EXISTS(SELECT 1 FROM employee_attendance_periods) OR EXISTS(SELECT 1 FROM employee_attendance_records) THEN RAISE EXCEPTION 'read permission bypass'; END IF;
 BEGIN
  PERFORM save_employee_attendance(d,f,'2026-11-01','2026-11-15',3,r,'save',gen_random_uuid());
  RAISE EXCEPTION 'unauthorized write accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('test.allowed','yes',false);
 BEGIN
  PERFORM save_employee_attendance('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','2026-11-01','2026-11-15',0,r,'save',gen_random_uuid());
  RAISE EXCEPTION 'foreign domain accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
