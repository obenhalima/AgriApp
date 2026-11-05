param([switch]$Deploy)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$config = Get-Content -LiteralPath (Join-Path $repoRoot 'deployment/test-environment.json') -Raw | ConvertFrom-Json
$ref = $config.supabaseProjectRef
if (!$ref -or $ref -notmatch '^[a-z]{20}$' -or $ref -eq $config.productionProjectRefForbidden) {
  throw 'Configurer la reference de branche Supabase TEST dans deployment/test-environment.json. Production interdite.'
}
$branch = (& git -C $repoRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'test') { throw 'Branche Git test obligatoire.' }
if ($Deploy -and (& git -C $repoRoot status --porcelain)) { throw 'Enregistrer et revoir les sources avant de deployer.' }
foreach ($function in $config.edgeFunctions) {
  if (!(Test-Path -LiteralPath (Join-Path $repoRoot "supabase/functions/$function/index.ts"))) { throw "Source manquante : $function" }
  if ($Deploy) {
    # Explicit target only; never link a default project or disable JWT verification.
    & supabase --workdir $repoRoot functions deploy $function --project-ref $ref --use-api
    if ($LASTEXITCODE -ne 0) { throw "Echec de deploiement : $function. Les fonctions precedentes peuvent etre deja deployees sur TEST." }
  } else {
    Write-Host "PREPARATION UNIQUEMENT : $function -> branche TEST"
  }
}
if (!$Deploy) { Write-Host 'Aucun deploiement effectue. JWT reste active ; webhooks et taches externes necessitent une revue distincte.' }
