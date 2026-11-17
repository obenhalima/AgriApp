$ErrorActionPreference='Stop'
# Disposable database. This script never reads application credentials.
$testRoot=Join-Path ([System.IO.Path]::GetTempPath()) ('itrix-employee-recovery-'+[guid]::NewGuid().ToString('N'))
$testData=Join-Path $testRoot 'data'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$testPort=55459
$started=$false
function Run-Sql($sql) {
  $sqlFile=Join-Path $testRoot 'test.sql'
  Set-Content -LiteralPath $sqlFile -Value $sql -Encoding utf8
  & psql -X -h 127.0.0.1 -p $testPort -U employee_test -d postgres -v ON_ERROR_STOP=1 -f $sqlFile
  if($LASTEXITCODE -ne 0){throw 'Employee recovery SQL test failed'}
}
try {
  & initdb -D $testData -U employee_test --auth=trust --encoding=UTF8 --no-locale | Out-Null
  if($LASTEXITCODE -ne 0){throw 'initdb failed'}
  $launcher=Start-Process -FilePath (Get-Command pg_ctl).Source -ArgumentList @('-D',('"'+$testData+'"'),'-l',('"'+(Join-Path $testRoot 'postgres.log')+'"'),'-o',('"-p '+$testPort+' -h 127.0.0.1"'),'-w','start') -WindowStyle Hidden -PassThru
  if(!$launcher.WaitForExit(30000) -or $launcher.ExitCode -ne 0){throw 'temporary PostgreSQL startup failed'}
  $actual=& psql -X -h 127.0.0.1 -p $testPort -U employee_test -d postgres -Atc 'SHOW data_directory'
  if($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($actual) -ne [System.IO.Path]::GetFullPath($testData)){throw 'Unexpected database: refusing fixture writes'}
  $started=$true
  Run-Sql @'
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE profiles(id uuid PRIMARY KEY,is_active boolean);
CREATE TABLE domains(id uuid PRIMARY KEY,code text,is_active boolean);
CREATE TABLE farms(id uuid PRIMARY KEY,domain_id uuid,is_active boolean);
CREATE TABLE workers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),first_name varchar(100) NOT NULL,last_name varchar(100) NOT NULL,
 farm_id uuid REFERENCES farms(id),is_active boolean,daily_rate numeric(8,2),notes text,category text,contract_type text,
 pay_frequency text,base_salary numeric,family_status text,dependents integer,payment_method text,
 cin varchar(20),cnss_number varchar(20),phone varchar(50),email text,start_date date,date_birth date);
