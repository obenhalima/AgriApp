import { readFile } from 'node:fs/promises'

const packageFiles = [
  ['schéma SQL neutre', 'deployment/dedicated-installation/schema.sql'],
  ['socle initial', 'deployment/dedicated-installation/reference-seed.sql'],
  ['catalogue général', 'deployment/dedicated-installation/catalog-seed.sql'],
  ['chargement du référentiel partagé', 'deployment/dedicated-installation/shared-reference-bootstrap.sql'],
  ['raccordement de la création de société', 'deployment/dedicated-installation/first-company.sql'],
  ['contrôle des prérequis par module', 'deployment/dedicated-installation/module-readiness.sql'],
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
  const statusFile = new URL('../deployment/dedicated-installation/package-status.json', import.meta.url)
  let status
  try {
    status = JSON.parse(await readFile(statusFile, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (status?.validated !== true) {
    console.error('Les fichiers sont présents. Le paquet est encore en validation.')
    for (const item of status?.pending || []) console.error(`- ${item}`)
    process.exitCode = 1
  } else {
    console.log('Les fichiers du paquet sont présents et le paquet est déclaré validé.')
  }
}
