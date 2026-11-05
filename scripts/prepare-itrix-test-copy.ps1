param()
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$sourceRef = 'dlisonvsphybjiyxoymk'
$targetRef = 'jxqcvhgmuskesopprqos'
$archiveRoot = Join-Path $repoRoot ('tmp\itrix-test-copy-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $archiveRoot | Out-Null
Write-Host 'Preparation de copie ITRIX : PRODUCTION -> TEST uniquement.'
Write-Host 'Aucune ecriture dans les bases, aucun envoi, aucune restauration automatique.'
Write-Host 'Les fichiers exportes sont confidentiels : ne pas partager ni placer dans Git.'
if ((Read-Host 'Saisir COPIER VERS TEST pour continuer') -cne 'COPIER VERS TEST') { throw 'Annule.' }
$oldPassword = $env:PGPASSWORD
$oldSsl = $env:PGSSLMODE
$oldOptions = $env:PGOPTIONS
try {
  $env:PGSSLMODE = 'require'
  $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=120000'
  foreach ($entry in @(@{ref=$sourceRef;label='PRODUCTION'},@{ref=$targetRef;label='TEST'})) {
    Write-Host "Connexion $($entry.label) : projet $($entry.ref)"
    $defaultHost = if ($entry.ref -eq $sourceRef) { 'aws-1-eu-west-1.pooler.supabase.com' } else { "db.$($entry.ref).supabase.co" }
    $dbHost = (Read-Host "Hote (Entree = $defaultHost ; sinon coller le Host Session pooler, port 5432)").Trim()
    if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = $defaultHost }
    if ($dbHost -eq "db.$($entry.ref).supabase.co") {
      $dbUser = 'postgres'
    } elseif ($dbHost -match '^[a-zA-Z0-9.-]+\.pooler\.supabase\.com$') {
      $dbUser = "postgres.$($entry.ref)"
    } else {
      throw "Hote invalide : utiliser db.$($entry.ref).supabase.co ou le Session pooler de ce projet."
    }
    $password = Read-Host "Mot de passe PostgreSQL $($entry.label) (masque)" -AsSecureString
    try {
      $env:PGPASSWORD = [Net.NetworkCredential]::new('', $password).Password
      $dbArgs = @('--host',$dbHost,'--port','5432','--username',$dbUser,'--dbname','postgres','--no-password')
      $inventorySql = "SELECT n.nspname AS schema_name,c.relname AS table_name,c.reltuples::bigint AS estimated_rows FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;"
      $inventory = & psql @dbArgs -X -v ON_ERROR_STOP=1 --csv -c $inventorySql
      if ($LASTEXITCODE -ne 0) { throw "Connexion ou inventaire $($entry.label) echoue." }
      $inventory | Set-Content -LiteralPath (Join-Path $archiveRoot "$($entry.label)-tables.csv") -Encoding utf8
      if ($entry.ref -eq $sourceRef) {
        $dumpPath = Join-Path $archiveRoot 'production.dump'
        $dumpArgs = $dbArgs + @('--format=custom','--file',$dumpPath)
        & pg_dump @dumpArgs
        if ($LASTEXITCODE -ne 0) { throw 'Export production echoue.' }
        $toc = & pg_restore --list $dumpPath
        if ($LASTEXITCODE -ne 0) { throw 'Archive illisible.' }
        $toc | Set-Content -LiteralPath (Join-Path $archiveRoot 'production-toc.txt') -Encoding utf8
        # Generate SQL for review, never execute it. No restore into a linked/default target.
        & pg_restore --schema-only --no-owner --no-privileges --file (Join-Path $archiveRoot 'schema-review.sql') $dumpPath
        if ($LASTEXITCODE -ne 0) { throw 'Extraction du schema echouee.' }
      }
    } finally { $env:PGPASSWORD = $null; $password.Dispose() }
  }
  @{ sourceRef=$sourceRef;targetRef=$targetRef;archiveReadable=$true;restored=$false;externalSendsEnabled=$false;nextStep='Review live schema, triggers, cron, vault and integration tables before restoring into TEST';createdAt=(Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $archiveRoot 'status.json') -Encoding utf8
  Write-Host "Preparation terminee : $archiveRoot"
  Write-Warning 'Aucune donnee encore restauree. Faire verifier le schema et le plan de restauration avant execution.'
} finally {
  [Environment]::SetEnvironmentVariable('PGPASSWORD',$oldPassword,'Process')
  [Environment]::SetEnvironmentVariable('PGSSLMODE',$oldSsl,'Process')
  [Environment]::SetEnvironmentVariable('PGOPTIONS',$oldOptions,'Process')
}
Read-Host 'Appuyer sur Entree pour fermer'