CREATE FUNCTION has_domain_permission(d uuid,u uuid,m text,a text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(current_setting('test.allowed',true),'yes')='yes' $$;
INSERT INTO profiles VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
INSERT INTO domains VALUES('11111111-1111-4111-8111-111111111111','DOM-BENHALIMA',true),('22222222-2222-4222-8222-222222222222','DOMBEN501',true);
INSERT INTO farms VALUES('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',true),('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',true);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON profiles,domains,farms TO authenticated;
GRANT SELECT,INSERT,UPDATE ON workers TO authenticated;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY worker_client ON workers TO authenticated USING(farm_id=coalesce(nullif(current_setting('test.farm',true),''),'33333333-3333-4333-8333-333333333333')::uuid) WITH CHECK(farm_id=coalesce(nullif(current_setting('test.farm',true),''),'33333333-3333-4333-8333-333333333333')::uuid);
'@
  Run-Sql (Get-Content -LiteralPath 'supabase/migrations/20261117074326_employee_recovery_import.sql' -Raw)
  Run-Sql (Get-Content -LiteralPath 'supabase/migrations/20261117082546_employee_name_only.sql' -Raw)
  Run-Sql 'ALTER TABLE workers ADD COLUMN is_declared boolean;'
  $netMigration = Get-Content supabase/migrations/20261117093413_payroll_net_rates.sql -Raw
  $importStart = $netMigration.IndexOf('CREATE OR REPLACE FUNCTION public.import_employee_recovery')
  $importEnd = $netMigration.IndexOf("NOTIFY pgrst", $importStart)
  Run-Sql ($netMigration.Substring($importStart, $importEnd - $importStart))
  Run-Sql @'
SET ROLE authenticated;
SELECT set_config('test.actor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE d uuid:='11111111-1111-4111-8111-111111111111'; f uuid:='33333333-3333-4333-8333-333333333333';
 rows jsonb:='[{"excel_row":5,"source_number":"1","source_name":"NOM COMPLET","payment_name":"ALIAS","normal_hourly_rate":11.9345625,"overtime_hourly_rate":11.375,"daily_rate":95.4765,"seniority_rate":0,"is_active":false,"notes":"Source à confirmer","profile":{"is_declared":"true"}}]';
 result jsonb; old_metadata jsonb;
BEGIN
 result:=import_employee_recovery(d,f,'employees.xlsx',rows,false);
 IF result->>'created'<>'1' OR EXISTS(SELECT 1 FROM workers) THEN RAISE EXCEPTION 'preview wrote data'; END IF;
 result:=import_employee_recovery(d,f,'employees.xlsx',rows,true);
 IF result->>'created'<>'1' OR (SELECT count(*) FROM workers)<>1 THEN RAISE EXCEPTION 'creation failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM workers WHERE first_name='' AND last_name='NOM COMPLET' AND normal_hourly_rate=11.9345625
   AND is_declared AND daily_rate=95.4765 AND seniority_rate=0 AND NOT is_active AND category IS NULL AND base_salary IS NULL
   AND employee_import->>'imported_by'=auth.uid()::text) THEN RAISE EXCEPTION 'source values not preserved'; END IF;
 SELECT employee_import INTO old_metadata FROM workers;
 result:=import_employee_recovery(d,f,'renamed.xlsx',rows,true);
 IF result->>'skipped'<>'1' OR (SELECT count(*) FROM workers)<>1 THEN RAISE EXCEPTION 'retry duplicated workers'; END IF;
 result:=import_employee_recovery(d,f,'employees.xlsx',jsonb_set(rows,'{0,normal_hourly_rate}','20'),false);
 IF result->>'conflicts'<>'1' THEN RAISE EXCEPTION 'changed source not detected'; END IF;
 BEGIN
  PERFORM import_employee_recovery(d,f,'employees.xlsx',jsonb_set(rows,'{0,normal_hourly_rate}','20'),true);
  RAISE EXCEPTION 'changed source accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM import_employee_recovery(d,'44444444-4444-4444-8444-444444444444','employees.xlsx',rows,true);
  RAISE EXCEPTION 'foreign farm accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM import_employee_recovery('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','employees.xlsx',rows,true);
  RAISE EXCEPTION 'foreign client worker scope bypassed' USING ERRCODE='XX001';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE workers SET last_name='';
  RAISE EXCEPTION 'empty name edit accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 UPDATE workers SET first_name='',last_name='Nom complet',is_active=true;
 IF NOT EXISTS(SELECT 1 FROM workers WHERE employee_import=old_metadata) THEN RAISE EXCEPTION 'edit lost provenance'; END IF;
 BEGIN
  UPDATE workers SET employee_import=NULL;
  RAISE EXCEPTION 'provenance removed' USING ERRCODE='XX001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 result:=import_employee_recovery(d,f,'employees.xlsx',rows,true);
 IF result->>'skipped'<>'1' THEN RAISE EXCEPTION 'completed record duplicated'; END IF;
 PERFORM set_config('test.allowed','no',false);
 BEGIN
  PERFORM import_employee_recovery(d,f,'employees.xlsx',rows,true);
  RAISE EXCEPTION 'unauthorized import accepted' USING ERRCODE='XX001';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('test.allowed','yes',false);
 PERFORM set_config('test.farm','44444444-4444-4444-8444-444444444444',false);
 result:=import_employee_recovery('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',
  'model.xlsx',jsonb_set(rows,'{0,profile}','{"first_name":"Jean","last_name":"Exemple","cin":"AB001","start_date":"2026-07-01"}'),true);
 IF result->>'created'<>'1' OR NOT EXISTS(SELECT 1 FROM workers WHERE first_name='Jean' AND last_name='Exemple'
  AND cin='AB001' AND start_date='2026-07-01') THEN RAISE EXCEPTION 'generic client profile import failed'; END IF;
 RAISE NOTICE 'PASS employee preview, source fidelity, idempotency, conflict, tenant, normal edit and provenance guards';
END $$;
'@
} finally {
  if($started -or (Test-Path -LiteralPath (Join-Path $testData 'postmaster.pid'))){& pg_ctl -D $testData -m fast -w stop | Out-Null}
  Write-Output "Disposable PostgreSQL stopped. Diagnostics: $testRoot"
}
