'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'
import { parseInfrastructureSnapshot, previewInfrastructureMigration, type InfrastructureSnapshot } from '@/lib/infrastructureMigrationPreview'
import { infrastructureMigrationWorkbook, readInfrastructureMigrationWorkbook } from '@/lib/infrastructureMigrationWorkbook'
import { downloadInitFile } from '@/lib/initializationWorkbook'

const labels = { create: 'À créer', reuse: 'À réutiliser', conflict: 'Conflit', blocked: 'Bloqué' } as const

export function InfrastructureMigrationAssistant({ domain, code, onBack }: {
  domain: string
  code: string
  onBack: () => void
}) {
  const [source, setSource] = useState<InfrastructureSnapshot | null>(null)
  const [preview, setPreview] = useState<ReturnType<typeof previewInfrastructureMigration> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function choose(file?: File) {
    setSource(null)
    setPreview(null)
    setError('')
    if (!file) return
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Le dossier dépasse 5 Mo.')
      setSource(file.name.toLowerCase().endsWith('.xlsx')
        ? await readInfrastructureMigrationWorkbook(await file.arrayBuffer())
        : parseInfrastructureSnapshot(JSON.parse((await file.text()).replace(/^\uFEFF/, ''))))
    } catch (error) {
      setError((error as Error).message)
    }
  }

  async function loadCompany() {
      const [farms, greenhouses] = await Promise.all([
        supabase.from('farms').select('code,name,city,country,total_area,is_active,manager_id,address,region,gps_lat,gps_lng,notes', { count: 'exact' })
          .eq('domain_id', domain).order('code'),
        supabase.from('greenhouses').select('code,name,type,status,total_area,exploitable_area,zone_id,length,width,height,commissioning_date,last_renovation_date,irrigation_type,heating_system,climate_control,notes,farms!inner(code,domain_id)', { count: 'exact' })
          .eq('farms.domain_id', domain).order('code'),
      ])
      if (farms.error || greenhouses.error) throw new Error(farms.error?.message ?? greenhouses.error?.message)
      if (farms.count !== farms.data?.length || greenhouses.count !== greenhouses.data?.length) {
        throw new Error('La comparaison dépasserait la limite de lecture. Divise le lot avant de continuer.')
      }
      return parseInfrastructureSnapshot({
        company_code: code,
        farms: farms.data.map(({ code, name, city, country, total_area, is_active, manager_id, ...attributes }) => ({
          code, name, city, country, area: total_area, active: is_active, manager_link: manager_id !== null, attributes,
        })),
        greenhouses: greenhouses.data.map(({ code, name, type, status, total_area, exploitable_area, zone_id, farms, ...attributes }) => {
          const farm = farms as unknown as { code: string }
          return { code, name, type, status, farm_code: farm.code, total: total_area, usable: exploitable_area,
            zone_link: zone_id !== null, attributes }
        }),
      })
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function downloadWorkbook(withData: boolean) {
    await run(async () => {
      const data = withData ? await loadCompany() : undefined
      const buffer = await infrastructureMigrationWorkbook(data)
      const file = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      downloadInitFile(file, withData ? `itrix-fermes-serres-${code}.xlsx` : 'itrix-modele-fermes-serres.xlsx')
    })
  }

  async function simulate() {
    if (!source) return
    setPreview(null)
    await run(async () => setPreview(previewInfrastructureMigration(source, await loadCompany())))
  }

  return <div className="space-y-md">
    <Button variant="secondary" onClick={onBack}>Retour aux modules</Button>
    <h1 className="text-xl font-semibold">Reprise des fermes et des serres</h1>
    <Card className="space-y-md">
      <div>
        <h2 className="font-semibold">1. Choisir le dossier source</h2>
        <p>Société cible · {code}</p>
        <div className="my-sm flex flex-wrap gap-sm">
          <Button variant="secondary" disabled={busy} onClick={() => void downloadWorkbook(false)}>Télécharger le modèle Excel</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void downloadWorkbook(true)}>Exporter cette société en Excel</Button>
        </div>
        <label className="block mt-sm">Dossier de reprise Excel ou JSON
          <input className="block mt-xs" type="file" accept=".xlsx,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json" disabled={busy} onChange={e => void choose(e.target.files?.[0])} />
        </label>
        {source && <p className="mt-sm">Source · {source.company_code} · {source.farms.length} ferme(s) · {source.greenhouses.length} serre(s)</p>}
      </div>
      <div>
        <h2 className="font-semibold mb-sm">2. Comparer les données</h2>
        <Button loading={busy} disabled={!source} onClick={() => void simulate()}>Simuler la reprise</Button>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {preview && <section className="space-y-sm" aria-live="polite">
        <h2 className="font-semibold">3. Aperçu · {preview.source} → {preview.target}</h2>
        <p>Aucune fiche n’a été modifiée.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead><tr><th>Code</th><th>Nom</th><th>Action proposée</th><th>Écart ou dépendance</th></tr></thead>
            <tbody>{[...preview.farms, ...preview.greenhouses].map(row => <tr key={row.key} className="border-b border-border">
              <td className="py-sm">{row.key}</td><td>{row.name}</td><td>{labels[row.action]}</td><td>{row.differences.join(', ') || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>}
    </Card>
  </div>
}
