import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const manifestPath = process.argv[2] || 'deployment/domaine-benhalima-recette.json'
const manifest = JSON.parse(await readFile(new URL(manifestPath, root), 'utf8'))
const { targetProjectRef, targetSupabaseUrl, vercelProject } = manifest
const options = { cwd: fileURLToPath(root), stdio: 'inherit' }
const target = spawnSync(process.execPath, [
  'scripts/check-dedicated-instance-target.mjs', manifestPath, targetProjectRef, vercelProject,
], options)
if (target.status !== 0) process.exit(1)

const name = 'admin-create-user'
const endpoint = new URL(`/functions/v1/${name}`, targetSupabaseUrl)
const deployment = spawnSync('supabase', [
  'functions', 'deploy', name, '--project-ref', targetProjectRef, '--use-api',
], options)
if (deployment.status !== 0) {
  console.error(deployment.error?.message || 'Vérifie la connexion CLI Supabase et les droits sur le projet cible.')
  process.exit(1)
}

try {
  const optionsResponse = await fetch(endpoint, { method: 'OPTIONS', signal: AbortSignal.timeout(15000) })
  const anonymousResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15000),
  })
  if (!optionsResponse.ok || anonymousResponse.status !== 401) {
    throw new Error(`OPTIONS ${optionsResponse.status}, POST anonyme ${anonymousResponse.status}`)
  }
  console.log(`Création d’utilisateurs disponible sur ${targetProjectRef}. Les appels anonymes sont refusés.`)
} catch (error) {
  console.error(`Contrôle de la création d’utilisateurs en échec · ${error.message}`)
  process.exitCode = 1
}
