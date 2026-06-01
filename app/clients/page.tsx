'use client'
/**
 * /clients — Refonte avec design system.
 */
import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Handshake, Plus, Pencil, Trash2, Search, X, Mail, Phone,
  MapPin, Globe, CreditCard, Building,
} from 'lucide-react'

import { getClients, createClient_, deleteClient, supabase } from '@/lib/supabase'
import { genCode } from '@/lib/utils'
import { cn } from '@/lib/cn'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { Modal, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay } from '@/components/display'

const TYPES = ['grossiste', 'exportateur', 'grande_surface', 'detail', 'industrie', 'institutionnel', 'autre']

// ─── Formulaire partagé New/Edit (HORS du composant parent pour éviter
//     le remount à chaque keystroke qui faisait perdre le focus) ───
function FormBlock({ vals, onChange }: { vals: any; onChange: (k: string) => (e: any) => void }) {
  return (
    <div className="space-y-md">
      <div className="grid grid-cols-2 gap-md">
        <Field label="Code"><TInput value={vals.code} onChange={onChange('code')} /></Field>
        <Field label="Nom" required><TInput value={vals.name} onChange={onChange('name')} placeholder="Société" autoFocus /></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Type">
          <TSelect value={vals.type} onChange={onChange('type')}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </TSelect>
        </Field>
        <Field label="Pays"><TInput value={vals.country} onChange={onChange('country')} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Ville"><TInput value={vals.city} onChange={onChange('city')} placeholder="Agadir" /></Field>
        <Field label="Téléphone"><TInput value={vals.phone} onChange={onChange('phone')} placeholder="+212..." /></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Email"><TInput type="email" value={vals.email} onChange={onChange('email')} /></Field>
        <Field label="Délai paiement (jours)"><TInput type="number" value={vals.payment_terms_days} onChange={onChange('payment_terms_days')} /></Field>
      </div>
      <Field label="Plafond crédit (MAD)" hint="Optionnel"><TInput type="number" value={vals.credit_limit} onChange={onChange('credit_limit')} /></Field>
      <div className="rounded-md border border-warning/30 bg-warning/5 p-md">
        <label className="flex items-start gap-sm cursor-pointer">
          <input
            type="checkbox"
            checked={vals.is_ecart_buyer ?? false}
            onChange={(e) => onChange('is_ecart_buyer')({ target: { value: e.target.checked } })}
            className="mt-0.5 w-4 h-4 accent-warning"
          />
          <div className="flex-1 text-body-sm">
            <strong className="text-fg-primary">Acheteur d'écart</strong>
            <div className="text-fg-secondary mt-0.5">
              Ce client passe à la station récupérer les écarts du tri pour les revendre.
              Un seul client peut être désigné à la fois.
              Pense à créer un marché dédié (case "Marché écart" dans /marches).
            </div>
          </div>
        </label>
      </div>
    </div>
  )
}

const TYPE_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'brand' | 'default'> = {
  exportateur: 'warning',
  grossiste: 'success',
  grande_surface: 'info',
  detail: 'brand',
  industrie: 'default',
  institutionnel: 'brand',
}

