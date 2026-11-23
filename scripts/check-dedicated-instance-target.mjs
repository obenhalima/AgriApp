import { readFile } from 'node:fs/promises'

const demoRef = 'dlisonvsphybjiyxoymk'
const demoPreviewRef = 'jxqcvhgmuskesopprqos'
const projectRefPattern = /^[a-z0-9]{20}$/
const vercelProjectPattern = /^[a-z0-9][a-z0-9._-]*$/

try {
  const [, , manifestFile, expectedRef, expectedVercelProject] = process.argv
  if (!manifestFile || !expectedRef || !expectedVercelProject) {
    throw new Error('Usage : node scripts/check-dedicated-instance-target.mjs <manifeste> <ref Supabase cible> <projet Vercel cible>')
  }

  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  if (!projectRefPattern.test(manifest.targetProjectRef) || manifest.targetProjectRef !== expectedRef) {
    throw new Error('La référence cible doit correspondre au projet Supabase dédié confirmé.')
  }
  if ([demoRef, demoPreviewRef, manifest.sourceProjectRef].includes(manifest.targetProjectRef)) {
    throw new Error('La cible est un environnement source ou de démonstration.')
  }
  if (manifest.targetSupabaseUrl !== `https://${expectedRef}.supabase.co`) {
    throw new Error('L’URL Supabase doit correspondre à la référence cible.')
  }
  if (!vercelProjectPattern.test(manifest.vercelProject) || manifest.vercelProject === 'agri-app'
      || manifest.vercelProject !== expectedVercelProject) {
    throw new Error('Le nom doit correspondre au projet Vercel dédié confirmé.')
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.applicationCommit)) {
    throw new Error('Le manifeste doit référencer un commit Git complet.')
  }

  console.log(`Cible déclarée : ${manifest.vercelProject} / ${manifest.targetProjectRef}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
