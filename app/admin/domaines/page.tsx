'use client'
import {useLanguage} from '@/lib/i18n'


import { useEffect, useMemo, useState } from 'react'
import { Building2, Globe2, Lock, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { createDomain, listDomains, updateDomain, type Domain, type DomainInput } from '@/lib/domains'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'

type DeletionPreview = {
  code: string
  fingerprint: string
  tables: { table: string; count: number }[]
  total: number
  files: number
  accounts_to_deactivate: number
  local: { files: number; connections: number; fingerprint: string }
}

type PendingDeletion = { job_id: string; client_id: string; client_code: string; fingerprint: string }

async function deletionApi<T>(query: string, body?: object): Promise<T> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Connexion requise')
  const response = await fetch('/api/admin/client-deletion' + query, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}

const EMPTY: DomainInput = {
  code: '', name: '', legal_name: '', address: '', city: '', region: '',
  country: 'Maroc', currency: 'MAD', timezone: 'Africa/Casablanca',
  locale: 'fr-MA', logo_url: '', is_active: true,
}

export default function DomainsAdminPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { isPlatformAdmin, activeDomain, refresh, loading: authLoading } = useAuth()
  const [items, setItems] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Domain | 'new' | null>(null)
  const [form, setForm] = useState<DomainInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<{ domain: Domain; request: string } | null>(null)
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [deletionError, setDeletionError] = useState('')
  const [deletionBusy, setDeletionBusy] = useState(false)
  const [pending, setPending] = useState<PendingDeletion[]>([])

  const loadPending = async () => {
    setPending(await deletionApi<PendingDeletion[]>('?action=pending'))
  }

  const load = async () => {
    if (!isPlatformAdmin) { setLoading(false); return }
    try { setLoading(true); setItems(await listDomains()) }
    catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (authLoading) return
    void load()
    if (isPlatformAdmin) void loadPending().catch(() => {})
  }, [authLoading, isPlatformAdmin])

  const openDeletion = async (domain: Domain) => {
    setDeleting({ domain, request: crypto.randomUUID() })
    setPreview(null)
    setConfirmation('')
    setDeletionError('')
    setDeletionBusy(true)
    try {
      setPreview(await deletionApi<DeletionPreview>('?domain=' + domain.id))
    } catch (error) {
      setDeletionError((error as Error).message)
    } finally {
      setDeletionBusy(false)
    }
  }

  const runDeletion = async (job?: PendingDeletion) => {
    if (!job && (!deleting || !preview || confirmation !== preview.code)) return
    const body = job
      ? { domain: job.client_id, request: job.job_id, code: job.client_code, fingerprint: job.fingerprint }
      : { domain: deleting!.domain.id, request: deleting!.request, code: confirmation,
          fingerprint: preview!.fingerprint, localFingerprint: preview!.local.fingerprint }
    setDeletionBusy(true)
    setDeletionError('')
    try {
      const result = await deletionApi<{ status: 'complete' | 'files_pending'; message?: string }>('', body)
      setDeleting(null)
      setItems(current => current.filter(domain => domain.id !== body.domain))
      setPending(current => [
        ...current.filter(entry => entry.job_id !== body.request),
        ...(result.status === 'files_pending' ? [{
          job_id: body.request, client_id: body.domain, client_code: body.code, fingerprint: body.fingerprint,
        }] : []),
      ])
      if (result.status === 'complete') toast.success(_ui('Client supprimé'))
      else toast.warning(result.message || _ui('Nettoyage des fichiers à reprendre'))
      if (activeDomain?.domain_id === body.domain) void refresh()
    } catch (error) {
      const message = (error as Error).message
      if (job) toast.error(message)
      else setDeletionError(message)
    } finally {
      setDeletionBusy(false)
    }
  }

  const stats = useMemo(() => ({
    active: items.filter(d => d.is_active).length,
    countries: new Set(items.map(d => d.country)).size,
  }), [items])

  const openNew = () => { setForm({ ...EMPTY }); setEditing('new') }
  const openEdit = (d: Domain) => {
    setForm({
      code: d.code, name: d.name, legal_name: d.legal_name ?? '', address: d.address ?? '',
      city: d.city ?? '', region: d.region ?? '', country: d.country, currency: d.currency,
      timezone: d.timezone, locale: d.locale, logo_url: d.logo_url ?? '', is_active: d.is_active,
    })
    setEditing(d)
  }
  const set = (key: keyof DomainInput, value: string | boolean) => setForm(f => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return
    setSaving(true)
    try {
      if (editing === 'new') await createDomain(form)
      else if (editing) await updateDomain(editing.id, form)
      toast.success(editing === 'new' ? _ui("Client / Société créé") : _ui("Client / Société modifié"))
      setEditing(null)
      await load()
    } catch (e: any) {
      const msg = e?.code === '23505' ? 'Ce code de société existe déjà.' : e.message
      toast.error(msg)
    } finally { setSaving(false) }
  }

  if (authLoading) return <div className="space-y-md"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>
  if (!isPlatformAdmin) return <EmptyState icon={Lock} title={_ui("Accès réservé au super-administrateur plateforme")} />

  return (
    <div>
      <PageHeader
        title={_ui("Clients / Sociétés")} subtitle={_ui("Administration plateforme")} icon={Globe2} iconColor="#8b5cf6"
        description={_ui("{v0} client{v1} ItriX Farm",{v0:String(items.length),v1:String(items.length > 1 ? 's' : '')})}
        actions={<Button onClick={openNew}><Plus size={14} /> {" "}{_ui("Nouvelle société")}</Button>}
        stats={loading ? [] : [
          { label: 'Total', value: String(items.length), icon: Globe2, color: '#8b5cf6' },
          { label: 'Actifs', value: String(stats.active), icon: ShieldCheck, color: '#10b981' },
          { label: 'Pays', value: String(stats.countries), icon: Building2, color: '#3b82f6' },
        ]}
      />

      {pending.length > 0 && (
        <Card className="mb-md space-y-sm">
          <h2 className="font-semibold">{_ui('Nettoyages à reprendre')}</h2>
          {pending.map(job => (
            <div key={job.job_id} className="flex items-center justify-between gap-sm">
              <span className="font-mono">{job.client_code}</span>
              <Button variant="secondary" size="sm" disabled={deletionBusy} onClick={() => runDeletion(job)}>
                {_ui('Reprendre le nettoyage')}
              </Button>
            </div>
          ))}
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">{[1,2,3].map(i => <Skeleton key={i} className="h-52" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Globe2} title={_ui("Aucun client / société")} action={<Button onClick={openNew}>{_ui("Créer la première société")}</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
          {items.map(d => (
            <Card key={d.id} className={!d.is_active ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between gap-sm mb-md">
                <div>
                  <div className="font-display text-heading font-bold text-fg-primary">{d.name}</div>
                  <div className="font-mono text-caption text-fg-tertiary">{d.code}</div>
                </div>
                <Badge variant={d.is_active ? 'success' : 'default'} size="sm">{d.is_active ? _ui("Actif") : _ui("Inactif")}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-sm text-body-sm mb-md">
                <div><span className="text-fg-tertiary">{_ui("Pays")}</span><div className="font-semibold">{d.country}</div></div>
                <div><span className="text-fg-tertiary">{_ui("Devise")}</span><div className="font-semibold">{d.currency}</div></div>
                <div><span className="text-fg-tertiary">{_ui("Fuseau")}</span><div className="font-semibold truncate">{d.timezone}</div></div>
                <div><span className="text-fg-tertiary">{_ui("Langue")}</span><div className="font-semibold">{d.locale}</div></div>
              </div>
              <div className="flex flex-wrap gap-sm">
                <Button variant="secondary" size="sm" onClick={() => openEdit(d)} className="flex-1"><Pencil size={12} /> {_ui("Modifier")}</Button>
                <Button variant="destructive" size="sm" disabled={deletionBusy} onClick={() => openDeletion(d)}>
                  <Trash2 size={12} /> {_ui('Supprimer')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleting && (
        <Modal title={_ui('Supprimer {v0}', { v0: deleting.domain.name })}
          onClose={() => { if (!deletionBusy) setDeleting(null) }} size="lg">
          <div className="space-y-md">
            {deletionError && <p role="alert" className="text-danger">{deletionError}</p>}
            {deletionBusy && !preview && <p role="status">{_ui('Calcul des données à supprimer…')}</p>}
            {preview && (
              <>
                <p className="text-danger">{_ui('Cette suppression est définitive.')}</p>
                <p>{_ui('{v0} lignes en base, {v1} fichiers Storage, {v2} fichiers locaux et {v3} connexions locales seront supprimés.', {
                  v0: String(preview.total), v1: String(preview.files), v2: String(preview.local.files), v3: String(preview.local.connections),
                })}</p>
                <p>{_ui('Comptes à désactiver')} · {preview.accounts_to_deactivate}</p>
                <details>
                  <summary className="cursor-pointer">{_ui('Détail par table')}</summary>
                  <ul className="max-h-40 overflow-auto text-caption">
                    {preview.tables.map(row => <li key={row.table}>{row.table} · {row.count}</li>)}
                  </ul>
                </details>
                <Field label={_ui('Saisissez le code {v0} pour confirmer', { v0: preview.code })}>
                  <TInput value={confirmation} disabled={deletionBusy} onChange={event => setConfirmation(event.target.value)} />
                </Field>
              </>
            )}
            <div className="flex flex-wrap justify-end gap-sm">
              <Button variant="ghost" disabled={deletionBusy} onClick={() => setDeleting(null)}>{_ui('Annuler')}</Button>
              {deletionError && <Button variant="secondary" disabled={deletionBusy} onClick={() => openDeletion(deleting.domain)}>{_ui('Actualiser l’aperçu')}</Button>}
              <Button variant="destructive" loading={deletionBusy} disabled={!preview || confirmation !== preview.code}
                onClick={() => runDeletion()}>{_ui('Supprimer définitivement')}</Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={editing === 'new' ? _ui("NOUVEAU CLIENT / SOCIÉTÉ") : _ui("MODIFIER — {v0}",{v0:String(editing.name)})} onClose={() => setEditing(null)} size="lg">
          <div className="space-y-md">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <Field label={_ui("Code")} required><TInput value={form.code} onChange={e => set('code', e.target.value)} placeholder={_ui("DOM-CLIENT")} /></Field>
              <Field label={_ui("Nom")} required><TInput value={form.name} onChange={e => set('name', e.target.value)} /></Field>
            </div>
            <Field label={_ui("Raison sociale")}><TInput value={form.legal_name ?? ''} onChange={e => set('legal_name', e.target.value)} /></Field>
            <Field label={_ui("Adresse")}><TInput value={form.address ?? ''} onChange={e => set('address', e.target.value)} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <Field label={_ui("Ville")}><TInput value={form.city ?? ''} onChange={e => set('city', e.target.value)} /></Field>
              <Field label={_ui("Région")}><TInput value={form.region ?? ''} onChange={e => set('region', e.target.value)} /></Field>
              <Field label={_ui("Pays")}><TInput value={form.country} onChange={e => set('country', e.target.value)} /></Field>
              <Field label={_ui("Devise")}><TInput value={form.currency} maxLength={3} onChange={e => set('currency', e.target.value.toUpperCase())} /></Field>
              <Field label={_ui("Fuseau horaire")}><TInput value={form.timezone} onChange={e => set('timezone', e.target.value)} /></Field>
              <Field label={_ui("Langue")}><TInput value={form.locale} onChange={e => set('locale', e.target.value)} /></Field>
            </div>
            <Field label={_ui("Statut")}>
              <TSelect value={form.is_active ? 'active' : 'inactive'} onChange={e => set('is_active', e.target.value === 'active')}>
                <option value="active">{_ui("Actif")}</option><option value="inactive">{_ui("Inactif")}</option>
              </TSelect>
            </Field>
            <ModalFooter onCancel={() => setEditing(null)} onSave={save} loading={saving} disabled={!form.code.trim() || !form.name.trim()} saveLabel={_ui("ENREGISTRER")} />
          </div>
        </Modal>
      )}
    </div>
  )
}
