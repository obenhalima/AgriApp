'use client'
import {useLanguage} from '@/lib/i18n'


import { useEffect, useRef, useState } from 'react'
import { Building2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { createDomain, type DomainInput } from '@/lib/domains'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'

export function InitializationClientStep({ onContinue }: { onContinue: (id: string) => void }) {
 const {t:_ui,text:_uiNode}=useLanguage()

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
    <PageHeader icon={Building2} title={_ui("Client ItriX Farm")} subtitle={_ui("Choisir ou reprendre un dossier")} description={_ui("Choisissez le client pour ouvrir son brouillon sauvegardé ou préparer un nouveau dossier. Aucun dossier d’un autre client n’est remplacé.")} />
    <section className="rounded-xl border border-border bg-surface-raised p-5 space-y-5">
      <div className="flex gap-3 flex-wrap">
        <Button variant={mode === 'existing' ? 'primary' : 'secondary'} disabled={busy} onClick={() => setMode('existing')}>{_ui("Client existant")}</Button>
        {isPlatformAdmin && <Button variant={mode === 'new' ? 'primary' : 'secondary'} disabled={busy || !!created} onClick={() => setMode('new')}>{_ui("Nouveau client ItriX Farm")}</Button>}
      </div>
      {error && <p role="alert" className="text-red-700">{_uiNode(error)}</p>}
      {created && <p role="status" className="text-emerald-700">{_ui("Le client et ses cultures par défaut ont été créés. Poursuivez pour préparer son dossier d’initialisation.")}</p>}
      {mode === 'existing' ? <>
        <label className="block text-sm">{_ui("Client / société")}{" "}<select aria-label={_ui("Client ItriX Farm à initialiser")} value={selected} disabled={busy} onChange={e => setSelected(e.target.value)} className="mt-2 block w-full rounded-lg border border-border bg-surface-raised p-3">
            <option value="">{_ui("Choisir un client")}</option>
            {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name} — {d.domain_code}</option>)}
          </select>
        </label>
        {!domains.length && <p>{_ui("Aucun client accessible.")}{isPlatformAdmin ? _ui("Créez votre première société.") : _ui("Contactez un administrateur plateforme.")}</p>}
        <Button disabled={busy || !domains.some(d => d.domain_id === selected)} onClick={proceed}>{_ui("Continuer avec ce client")}</Button>
        {created && !domains.some(d => d.domain_id === created) && <Button variant="secondary" onClick={async () => { setBusy(true); try { await refresh() } catch (e: any) { setError(e.message) } finally { setBusy(false) } }} disabled={busy}>{_ui("Actualiser les accès")}</Button>}
      </> : <>
        <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-4">
          {([['name', _ui("Nom du client *")], ['legal_name', _ui("Raison sociale")], ['address', _ui("Adresse")], ['city', _ui("Ville")], ['region', _ui("Région")], ['country', _ui("Pays")]] as const).map(([key, label]) => <label key={key} className="text-sm">{_uiNode(label)}<input className="mt-1 block w-full rounded-lg border border-border bg-surface-raised p-3" value={form[key]} required={key === 'name'} maxLength={255} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>)}
        </fieldset>
        <p className="text-sm text-fg-secondary">{_ui("Code généré automatiquement. Paramètres initiaux : MAD, français, fuseau Africa/Casablanca. Vous pourrez les modifier dans Administration → Domaines.")}</p>
        <p className="text-sm">{_ui("Cette action crée le client et ses propres copies des cultures par défaut. Aucune variété, ferme ou donnée de démonstration n’est créée. Aucun autre client n’est modifié.")}</p>
        <Button disabled={busy || !form.name.trim() || !form.country.trim()} onClick={create}>{busy ? _ui("Création…") : _ui("Créer le client")}</Button>
      </>}
      {!isPlatformAdmin && <p className="text-caption text-fg-secondary">{_ui("La création d’un client ItriX Farm est réservée à l’administrateur plateforme.")}</p>}
    </section>
  </div>
}
