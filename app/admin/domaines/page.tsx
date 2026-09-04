'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Globe2, Lock, Pencil, Plus, ShieldCheck } from 'lucide-react'
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

const EMPTY: DomainInput = {
  code: '', name: '', legal_name: '', address: '', city: '', region: '',
  country: 'Maroc', currency: 'MAD', timezone: 'Africa/Casablanca',
  locale: 'fr-MA', logo_url: '', is_active: true,
}

export default function DomainsAdminPage() {
  const { isPlatformAdmin, loading: authLoading } = useAuth()
  const [items, setItems] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Domain | 'new' | null>(null)
  const [form, setForm] = useState<DomainInput>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!isPlatformAdmin) { setLoading(false); return }
    try { setLoading(true); setItems(await listDomains()) }
    catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (!authLoading) load() }, [authLoading, isPlatformAdmin])

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
      toast.success(editing === 'new' ? 'Domaine créé' : 'Domaine modifié')
      setEditing(null)
      await load()
    } catch (e: any) {
      const msg = e?.code === '23505' ? 'Ce code de domaine existe déjà.' : e.message
      toast.error(msg)
    } finally { setSaving(false) }
  }

  if (authLoading) return <div className="space-y-md"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>
  if (!isPlatformAdmin) return <EmptyState icon={Lock} title="Accès réservé au super-administrateur plateforme" />

  return (
    <div>
      <PageHeader
        title="Domaines" subtitle="Administration plateforme" icon={Globe2} iconColor="#8b5cf6"
        description={`${items.length} client${items.length > 1 ? 's' : ''} FarmPilot`}
        actions={<Button onClick={openNew}><Plus size={14} /> Nouveau domaine</Button>}
        stats={loading ? [] : [
          { label: 'Total', value: String(items.length), icon: Globe2, color: '#8b5cf6' },
          { label: 'Actifs', value: String(stats.active), icon: ShieldCheck, color: '#10b981' },
          { label: 'Pays', value: String(stats.countries), icon: Building2, color: '#3b82f6' },
        ]}
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">{[1,2,3].map(i => <Skeleton key={i} className="h-52" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Globe2} title="Aucun domaine" action={<Button onClick={openNew}>Créer le premier domaine</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
          {items.map(d => (
            <Card key={d.id} className={!d.is_active ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between gap-sm mb-md">
                <div>
                  <div className="font-display text-heading font-bold text-fg-primary">{d.name}</div>
                  <div className="font-mono text-caption text-fg-tertiary">{d.code}</div>
                </div>
                <Badge variant={d.is_active ? 'success' : 'default'} size="sm">{d.is_active ? 'Actif' : 'Inactif'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-sm text-body-sm mb-md">
                <div><span className="text-fg-tertiary">Pays</span><div className="font-semibold">{d.country}</div></div>
                <div><span className="text-fg-tertiary">Devise</span><div className="font-semibold">{d.currency}</div></div>
                <div><span className="text-fg-tertiary">Fuseau</span><div className="font-semibold truncate">{d.timezone}</div></div>
                <div><span className="text-fg-tertiary">Langue</span><div className="font-semibold">{d.locale}</div></div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => openEdit(d)} className="w-full"><Pencil size={12} /> Modifier</Button>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'NOUVEAU DOMAINE' : `MODIFIER — ${editing.name}`} onClose={() => setEditing(null)} size="lg">
          <div className="space-y-md">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <Field label="Code" required><TInput value={form.code} onChange={e => set('code', e.target.value)} placeholder="DOM-CLIENT" /></Field>
              <Field label="Nom" required><TInput value={form.name} onChange={e => set('name', e.target.value)} /></Field>
            </div>
            <Field label="Raison sociale"><TInput value={form.legal_name ?? ''} onChange={e => set('legal_name', e.target.value)} /></Field>
            <Field label="Adresse"><TInput value={form.address ?? ''} onChange={e => set('address', e.target.value)} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <Field label="Ville"><TInput value={form.city ?? ''} onChange={e => set('city', e.target.value)} /></Field>
              <Field label="Région"><TInput value={form.region ?? ''} onChange={e => set('region', e.target.value)} /></Field>
              <Field label="Pays"><TInput value={form.country} onChange={e => set('country', e.target.value)} /></Field>
              <Field label="Devise"><TInput value={form.currency} maxLength={3} onChange={e => set('currency', e.target.value.toUpperCase())} /></Field>
              <Field label="Fuseau horaire"><TInput value={form.timezone} onChange={e => set('timezone', e.target.value)} /></Field>
              <Field label="Langue"><TInput value={form.locale} onChange={e => set('locale', e.target.value)} /></Field>
            </div>
            <Field label="Statut">
              <TSelect value={form.is_active ? 'active' : 'inactive'} onChange={e => set('is_active', e.target.value === 'active')}>
                <option value="active">Actif</option><option value="inactive">Inactif</option>
              </TSelect>
            </Field>
            <ModalFooter onCancel={() => setEditing(null)} onSave={save} loading={saving} disabled={!form.code.trim() || !form.name.trim()} saveLabel="ENREGISTRER" />
          </div>
        </Modal>
      )}
    </div>
  )
}

