param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef)
$ErrorActionPreference = 'Stop'

function Read-TelegramSecret([string]$Prompt) {
  $telegramSecureValue = Read-Host $Prompt -AsSecureString
  $telegramPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($telegramSecureValue)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($telegramPointer) }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($telegramPointer)
    $telegramSecureValue.Dispose()
  }
}

$telegramToken = $null
$telegramSecret = $null
$telegramBody = $null
try {
  $telegramToken = Read-TelegramSecret 'Jeton BotFather (saisie masquee)'
  $telegramSecret = Read-TelegramSecret 'TELEGRAM_WEBHOOK_SECRET deja configure dans Supabase'
  if ($telegramToken -notmatch '^\d+:[A-Za-z0-9_-]+$' -or $telegramSecret -notmatch '^[A-Za-z0-9_-]{32,256}$') {
    throw 'Format invalide'
  }
  $telegramBase = 'https://api.telegram.org/bot' + $telegramToken
  $telegramBot = Invoke-RestMethod -Uri ($telegramBase + '/getMe') -Method Post -TimeoutSec 20
  if (-not $telegramBot.ok) { throw 'Identification impossible' }
  Write-Host ('Bot identifie : @' + $telegramBot.result.username)
  Write-Host ('Projet cible : ' + $ProjectRef)
  $telegramConfirm = Read-Host 'SQL 113 applique et les DEUX fonctions securisees deployees ? Taper OUI pour remplacer le webhook'
  if ($telegramConfirm -cne 'OUI') { Write-Host 'Annule. Aucun webhook modifie.'; return }
  $telegramUrl = 'https://' + $ProjectRef + '.supabase.co/functions/v1/telegram-webhook'
  $telegramBody = @{
    url = $telegramUrl
    secret_token = $telegramSecret
    allowed_updates = @('message', 'callback_query')
    drop_pending_updates = $false
  } | ConvertTo-Json -Compress
  $telegramResult = Invoke-RestMethod -Uri ($telegramBase + '/setWebhook') -Method Post -ContentType 'application/json' -Body $telegramBody -TimeoutSec 20
  if (-not $telegramResult.ok) { throw 'Configuration refusee' }
  $telegramInfo = Invoke-RestMethod -Uri ($telegramBase + '/getWebhookInfo') -Method Post -TimeoutSec 20
  if (-not $telegramInfo.ok -or $telegramInfo.result.url -cne $telegramUrl) { throw 'Verification incomplete' }
  Write-Host 'Webhook configure. Cela ne prouve pas encore la livraison des messages.'
  Write-Host ('Messages en attente : ' + $telegramInfo.result.pending_update_count)
  Write-Host ('Erreur de livraison signalee : ' + [bool]$telegramInfo.result.last_error_message)
  Write-Host 'Activer TELEGRAM_PILOT_ENABLED=true dans Supabase puis tester une invitation et /statut.'
} catch {
  # Ne pas imprimer l'exception : son URL peut contenir le jeton Telegram.
  Write-Warning 'Configuration non confirmee. Verifier jeton, secret, reseau et projet. En cas de timeout, le webhook peut avoir ete configure : relancer avec les memes valeurs.'
  exit 1
} finally {
  $telegramToken = $null
  $telegramSecret = $null
  $telegramBase = $null
  $telegramBody = $null
}
