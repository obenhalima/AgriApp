import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { stdin, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const manifestPath = process.argv[2] || 'deployment/domaine-benhalima-recette.json'
const manifest = JSON.parse(await readFile(new URL(manifestPath, root), 'utf8'))
const { targetProjectRef: ref, targetSupabaseUrl: apiUrl, vercelProject: project, applicationCommit: commit } = manifest
const targetCheck = spawnSync(process.execPath, [
  'scripts/check-dedicated-instance-target.mjs', manifestPath, ref, project,
], { cwd: fileURLToPath(root), stdio: 'inherit' })
if (targetCheck.status !== 0) process.exit(1)

const scope = manifest.vercelScope
if (!/^[a-z0-9][a-z0-9-]*$/.test(scope || '')) {
  console.error('Renseigne vercelScope dans le manifeste avec le slug de ton équipe Vercel.')
  process.exit(1)
}

const supabase = `https://supabase.com/dashboard/project/${ref}`
const vercel = `https://vercel.com/${scope}/${project}`
const progressDirectory = new URL('../tmp/', import.meta.url)
const progressFile = new URL(`installation-${ref}.json`, progressDirectory)
const installation = { ref, project, scope, commit }
const steps = [
  {
    title: 'Vérifier les projets et le manifeste',
    lines: [
      `Fichier à configurer : ${manifestPath}`,
      `Vérifie le projet, sa région et son organisation : ${supabase}`,
      `Vérifie l’équipe et le projet Vercel : ${vercel}`,
      `Vérifie que le commit de départ est publié sur le dépôt GitHub privé : ${commit}`,
    ],
  },
  {
    title: 'Configurer la connexion de l’application',
    lines: [
      `Dans Supabase → Project Settings → API Keys : ${supabase}/settings/api-keys`,
      'Dans Legacy API Keys, copie la clé anon et, pour les routes serveur qui l’exigent, la clé service_role.',
      `Dans Vercel → Settings → Environment Variables : ${vercel}/settings/environment-variables`,
      `NEXT_PUBLIC_SUPABASE_URL = ${apiUrl}`,
      'NEXT_PUBLIC_SUPABASE_ANON_KEY = la clé anon du projet cible.',
      'SUPABASE_SERVICE_ROLE_KEY = la clé service_role du projet cible. Variable serveur uniquement.',
      'Pour une recette isolée, sélectionne l’environnement qui servira son URL dans ce projet Vercel dédié.',
      'Saisis les clés directement dans Vercel. L’assistant enregistre seulement la progression.',
    ],
  },
  {
    title: 'Vérifier le paquet SQL d’installation',
    lines: [
      'Dossier à préparer : deployment/dedicated-installation/.',
      'Fichiers attendus : schema.sql, reference-seed.sql et catalog-seed.sql.',
      'Le contrôle liste les fichiers manquants. Le paquet devra ensuite être validé sur une base jetable.',
    ],
    check: () => spawnSync(process.execPath, ['scripts/check-dedicated-installation-package.mjs'], {
      cwd: fileURLToPath(root), stdio: 'inherit',
    }).status === 0,
  },
  {
    title: 'Installer Supabase et activer le super-admin',
    lines: [
      `Connexion de la base : ouvre Connect depuis ${supabase}`,
      `Mot de passe de la base : ${supabase}/settings/database`,
      `Compte super-admin : ${supabase}/auth/users`,
      'Le paquet validé doit installer le schéma, les politiques Storage, les fonctions nécessaires et les référentiels.',
      'Après création et confirmation du compte Auth, le script deployment/bootstrap-first-platform-admin.sql utilise son UUID.',
      'Cette étape attend le socle testé et son exécuteur. Aucune commande distante n’est lancée ici.',
    ],
    check: () => false,
  },
  {
    title: 'Déployer et vérifier la recette',
    lines: [
      `Vérifie le déploiement dans ${vercel}`,
      'Déployer le commit validé avec les variables du projet cible, puis vérifier la connexion et l’assistant de première société.',
    ],
    check: () => false,
  },
]

let step = 0
try {
  const saved = JSON.parse(await readFile(progressFile, 'utf8'))
  if (Object.keys(installation).every(key => installation[key] === saved[key])
      && Number.isInteger(saved.step) && saved.step >= 0 && saved.step < steps.length) {
    step = saved.step
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

async function saveProgress() {
  await mkdir(progressDirectory, { recursive: true })
  await writeFile(progressFile, JSON.stringify({ ...installation, step }, null, 2) + '\n')
}

const input = createInterface({ input: stdin, terminal: false })
const answers = input[Symbol.asyncIterator]()
try {
  console.log(`\nInstallation ItriX Farm · ${manifest.name}`)
  while (step < steps.length) {
    const current = steps[step]
    console.log(`\nÉtape ${step + 1}/${steps.length} · ${current.title}`)
    for (const line of current.lines) console.log(`  ${line}`)
    stdout.write('\n[Entrée] Suivant / vérifier    [p] Précédent    [q] Enregistrer et quitter\n> ')
    const answer = await answers.next()
    if (answer.done || answer.value.trim().toLowerCase() === 'q') {
      await saveProgress()
      break
    }
    const command = answer.value.trim().toLowerCase()
    if (command === 'p') {
      step = Math.max(0, step - 1)
    } else if (command === '') {
      if (current.check && !current.check()) {
        console.log('Étape en attente. La progression reste à cette étape.')
        await saveProgress()
        process.exitCode = 1
        break
      }
      step++
    } else {
      console.log('Choisis Entrée, p ou q.')
      continue
    }
    await saveProgress()
  }
  console.log(`\nProgression locale : ${fileURLToPath(progressFile)}`)
} finally {
  input.close()
}