export default function ClientsPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNew, setModalNew] = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const [form, setForm] = useState({
    code: '', name: '', type: 'grossiste', city: '', country: 'Maroc',
    email: '', phone: '', payment_terms_days: '30', credit_limit: '',
  })
  const [formE, setFormE] = useState<Record<string, any>>({})
  const upd = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))
  const updE = (k: string) => (e: any) => setFormE(f => ({ ...f, [k]: e.target.value }))

  const load = () => getClients().then(d => { setItems(d); setLoading(false) }).catch(() => setLoading(false))
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter(c => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${c.code} ${c.name} ${c.city ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q)) return false
    }
    return true
  }), [items, search, typeFilter])

  const stats = useMemo(() => {
    const totalCredit = items.reduce((s, c) => s + Number(c.credit_limit || 0), 0)
    const exportClients = items.filter(c => c.type === 'exportateur').length
    return {
      count: items.length,
      types: new Set(items.map(c => c.type)).size,
      countries: new Set(items.map(c => c.country)).size,
      totalCredit,
      exportClients,
    }
  }, [items])

  const openNew = () => {
    setForm({
      code: genCode('CL', items.map(i => i.code)),
      name: '', type: 'grossiste', city: '', country: 'Maroc',
      email: '', phone: '', payment_terms_days: '30', credit_limit: '',
      is_ecart_buyer: false,
    } as any)
    setModalNew(true)
  }

  const openEdit = (c: any) => {
    setFormE({
      code: c.code, name: c.name, type: c.type, city: c.city || '', country: c.country || 'Maroc',
      email: c.email || '', phone: c.phone || '',
      payment_terms_days: String(c.payment_terms_days || 30), credit_limit: String(c.credit_limit || ''),
      is_ecart_buyer: !!c.is_ecart_buyer,
    })
    setModalEdit(c)
  }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      // 1) Cree le client basique via le helper
      const n = await createClient_({
        ...form,
        payment_terms_days: Number(form.payment_terms_days) || 30,
        credit_limit: Number(form.credit_limit) || undefined,
      })
      // 2) Si is_ecart_buyer coche, on met a jour separement (colonne ajoutee migration 048)
      if ((form as any).is_ecart_buyer) {
        const r = await supabase.from('clients').update({ is_ecart_buyer: true }).eq('id', n.id)
        if (r.error) {
          if (/is_ecart_buyer.*schema cache|is_ecart_buyer.*does not exist/i.test(r.error.message)) {
            toast.warning('Colonne is_ecart_buyer absente (migration 048 a appliquer)', { duration: 6000 })
          } else {
            console.warn('[clients] is_ecart_buyer update:', r.error)
          }
        }
      }
      setItems(p => [n, ...p]); setDone(true)
      toast.success(`Client "${n.name}" créé`)
      setTimeout(() => { setModalNew(false); setDone(false) }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!modalEdit || !formE.name) return
    setSaving(true)
    try {
      const payload: any = {
        code: formE.code, name: formE.name, type: formE.type,
        city: formE.city || null, country: formE.country || 'Maroc',
        email: formE.email || null, phone: formE.phone || null,
        payment_terms_days: Number(formE.payment_terms_days) || 30,
        credit_limit: formE.credit_limit ? Number(formE.credit_limit) : null,
        is_ecart_buyer: !!formE.is_ecart_buyer,
      }
      let { error } = await supabase.from('clients').update(payload).eq('id', modalEdit.id)
      // Retry sans is_ecart_buyer si migration 048 pas appliquee
      if (error && /is_ecart_buyer.*schema cache|is_ecart_buyer.*does not exist/i.test(error.message)) {
        toast.warning('Colonne is_ecart_buyer absente (migration 048). Sauvegarde sans ce champ.', { duration: 6000 })
        delete payload.is_ecart_buyer
        const retry = await supabase.from('clients').update(payload).eq('id', modalEdit.id)
        error = retry.error ?? undefined as any
      }
      if (error) throw error
      setDone(true)
      toast.success('Client modifié')
      setTimeout(() => { setModalEdit(null); setDone(false); load() }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const del = async (c: any) => {
    if (!confirm(`Désactiver "${c.name}" ?`)) return
    try {
      await deleteClient(c.id)
      setItems(p => p.filter(i => i.id !== c.id))
      toast.success(`Client désactivé`)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div>
      {modalNew && (
        <Modal title="NOUVEAU CLIENT" onClose={() => { setModalNew(false); setDone(false) }}>
          {done ? <SuccessMessage message="Client créé !" /> : (
            <>
              <FormBlock vals={form} onChange={upd} />
              <ModalFooter onCancel={() => setModalNew(false)} onSave={save} loading={saving} disabled={!form.name} saveLabel="CRÉER LE CLIENT" />
            </>
          )}
        </Modal>
      )}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.name}`} onClose={() => { setModalEdit(null); setDone(false) }}>
          {done ? <SuccessMessage message="Client modifié !" /> : (
            <>
              <FormBlock vals={formE} onChange={updE} />
              <ModalFooter onCancel={() => setModalEdit(null)} onSave={saveEdit} loading={saving} disabled={!formE.name} saveLabel="ENREGISTRER" />
            </>
          )}
        </Modal>
      )}

      <PageHeader
        title="Clients"
        subtitle="Commercial"
        icon={Handshake}
        iconColor="#8b5cf6"
        description={`${items.length} client${items.length > 1 ? 's' : ''} actif${items.length > 1 ? 's' : ''}`}
        actions={
          <Button onClick={openNew} variant="primary">
            <Plus size={14} strokeWidth={2.5} /> Nouveau client
          </Button>
        }
        stats={loading ? [] : [
          { label: 'Total',         value: String(stats.count),                                                                  icon: Handshake,  color: '#8b5cf6' },
          { label: 'Exportateurs',  value: String(stats.exportClients),                                                          icon: Globe,      color: '#f59e0b' },
          { label: 'Types',         value: String(stats.types),                                                                  icon: Building,   color: '#3b82f6' },
          { label: 'Pays',          value: String(stats.countries),                                                              icon: MapPin,     color: '#10b981' },
          { label: 'Crédit total',  value: <MoneyDisplay value={stats.totalCredit} compact="auto" showCurrency={false} className="!text-current" />, icon: CreditCard, color: '#ec4899' },
        ]}
      />

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary flex-shrink-0" />
              <TInput
                placeholder="Rechercher code, nom, ville, email…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="border-none bg-transparent focus:ring-0 px-0"
              />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 w-auto min-w-[160px] text-body-sm">
              <option value="all">Tous types</option>
              {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </TSelect>
            <div className="ml-auto text-caption font-mono text-fg-tertiary">{filtered.length}/{items.length}</div>
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="Aucun client"
            description="Crée tes clients pour commencer la facturation."
            action={<Button onClick={openNew}><Plus size={14} strokeWidth={2.5} /> Nouveau client</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Aucun résultat"
            description="Aucun client ne correspond à tes filtres."
            action={<Button variant="ghost" onClick={() => { setSearch(''); setTypeFilter('all') }}>Réinitialiser</Button>}
          />
        ) : (
          <DataTable minWidth={1100}>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Nom</TH>
                <TH>Type</TH>
                <TH>Ville</TH>
                <TH>Pays</TH>
                <TH>Email</TH>
                <TH>Téléphone</TH>
                <TH right>Délai pmt</TH>
                <TH right>Actions</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map((c, i) => (
                <TR key={c.id} animate delay={0.04 + i * 0.02}>
                  <TD mono className="text-caption font-semibold text-fg-tertiary">{c.code}</TD>
                  <TD className="font-display font-semibold text-fg-primary">{c.name}</TD>
                  <TD><Badge variant={TYPE_VARIANT[c.type] || 'default'} size="sm">{c.type?.replace('_', ' ')}</Badge></TD>
                  <TD className="text-caption text-fg-secondary flex items-center gap-1">
                    {c.city ? <><MapPin size={10} className="text-fg-tertiary" />{c.city}</> : <span className="text-fg-tertiary">—</span>}
                  </TD>
                  <TD mono className="text-caption text-fg-secondary">{c.country || '—'}</TD>
                  <TD className="text-caption">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-info hover:underline flex items-center gap-1">
                        <Mail size={10} />{c.email}
                      </a>
                    ) : <span className="text-fg-tertiary">—</span>}
                  </TD>
                  <TD className="text-caption">
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="text-fg-secondary hover:text-fg-primary flex items-center gap-1">
                        <Phone size={10} />{c.phone}
                      </a>
                    ) : <span className="text-fg-tertiary">—</span>}
                  </TD>
                  <TD right mono className="text-brand font-semibold">{c.payment_terms_days} j</TD>
                  <TD right>
                    <div className="flex items-center justify-end gap-1">
                      <Button onClick={() => openEdit(c)} variant="ghost" size="icon-sm" title="Modifier">
                        <Pencil size={12} strokeWidth={2.2} />
                      </Button>
                      <Button onClick={() => del(c)} variant="ghost" size="icon-sm" title="Désactiver" className="hover:text-danger">
                        <Trash2 size={12} strokeWidth={2.2} />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  )
}
