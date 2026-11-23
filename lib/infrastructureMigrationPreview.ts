type Farm = {
  code: string
  name: string
  city: string | null
  country: string | null
  area: number | null
  active: boolean | null
  manager_link: boolean
  attributes?: Record<string, unknown>
}
type Greenhouse = {
  farm_code: string
  code: string
  name: string
  type: string
  status: string
  total: number
  usable: number
  zone_link: boolean
  attributes?: Record<string, unknown>
}
export type InfrastructureSnapshot = {
  company_code: string
  farms: Farm[]
  greenhouses: Greenhouse[]
}
type Action = 'create' | 'reuse' | 'conflict' | 'blocked'
type Decision = { key: string; name: string; action: Action; differences: string[] }
const normalize = (code: string) => code.trim().toUpperCase()
const greenhouseKey = (row: Greenhouse) => JSON.stringify([normalize(row.farm_code), normalize(row.code)])
const farmFields = ['name', 'city', 'country', 'area', 'active', 'attributes'] as const
const greenhouseFields = ['name', 'type', 'status', 'total', 'usable', 'attributes'] as const

function canonical(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return JSON.stringify(value.map(canonical))
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return JSON.stringify(Object.keys(record).sort().map(key => [key, canonical(record[key])]))
  }
  return JSON.stringify(value)
}

function match<T>(source: T, target: T | undefined, fields: readonly (keyof T)[]) {
  return target ? fields.filter(field => canonical(source[field]) !== canonical(target[field])).map(String) : []
}

function index<T>(rows: T[], keyFor: (row: T) => string, label: string) {
  const entries = new Map<string, T>()
  for (const row of rows) {
    const key = keyFor(row)
    if (!key || entries.has(key)) throw new Error(`Identifiant manquant ou en double dans ${label} : ${key}`)
    entries.set(key, row)
  }
  return entries
}

export function parseInfrastructureSnapshot(input: unknown): InfrastructureSnapshot {
  if (!input || typeof input !== 'object') throw new Error('Fichier de reprise invalide.')
  const snapshot = input as InfrastructureSnapshot
  const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  if (!text(snapshot.company_code) || !Array.isArray(snapshot.farms) || !Array.isArray(snapshot.greenhouses)) {
    throw new Error('Le dossier doit contenir le code société, les fermes et les serres.')
  }
  for (const farm of snapshot.farms) {
    if (!farm || !text(farm.code) || !text(farm.name) || typeof farm.manager_link !== 'boolean' ||
        (farm.area !== null && (!Number.isFinite(farm.area) || farm.area < 0))) {
      throw new Error('Ferme invalide : code, nom, surface et état du rattachement requis.')
    }
  }
  for (const greenhouse of snapshot.greenhouses) {
    if (!greenhouse || !text(greenhouse.code) || !text(greenhouse.farm_code) || !text(greenhouse.name)
        || !text(greenhouse.type) || !text(greenhouse.status) || typeof greenhouse.zone_link !== 'boolean'
        || !Number.isFinite(greenhouse.total) || !Number.isFinite(greenhouse.usable)
        || greenhouse.total <= 0 || greenhouse.usable < 0 || greenhouse.usable > greenhouse.total) {
      throw new Error('Serre invalide : ferme, code, nom, statut et surfaces cohérentes requis.')
    }
  }
  return snapshot
}

export function previewInfrastructureMigration(source: InfrastructureSnapshot, target: InfrastructureSnapshot) {
  index(source.farms, row => normalize(row.code), 'les fermes source')
  index(source.greenhouses, greenhouseKey, 'les serres source')
  const targetFarms = index(target.farms, row => normalize(row.code), 'les fermes cible')
  const targetGreenhouses = index(target.greenhouses, greenhouseKey, 'les serres cible')

  const farms = source.farms.map((row): Decision => {
    const target = targetFarms.get(normalize(row.code))
    const differences = match(row, target, farmFields)
    if (row.manager_link) return { key: row.code, name: row.name, action: 'blocked', differences: ['Responsable à remapper'] }
    return { key: row.code, name: row.name, action: differences.length ? 'conflict' : target ? 'reuse' : 'create', differences }
  })
  const farmsByCode = new Map(farms.map(row => [normalize(row.key), row]))
  const greenhouses = source.greenhouses.map((row) => {
    const farm = farmsByCode.get(normalize(row.farm_code))
    const target = targetGreenhouses.get(greenhouseKey(row))
    const blockedBy = !farm || (farm.action !== 'reuse' && farm.action !== 'create')
      ? 'Ferme à résoudre' : row.zone_link ? 'Zone à remapper' : null
    const differences = blockedBy ? [blockedBy] : match(row, target, greenhouseFields)
    const action: Action = blockedBy ? 'blocked' : differences.length ? 'conflict' : target ? 'reuse' : 'create'
    return { key: `${row.farm_code}/${row.code}`, name: row.name, action, differences,
      farm: row.farm_code, type: row.type, status: row.status, total: row.total, usable: row.usable }
  })
  return { source: source.company_code, target: target.company_code, farms, greenhouses }
}
