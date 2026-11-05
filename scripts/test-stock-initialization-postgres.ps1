$ErrorActionPreference='Stop'
# Disposable local database only. Never reads .env or application credentials.
$testRoot=Join-Path ([System.IO.Path]::GetTempPath()) ('itrix-stock-init-'+[guid]::NewGuid().ToString('N'))
$testData=Join-Path $testRoot 'data'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$testPort=55447
$started=$false
function Run-SqlFile($path) {
 & psql -X -h 127.0.0.1 -p $testPort -U stock_init_test -d postgres -v ON_ERROR_STOP=1 -f $path
 if($LASTEXITCODE -ne 0){throw "SQL test failed: $path"}
}
try {
 & initdb -D $testData -U stock_init_test --auth=trust --encoding=UTF8 --no-locale | Out-Null
 if($LASTEXITCODE -ne 0){throw 'initdb failed'}
 $launcher=Start-Process -FilePath (Get-Command pg_ctl).Source -ArgumentList @('-D',('"'+$testData+'"'),'-l',('"'+(Join-Path $testRoot 'postgres.log')+'"'),'-o',('"-p '+$testPort+' -h 127.0.0.1"'),'-w','start') -WindowStyle Hidden -PassThru
 if(!$launcher.WaitForExit(30000) -or $launcher.ExitCode -ne 0){throw 'temporary PostgreSQL startup failed'}
 $actual=& psql -X -h 127.0.0.1 -p $testPort -U stock_init_test -d postgres -Atc 'SHOW data_directory'
 if($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($actual) -ne [System.IO.Path]::GetFullPath($testData)){throw 'Unexpected database: refusing fixture writes'}
 $started=$true
 Run-SqlFile 'scripts/fixtures/stock-init-bootstrap.sql'
 # Exercise actual movement costing / balance projection functions from the repository.
 foreach($pair in @(@('supabase/migrations/106b_warehouse_balances.sql','CREATE FUNCTION public.warehouse_stock_total\(\)[\s\S]*?END \$\$;'),@('supabase/migrations/115_inventory_costing.sql','CREATE OR REPLACE FUNCTION public.post_warehouse_movement\(\)[\s\S]*?END \$\$;'))) {
   $functionSql=[regex]::Match((Get-Content -LiteralPath $pair[0] -Raw),$pair[1]).Value
   if(!$functionSql){throw 'Movement function fixture extraction failed'}
   & psql -X -h 127.0.0.1 -p $testPort -U stock_init_test -d postgres -v ON_ERROR_STOP=1 -c $functionSql
   if($LASTEXITCODE -ne 0){throw 'Movement fixture installation failed'}
 }
 & psql -X -h 127.0.0.1 -p $testPort -U stock_init_test -d postgres -v ON_ERROR_STOP=1 -c 'CREATE TRIGGER movement BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION post_warehouse_movement(); CREATE TRIGGER total BEFORE INSERT OR UPDATE OF current_qty ON stock_items FOR EACH ROW EXECUTE FUNCTION warehouse_stock_total();'
 if($LASTEXITCODE -ne 0){throw 'Movement fixture trigger installation failed'}
 Run-SqlFile 'supabase/migrations/164_stock_initialization.sql'
 Run-SqlFile 'scripts/fixtures/stock-init-assertions.sql'
} finally {
 if($started -or (Test-Path -LiteralPath (Join-Path $testData 'postmaster.pid'))){& pg_ctl -D $testData -m fast -w stop | Out-Null}
 Write-Output "Disposable PostgreSQL stopped. Diagnostics: $testRoot"
}
