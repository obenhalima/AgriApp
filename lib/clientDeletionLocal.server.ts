import {lstat, readdir, readFile, realpath, rm} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {localVault, protectLocal, type LocalConnection} from './docIndexLocal.server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function clientDirectory(domain: string) {
  if (!uuid.test(domain)) throw Error('Client invalide')
  const root = path.resolve(process.cwd(), 'tmp', 'purchase-invoices-private')
  const dir = path.resolve(root, domain.toLowerCase())
  if (path.dirname(dir) !== root) throw Error('Dossier client invalide')
  try {
    const info = await lstat(dir)
    if (!info.isDirectory() || info.isSymbolicLink() || path.dirname(await realpath(dir)) !== await realpath(root)) throw Error('Dossier client non sécurisé')
    return dir
  } catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error}
}

export async function inspectClientLocalData(domain: string) {
  const dir = await clientDirectory(domain)
  const entries: string[] = []
  async function walk(folder: string) {
    for (const name of await readdir(folder)) {
      const file = path.join(folder, name), info = await lstat(file)
      if (info.isSymbolicLink()) throw Error('Lien symbolique dans les documents du client')
      if (info.isDirectory()) await walk(file)
      else if (info.isFile()) entries.push(`${path.relative(dir!, file)}:${info.size}:${info.mtimeMs}`)
    }
  }
  if (dir) await walk(dir)
  const vaultFile = path.join(process.cwd(), 'tmp', 'docindex-local-private', 'vault.dpapi')
  let connections: [string, LocalConnection][] = []
  try {
    const vault = JSON.parse(await protectLocal(await readFile(vaultFile, 'utf8'), true)) as Record<string, LocalConnection>
    connections = Object.entries(vault).filter(([, item]) => item.domain.toLowerCase() === domain.toLowerCase()).sort(([a], [b]) => a.localeCompare(b))
  } catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error}
  return {files: entries.length, connections: connections.length,
    fingerprint: createHash('sha256').update(JSON.stringify([entries.sort(), connections])).digest('hex')}
}

export async function clearClientLocalData(domain: string) {
  const dir = await clientDirectory(domain)
  if (dir) {
    // Inspect every descendant before the recursive operation, rejecting symlinks.
    await inspectClientLocalData(domain)
    await rm(dir, {recursive: true, force: true})
  }
  try {
    await lstat(path.join(process.cwd(), 'tmp', 'docindex-local-private', 'vault.dpapi'))
    await localVault(async vault => {
      for (const [key, item] of Object.entries(vault)) if (item.domain.toLowerCase() === domain.toLowerCase()) delete vault[key]
    })
  } catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error}
}
