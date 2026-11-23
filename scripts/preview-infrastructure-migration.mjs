import { readFile } from 'node:fs/promises'
import { parseInfrastructureSnapshot, previewInfrastructureMigration } from '../lib/infrastructureMigrationPreview.ts'

const [, , sourcePath, targetPath] = process.argv
if (!sourcePath || !targetPath) {
  console.error('Usage : node --experimental-strip-types scripts/preview-infrastructure-migration.mjs source.json cible.json')
  process.exit(1)
}
try {
  const read = async path => parseInfrastructureSnapshot(JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')))
  const [source, target] = await Promise.all([read(sourcePath), read(targetPath)])
  console.log(JSON.stringify(previewInfrastructureMigration(source, target), null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
