import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

try {
  const [, , directory, expectedVersion, expectedCommit] = process.argv
  if (!directory || !expectedVersion || !/^[a-f0-9]{40}$/.test(expectedCommit || '')) {
    throw new Error('Usage : node scripts/check-dedicated-release.mjs <dossier> <version> <commit complet>')
  }
  const manifest = JSON.parse(await readFile(join(directory, 'installation-release.json'), 'utf8'))
  if (manifest.format !== 1 || manifest.version !== expectedVersion || manifest.commit !== expectedCommit
      || manifest.validated !== true || manifest.archive !== 'itrix-installation.tar.gz'
      || !/^[a-f0-9]{64}$/.test(manifest.sha256 || '')) {
    throw new Error('Le manifeste ne correspond pas à une archive validée pour cette version et ce commit.')
  }
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(join(directory, manifest.archive))) {
    hash.update(chunk)
    bytes += chunk.length
  }
  if (!bytes || hash.digest('hex') !== manifest.sha256) throw new Error('L’archive est vide ou son empreinte SHA-256 diffère.')
  console.log(`Archive contrôlée · ${manifest.version} · ${manifest.commit} · ${bytes} octets`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
