$ErrorActionPreference='Stop'
# Disposable local database only. Never reads .env or application credentials.
$testRoot=Join-Path ([System.IO.Path]::GetTempPath()) ('itrix-stock-allocation-'+[guid]::NewGuid().ToString('N'))
$testData=Join-Path $testRoot 'data'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$testPort=55448
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
 Run-SqlFile 'scripts/fixtures/stock-allocation-bootstrap.sql'
 # Exercise actual movement costing / balance projection functions from the repository.
 foreach($pair in @(@('supabase/migrations/106b_warehouse_balances.sql','CREATE FUNCTION public.warehouse_stock_total\(\)[\s\S]*?END \$\$;'),@('supabase/migrations/115_inventory_costing.sql','CREATE OR REPLACE FUNCTION public.post_warehouse_movement\(\)[\s\S]*?END \$\$;'))) {
   $functionSql=[regex]::Match((Get-Content -LiteralPath $pair[0] -Raw),$pair[1]).Value
   if(!$functionSql){throw 'Movement function fixture extraction failed'}
   $fixtureFile=Join-Path $testRoot 'extracted-function.sql'
   [System.IO.File]::WriteAllText($fixtureFile,$functionSql,[System.Text.UTF8Encoding]::new($false))
   Run-SqlFile $fixtureFile
   if($LASTEXITCODE -ne 0){throw 'Movement fixture installation failed'}
 }
 & psql -X -h 127.0.0.1 -p $testPort -U stock_init_test -d postgres -v ON_ERROR_STOP=1 -c 'CREATE TRIGGER movement BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION post_warehouse_movement(); CREATE TRIGGER total BEFORE INSERT OR UPDATE OF current_qty ON stock_items FOR EACH ROW EXECUTE FUNCTION warehouse_stock_total();'
 if($LASTEXITCODE -ne 0){throw 'Movement fixture trigger installation failed'}
 foreach($pair in @(@('supabase/migrations/115_inventory_costing.sql','CREATE FUNCTION public.post_consumption_cost\(p_movement UUID\)[\s\S]*?END \$\$;'),@('supabase/migrations/115_inventory_costing.sql','CREATE FUNCTION public.guard_generated_consumption_cost\(\)[\s\S]*?END \$\$;'),@('supabase/migrations/106b_warehouse_balances.sql','CREATE FUNCTION public.submit_warehouse_stock_exit\([\s\S]*?END \$\$;'),@('supabase/migrations/106b_warehouse_balances.sql','CREATE OR REPLACE FUNCTION public.execute_stock_exit_request\([\s\S]*?END \$\$;'),@('supabase/migrations/080_treatment_stock_approval_workflow.sql','CREATE OR REPLACE FUNCTION public.submit_stock_exit_request\([\s\S]*?END \$\$;'))) {
   $functionSql=[regex]::Match((Get-Content -LiteralPath $pair[0] -Raw),$pair[1]).Value
   if(!$functionSql){throw 'Cost function extraction failed'}
   $fixtureFile=Join-Path $testRoot 'extracted-function.sql'
   [System.IO.File]::WriteAllText($fixtureFile,$functionSql,[System.Text.UTF8Encoding]::new($false))
   Run-SqlFile $fixtureFile
   if($LASTEXITCODE -ne 0){throw 'Cost fixture installation failed'}
 }
 Run-SqlFile 'supabase/migrations/20261105180512_stock_exit_multi_greenhouse.sql'
 Run-SqlFile 'supabase/migrations/20261105185121_stock_exit_optional_note.sql'
 Run-SqlFile 'supabase/migrations/20261105185316_stock_exit_request_cancellation.sql'
 Run-SqlFile 'supabase/migrations/20261105190912_stock_exit_approval_execution.sql'
 Run-SqlFile 'supabase/migrations/20261105192940_stock_exit_existing_movement_guard.sql'
 & psql -X -h 127.0.0.1 -p $testPort -U stock_init_test -d postgres -v ON_ERROR_STOP=1 -c 'CREATE TRIGGER consumption AFTER INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION trigger_consumption_cost(); CREATE TRIGGER review AFTER INSERT ON inventory_consumption_reviews FOR EACH ROW EXECUTE FUNCTION trigger_consumption_cost(); CREATE TRIGGER guard BEFORE INSERT OR UPDATE OR DELETE ON cost_entries FOR EACH ROW EXECUTE FUNCTION guard_generated_consumption_cost();'
 if($LASTEXITCODE -ne 0){throw 'Cost trigger installation failed'}
 Run-SqlFile 'scripts/fixtures/stock-allocation-assertions.sql'
} finally {
 if($started -or (Test-Path -LiteralPath (Join-Path $testData 'postmaster.pid'))){& pg_ctl -D $testData -m fast -w stop | Out-Null}
 Write-Output "Disposable PostgreSQL stopped. Diagnostics: $testRoot"
}
