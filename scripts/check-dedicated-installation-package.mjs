import { readFile } from 'node:fs/promises'

const packageFiles = [
  ['schéma SQL neutre', 'deployment/dedicated-installation/schema.sql'],
  ['socle initial', 'deployment/dedicated-installation/reference-seed.sql'],
  ['catalogue général', 'deployment/dedicated-installation/catalog-seed.sql'],
]

const missing = []
for (const [label, file] of packageFiles) {
  try {
    const contents = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    if (!contents.trim()) missing.push(`${label} (${file} est vide)`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    missing.push(`${label} (${file} est absent)`)
  }
}

if (missing.length) {
  console.error('Paquet d’installation incomplet :')
  for (const item of missing) console.error(`- ${item}`)
  process.exitCode = 1
} else {
  console.log('Les trois fichiers du paquet sont présents. Leur exécution sur une base jetable reste à valider.')
}
