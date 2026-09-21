'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { createDomain, type DomainInput } from '@/lib/domains'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'

export function InitializationClientStep({ onContinue }: { onContinue: (id: string) => void }) {
  const { domains, activeDomain, isPlatformAdmin, switchDomain, refresh } = useAuth()
  const [selected, setSelected] = useState(activeDomain?.domain_id || '')
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState('')
  const creationCode = useRef('')
  const [form, setForm] = useState({ name: '', legal_name: '', city: '', address: '', region: '', country: 'Maroc' })
  useEffect(() => { if (activeDomain && !selected) setSelected(activeDomain.domain_id) }, [activeDomain, selected])
  async function proceed() {
    if (!domains.some(d => d.domain_id === selected)) return
    setBusy(true); setError('')
    try { if (selected !== activeDomain?.domain_id) await switchDomain(selected); onContinue(selected) }
    catch (e: any) { setError(e.message || 'Sélection impossible') }
    finally { setBusy(false) }
  }
  async function create() {
    if (!isPlatformAdmin || !form.name.trim() || created) return
    setBusy(true); setError('')
    try {
      // Reuse the same unique code if the network response is uncertain.
      if (!creationCode.current) creationCode.current = `DOM-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`
      const code = creationCode.current
      const input: DomainInput = { ...form, name: form.name.trim(), code, currency: 'MAD', timezone: 'Africa/Casablanca', locale: 'fr-MA', logo_url: '', is_active: true }
      const domain = await createDomain(input)
      // Remember a successful insert before refresh: a refresh failure must not create a second client.
      setCreated(domain.id); setSelected(domain.id); setMode('existing')
      await refresh()
    } catch (e: any) { setError(e.message || 'Création impossible. Vérifiez la liste des Domaines avant de réessayer.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-5 max-w-4xl">
    <PageHeader icon={Building2} title="Client FarmPilot" subtitle="Initialisation · étape 1" description="Choisissez la société à initialiser avant de préparer ses fermes et ses données." />
    <section className="rounded-xl border border-border bg-surface-raised p-5 space-y-5">
      <div className="flex gap-3 flex-wrap">
        <Button variant={mode === 'existing' ? 'primary' : 'secondary'} disabled={busy} onClick={() => setMode('existing')}>Client existant</Button>
        {isPlatformAdmin && <Button variant={mode === 'new' ? 'primary' : 'secondary'} disabled={busy || !!created} onClick={() => setMode('new')}>Nouveau client FarmPilot</Button>}
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {created && <p role="status" className="text-emerald-700">Le client a été créé dans les Domaines. Poursuivez pour préparer son dossier d’initialisation.</p>}
      {mode === 'existing' ? <>
        <label className="block text-sm">Client / société
          <select aria-label="Client FarmPilot à initialiser" value={selected} disabled={busy} onChange={e => setSelected(e.target.value)} className="mt-2 block w-full rounded-lg border border-border bg-surface-raised p-3">
            <option value="">Choisir un client</option>
            {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name} — {d.domain_code}</option>)}
          </select>
        </label>
        {!domains.length && <p>Aucun client accessible.{isPlatformAdmin ? ' Créez votre première société.' : ' Contactez un administrateur plateforme.'}</p>}
        <Button disabled={busy || !domains.some(d => d.domain_id === selected)} onClick={proceed}>Continuer avec ce client</Button>
        {created && !domains.some(d => d.domain_id === created) && <Button variant="secondary" onClick={async () => { setBusy(true); try { await refresh() } catch (e: any) { setError(e.message) } finally { setBusy(false) } }} disabled={busy}>Actualiser les accès</Button>}
      </> : <>
        <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-4">
          {([['name', 'Nom du client *'], ['legal_name', 'Raison sociale'], ['address', 'Adresse'], ['city', 'Ville'], ['region', 'Région'], ['country', 'Pays']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<input className="mt-1 block w-full rounded-lg border border-border bg-surface-raised p-3" value={form[key]} required={key === 'name'} maxLength={255} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>)}
        </fieldset>
        <p className="text-sm text-fg-secondary">Code généré automatiquement. Paramètres initiaux : MAD, français, fuseau Africa/Casablanca. Vous pourrez les modifier dans Administration → Domaines.</p>
        <p className="text-sm">Cette action crée réellement le client dans l’instance actuelle. Elle ne crée aucune ferme ni donnée de démonstration et ne modifie aucun autre client.</p>
        <Button disabled={busy || !form.name.trim() || !form.country.trim()} onClick={create}>{busy ? 'Création…' : 'Créer le client'}</Button>
      </>}
      {!isPlatformAdmin && <p className="text-caption text-fg-secondary">La création d’un client FarmPilot est réservée à l’administrateur plateforme.</p>}
    </section>
  </div>
}
