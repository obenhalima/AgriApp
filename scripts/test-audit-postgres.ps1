$ErrorActionPreference='Stop'
# Disposable PostgreSQL only, no use of application/database credentials.
$testRoot=Join-Path ([System.IO.Path]::GetTempPath()) ('itrix-audit-'+[guid]::NewGuid().ToString('N'))
$testData=Join-Path $testRoot 'data'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$testPort=55439
$started=$false
try {
 & initdb -D $testData -U audit_test --auth=trust --encoding=UTF8 --no-locale | Out-Null
 if($LASTEXITCODE -ne 0){throw 'initdb failed'}
 $launcher=Start-Process -FilePath (Get-Command pg_ctl).Source -ArgumentList @('-D',('"'+$testData+'"'),'-l',('"'+(Join-Path $testRoot 'postgres.log')+'"'),'-o',('"-p '+$testPort+' -h 127.0.0.1"'),'-w','start') -WindowStyle Hidden -PassThru
 # Start-Process -Wait waits for postgres descendants too on Windows. Wait only for pg_ctl.
 if(!$launcher.WaitForExit(30000)){throw 'temporary PostgreSQL startup timed out'}
 & pg_ctl -D $testData status | Out-Null
 if($LASTEXITCODE -ne 0){throw 'temporary PostgreSQL start failed'}
 $started=$true
 $actual=& psql -X -h 127.0.0.1 -p $testPort -U audit_test -d postgres -Atc 'SHOW data_directory'
 if($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($actual) -ne [System.IO.Path]::GetFullPath($testData)){throw 'Unexpected database: refusing fixture writes'}
 foreach($sql in @('scripts/fixtures/audit-bootstrap.sql','scripts/fixtures/audit-163-bootstrap.sql','supabase/migrations/162_audit_trail.sql','scripts/fixtures/audit-assertions.sql','supabase/migrations/163_audit_coverage_and_context.sql','scripts/fixtures/audit-163-assertions.sql')){
  & psql -X -h 127.0.0.1 -p $testPort -U audit_test -d postgres -v ON_ERROR_STOP=1 -f $sql
  if($LASTEXITCODE -ne 0){throw "Audit SQL test failed: $sql"}
 }
} finally {
 if($started -or (Test-Path -LiteralPath (Join-Path $testData 'postmaster.pid'))){& pg_ctl -D $testData -m fast -w stop | Out-Null}
 # Kept for diagnostics; no recursive deletion of user directories.
 Write-Output "Disposable test database stopped. Diagnostics: $testRoot"
}
