param(
  [string]$Source = 'C:\Users\Othman BENHALIMA\Downloads\01 - Projets\SyndicPilot',
  [string]$ResumeBackup
)
$ErrorActionPreference = 'Stop'
function Get-BackupSha256([string]$LiteralPath) {
  $stream = [IO.File]::OpenRead($LiteralPath)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '')
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}
$projectRef = 'infyenkuqlmylrxpydmb'
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$backupPath = Join-Path (Split-Path $sourcePath -Parent) ('SyndicPilot-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if ($ResumeBackup) {
  $backupPath = (Resolve-Path -LiteralPath $ResumeBackup).Path
  if ((Split-Path $backupPath -Parent) -ne (Split-Path $sourcePath -Parent) -or (Split-Path $backupPath -Leaf) -notmatch '^SyndicPilot-backup-\d{8}-\d{6}$') { throw 'Dossier de reprise invalide.' }
} else {
  New-Item -ItemType Directory -Path $backupPath | Out-Null
}
Write-Host "Sauvegarde locale confidentielle : $backupPath"
Write-Host 'Aucune suppression ni restauration sur le projet source ne sera effectuee.'
Write-Host 'Suspendre les saisies dans Syndic pendant cet export.'
$confirmation = Read-Host 'Saisir SYNDIC pour continuer'
if ($confirmation -cne 'SYNDIC') { throw 'Annule.' }
if (!$ResumeBackup) {
$dbHost = Read-Host 'Hote PostgreSQL (Connect > Session pooler ou connexion directe)'
$dbUser = Read-Host 'Utilisateur PostgreSQL (ex. postgres.infyenkuqlmylrxpydmb pour le pooler)'
$dbPort = Read-Host 'Port PostgreSQL (5432 par defaut)'
if (!$dbPort) { $dbPort = '5432' }
if ($dbHost -notmatch '^[a-zA-Z0-9.-]+\.supabase\.(com|co)$') { throw 'Hote Supabase attendu, sans URL ni mot de passe.' }
if ($dbUser -notin @('postgres', "postgres.$projectRef")) { throw 'Utilisateur different du projet Syndic attendu.' }
if ($dbUser -eq 'postgres' -and $dbHost -ne "db.$projectRef.supabase.co") { throw 'La connexion directe doit cibler exactement le projet Syndic.' }
if ($dbUser -eq "postgres.$projectRef" -and $dbHost -notmatch '\.pooler\.supabase\.com$') { throw 'Hote Session pooler attendu.' }
if ($dbPort -ne '5432') { throw 'Utiliser une connexion directe ou un session pooler sur 5432, pas le transaction pooler.' }
$password = Read-Host 'Mot de passe PostgreSQL Syndic (masque)' -AsSecureString
$previousPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
$previousSsl = [Environment]::GetEnvironmentVariable('PGSSLMODE', 'Process')
try {
  $env:PGPASSWORD = [System.Net.NetworkCredential]::new('', $password).Password
  $env:PGSSLMODE = 'require'
  $dbArgs = @('--host', $dbHost, '--port', $dbPort, '--username', $dbUser, '--dbname', 'postgres', '--no-password')
  # The source hostname must be selected for Syndic in Dashboard > Connect.
  $dumpPath = Join-Path $backupPath 'database.dump'
  $dumpArgs = $dbArgs + @('--format=custom', '--file', $dumpPath)
  & pg_dump @dumpArgs
  if ($LASTEXITCODE -ne 0) { throw 'Export PostgreSQL echoue. Sauvegarde incomplete.' }
  & pg_restore --list $dumpPath | Set-Content -LiteralPath (Join-Path $backupPath 'database-toc.txt') -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'Archive PostgreSQL illisible.' }
} finally {
  [Environment]::SetEnvironmentVariable('PGPASSWORD', $previousPassword, 'Process')
  [Environment]::SetEnvironmentVariable('PGSSLMODE', $previousSsl, 'Process')
  $password.Dispose()
}
} else {
  $dumpPath = Join-Path $backupPath 'database.dump'
  if (!(Test-Path -LiteralPath $dumpPath) -or (Get-Item -LiteralPath $dumpPath).Length -eq 0) { throw 'Archive de reprise absente ou vide.' }
  & pg_restore --list $dumpPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Archive de reprise illisible.' }
  Write-Host 'Archive PostgreSQL existante lisible : reprise Storage sans mot de passe.'
}

