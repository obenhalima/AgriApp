$ErrorActionPreference='Stop'
# Disposable database. This script never reads application credentials.
$testRoot=Join-Path ([System.IO.Path]::GetTempPath()) ('itrix-attendance-review-'+[guid]::NewGuid().ToString('N'))
$testData=Join-Path $testRoot 'data'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$testPort=55463
$started=$false
function Run-Sql($sql) {
  $sqlFile=Join-Path $testRoot 'test.sql'
  Set-Content -LiteralPath $sqlFile -Value $sql -Encoding utf8
  & psql -X -h 127.0.0.1 -p $testPort -U employee_test -d postgres -v ON_ERROR_STOP=1 -f $sqlFile
  if($LASTEXITCODE -ne 0){throw 'Attendance SQL test failed'}
}
try {
  & initdb -D $testData -U employee_test --auth=trust --encoding=UTF8 --no-locale | Out-Null
  if($LASTEXITCODE -ne 0){throw 'initdb failed'}
  $launcher=Start-Process -FilePath (Get-Command pg_ctl).Source -ArgumentList @('-D',('"'+$testData+'"'),'-l',('"'+(Join-Path $testRoot 'postgres.log')+'"'),'-o',('"-p '+$testPort+' -h 127.0.0.1"'),'-w','start') -WindowStyle Hidden -PassThru
  if(!$launcher.WaitForExit(30000) -or $launcher.ExitCode -ne 0){throw 'temporary PostgreSQL startup failed'}
  $actual=& psql -X -h 127.0.0.1 -p $testPort -U employee_test -d postgres -Atc 'SHOW data_directory'
  if($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($actual) -ne [System.IO.Path]::GetFullPath($testData)){throw 'Unexpected database: refusing fixture writes'}
  $started=$true
  Run-Sql (Get-Content scripts/fixtures/attendance-bootstrap.sql -Raw)
  Run-Sql (Get-Content supabase/migrations/20261117083332_employee_attendance.sql -Raw)
  Run-Sql (Get-Content scripts/fixtures/payroll-preparation-bootstrap.sql -Raw)
  Run-Sql (Get-Content supabase/migrations/20261117090630_payroll_attendance_preparation.sql -Raw)
  Run-Sql 'ALTER TABLE workers ADD COLUMN dependents integer DEFAULT 0;'
  Run-Sql (Get-Content supabase/migrations/20261117093413_payroll_net_rates.sql -Raw)
  Run-Sql (Get-Content supabase/migrations/20261117103118_payroll_declared_default.sql -Raw)
  Run-Sql (Get-Content supabase/migrations/20261120035232_attendance_anomaly_review.sql -Raw)
  Run-Sql (Get-Content scripts/fixtures/attendance-review-assertions.sql -Raw)
  Write-Output 'PASS attendance anomaly import, exact values, review, permissions, replay, changed values and payroll gate'
} finally {
  if($started){& pg_ctl -D $testData -m immediate -w stop | Out-Null}
}