# Read credentials in memory only; never print or copy them into the source archive.
$envFile = Join-Path $sourcePath '.env'
$settings = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $settings[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}
$apiUrl = $settings['SUPABASE_URL'].TrimEnd('/')
if ($apiUrl -ne "https://$projectRef.supabase.co") { throw 'Projet source .env different de Syndic.' }
$key = $settings['SUPABASE_SERVICE_ROLE_KEY']
if (!$key) { throw 'Cle de service locale absente : export Storage impossible.' }
$headers = @{ apikey = $key; Authorization = "Bearer $key" }
$storageRoot = Join-Path $backupPath 'storage'
New-Item -ItemType Directory -Path $storageRoot -Force | Out-Null
$buckets = @(Invoke-RestMethod -Uri "$apiUrl/storage/v1/bucket" -Headers $headers | ForEach-Object { $_ })
ConvertTo-Json -InputObject $buckets -Depth 20 | Set-Content -LiteralPath (Join-Path $backupPath 'buckets.json') -Encoding utf8
$objects = [System.Collections.Generic.List[object]]::new()
foreach ($bucket in $buckets) {
  if ($bucket.id -isnot [string] -or [string]::IsNullOrWhiteSpace($bucket.id)) { throw 'Reponse Storage : identifiant de bucket invalide.' }
  $bucketEncoded = [Uri]::EscapeDataString([string]$bucket.id)
  $prefixes = [System.Collections.Generic.Queue[string]]::new()
  $prefixes.Enqueue('')
  while ($prefixes.Count -gt 0) {
    $prefix = $prefixes.Dequeue()
    $offset = 0
    do {
      $body = @{ prefix=$prefix; limit=100; offset=$offset; sortBy=@{column='name';order='asc'} } | ConvertTo-Json
      $page = @(Invoke-RestMethod -Method Post -Uri "$apiUrl/storage/v1/object/list/$bucketEncoded" -Headers $headers -ContentType 'application/json' -Body $body | ForEach-Object { $_ })
      foreach ($item in $page) {
        $objectName = if ($prefix) { "$prefix/$($item.name)" } else { [string]$item.name }
        if (!$item.id) { $prefixes.Enqueue($objectName); continue }
        $encodedName = (($objectName -split '/' | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/')
        # Local filenames are independent of remote paths, preventing traversal and Windows-name collisions.
        $localName = [Guid]::NewGuid().ToString('N') + '.bin'
        $localPath = Join-Path $storageRoot $localName
        Invoke-WebRequest -Uri "$apiUrl/storage/v1/object/$bucketEncoded/$encodedName" -Headers $headers -OutFile $localPath
        $length = (Get-Item -LiteralPath $localPath).Length
        if ($null -ne $item.metadata.size -and $length -ne [long]$item.metadata.size) { throw 'Taille Storage incoherente : sauvegarde incomplete.' }
        $objects.Add([pscustomobject]@{bucket=$bucket.id;name=$objectName;file="storage/$localName";bytes=$length;sha256=(Get-BackupSha256 $localPath)})
      }
      $offset += $page.Count
    } while ($page.Count -eq 100)
  }
}
ConvertTo-Json -InputObject @($objects.ToArray()) -Depth 20 | Set-Content -LiteralPath (Join-Path $backupPath 'storage-manifest.json') -Encoding utf8

$codeRoot = Join-Path $backupPath 'source'
& robocopy $sourcePath $codeRoot /E /XJ /XD .git node_modules .next .turbo dist .temp .branches /XF .env '.env.*' '*.log' '*.pem' '*.key' /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'Copie du code incomplete.' }
# Protect local configuration using Windows DPAPI, current Windows user and machine.
Add-Type -AssemblyName System.Security
$secretBytes = [IO.File]::ReadAllBytes($envFile)
$encrypted = [Security.Cryptography.ProtectedData]::Protect($secretBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes((Join-Path $backupPath 'configuration.env.dpapi'), $encrypted)
[Array]::Clear($secretBytes, 0, $secretBytes.Length)
$headers.Clear(); $settings.Clear(); $key = $null
$manifest = Get-ChildItem -LiteralPath $backupPath -File -Recurse | Where-Object { $_.FullName -notin @((Join-Path $backupPath 'checksums.json'), (Join-Path $backupPath 'status.json')) } | ForEach-Object {
  [pscustomobject]@{file=$_.FullName.Substring($backupPath.Length + 1);bytes=$_.Length;sha256=(Get-BackupSha256 $_.FullName)}
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupPath 'checksums.json') -Encoding utf8
foreach ($entry in $manifest) {
  if ((Get-BackupSha256 (Join-Path $backupPath $entry.file)) -ne $entry.sha256) { throw 'Verification des empreintes echouee.' }
}
@{
  projectRef=$projectRef
  createdAt=(Get-Date).ToUniversalTime().ToString('o')
  databaseArchiveReadable=$true
  storageFiles=$objects.Count
  restorationVerified=$false
  deletionAllowed=$false
  limitations=@('No restore test performed', 'Remote Edge Functions may differ from local code', 'Dashboard settings and remote secrets require a separate inventory', 'DPAPI configuration requires the original Windows user and machine', 'Custom database roles are not exported by pg_dump')
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupPath 'status.json') -Encoding utf8
Write-Host "Export termine : $backupPath"
Write-Warning 'Ce dossier contient des donnees confidentielles. Conserver sur un disque chiffre et faire une seconde copie securisee.'
Write-Warning 'La restauration N EST PAS verifiee. Ne pas supprimer Syndic. Les roles, fonctions distantes, secrets et reglages restent a inventorier.'
Read-Host 'Appuyer sur Entree pour fermer'
