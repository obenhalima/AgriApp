'use client'
import {useLanguage} from '@/lib/i18n'

import '@/components/ui/workspace.css'
/**
 * /clients — Refonte avec design system.
 */
import { useEffect, useState, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Handshake, Plus, Pencil, Trash2, Search, X, Mail, Phone,
  MapPin, Globe, CreditCard, Building,
} from 'lucide-react'

import { getClients, createClient_, deleteClient, supabase } from '@/lib/supabase'
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
import { useReferenceList } from '@/lib/useReferenceList'
import { getDefaults } from '@/lib/appSettings'
import { useAuth } from '@/lib/auth'

// ─── Formulaire partagé New/Edit (HORS du composant parent pour éviter
//     le remount à chaque keystroke qui faisait perdre le focus) ───
function FormBlock({ vals, onChange }: { vals: any; onChange: (k: string) => (e: any) => void }) {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { values: typeOptions } = useReferenceList('client_type')
  return (
    <div className="space-y-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <Field label={_ui("Code")}><TInput value={vals.code} onChange={onChange('code')} /></Field>
        <Field label={_ui("Nom")} required><TInput value={vals.name} onChange={onChange('name')} placeholder={_ui("Société")} autoFocus /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <Field label={_ui("Type")}>
          <TSelect value={vals.type} onChange={onChange('type')}>
            {typeOptions.map(t => <option key={t.code} value={t.code}>{_uiNode(t.label)}</option>)}
          </TSelect>
        </Field>
        <Field label={_ui("Pays")}><TInput value={vals.country} onChange={onChange('country')} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <Field label={_ui("Ville")}><TInput value={vals.city} onChange={onChange('city')} placeholder={_ui("Agadir")} /></Field>
        <Field label={_ui("Téléphone")}><TInput value={vals.phone} onChange={onChange('phone')} placeholder="+212..." /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <Field label={_ui("Email")}><TInput type="email" value={vals.email} onChange={onChange('email')} /></Field>
        <Field label={_ui("Délai paiement (jours)")}><TInput type="number" value={vals.payment_terms_days} onChange={onChange('payment_terms_days')} /></Field>
      </div>
      <Field label={_ui("Plafond crédit (MAD)")} hint={_ui("Optionnel")}><TInput type="number" value={vals.credit_limit} onChange={onChange('credit_limit')} /></Field>
      <div className="rounded-md border border-warning/30 bg-warning/5 p-md">
        <label className="flex items-start gap-sm cursor-pointer">
          <input
            type="checkbox"
            checked={vals.is_ecart_buyer ?? false}
            onChange={(e) => onChange('is_ecart_buyer')({ target: { value: e.target.checked } })}
            className="mt-0.5 w-4 h-4 accent-warning"
          />
          <div className="flex-1 text-body-sm">
            <strong className="text-fg-primary">{_ui("Acheteur d'écart")}</strong>
            <div className="text-fg-secondary mt-0.5">
              {" "}{_ui("Ce client passe à la station récupérer les écarts du tri pour les revendre. Un seul client peut être désigné à la fois. Pense à créer un marché dédié (case \"Marché écart\" dans /marches).")}{" "}</div>
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
 const {t:_ui,text:_uiNode}=useLanguage()
  const {activeDomain,hasPermission}=useAuth()
  const scopeRef=useRef({domain:activeDomain?.domain_id})
  if(scopeRef.current.domain!==activeDomain?.domain_id)scopeRef.current={domain:activeDomain?.domain_id}

  const { values: TYPES } = useReferenceList('client_type')
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

  // Valeurs par défaut paramétrables (pays, délai paiement) depuis /admin/parametres
  const [defaults, setDefaults] = useState({ country: 'Maroc', paymentDays: '30' })

  const load = () => {
    const scope=scopeRef.current
    if(!scope.domain){setItems([]);setLoading(false);return}
    setLoading(true)
    getClients(scope.domain).then(d=>{if(scopeRef.current===scope){setItems(d);setLoading(false)}})
      .catch(e=>{if(scopeRef.current===scope){setLoading(false);toast.error(e.message)}})
  }
  useEffect(()=>{
    setItems([]);setModalNew(false);setModalEdit(null);setDone(false);setSaving(false);setSearch('');setTypeFilter('all');load()
  },[activeDomain?.domain_id])
  useEffect(() => {
    getDefaults().then(d => setDefaults({
      country: d.default_country,
      paymentDays: String(d.default_payment_terms_days),
    })).catch(() => { /* garde les fallbacks */ })
  }, [])

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
    if(!activeDomain||saving||!hasPermission('clients','create'))return
    setDone(false)
    setForm({
      code: `CL-${crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase()}`,
      name: '', type: TYPES.find(t => t.is_default)?.code ?? 'grossiste',
      city: '', country: defaults.country,
      email: '', phone: '', payment_terms_days: defaults.paymentDays, credit_limit: '',
      is_ecart_buyer: false,
    } as any)
    setModalNew(true)
  }

  const openEdit = (c: any) => {
    if(!activeDomain||c.domain_id!==activeDomain.domain_id||saving||!hasPermission('clients','edit'))return
    setDone(false)
    setFormE({
      code: c.code, name: c.name, type: c.type, city: c.city || '', country: c.country || 'Maroc',
      email: c.email || '', phone: c.phone || '',
      payment_terms_days: String(c.payment_terms_days || 30), credit_limit: String(c.credit_limit || ''),
      is_ecart_buyer: !!c.is_ecart_buyer,
    })
    setModalEdit(c)
  }

  const save = async () => {
    if (!form.name||!activeDomain||saving||!hasPermission('clients','create')) return
    const scope=scopeRef.current
    setSaving(true)
    try {
      // Création atomique : propriétaire et indicateur d'écart dans la même requête.
      const n = await createClient_({
        ...form,
        domain_id:activeDomain.domain_id,
        payment_terms_days: Number(form.payment_terms_days) || 30,
        credit_limit: Number(form.credit_limit) || undefined,
      })
      if(scopeRef.current!==scope)return
      setItems(p => [n, ...p]); setDone(true)
      toast.success(_ui("Client \"{v0}\" créé",{v0:String(n.name)}))
    } catch (e: any) { if(scopeRef.current===scope)toast.error(_ui("Erreur :") + e.message) }
    finally{if(scopeRef.current===scope)setSaving(false)}
  }

  const saveEdit = async () => {
    if (!modalEdit || !formE.name||!activeDomain||modalEdit.domain_id!==activeDomain.domain_id||saving||!hasPermission('clients','edit')) return
    const scope=scopeRef.current
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
      let { error,data } = await supabase.from('clients').update(payload).eq('domain_id',activeDomain.domain_id).eq('id', modalEdit.id).select().single()
      if(scopeRef.current!==scope)return
      // Retry sans is_ecart_buyer si migration 048 pas appliquee
      if (error && /is_ecart_buyer.*schema cache|is_ecart_buyer.*does not exist/i.test(error.message)) {
        toast.warning(_ui("Colonne is_ecart_buyer absente (migration 048). Sauvegarde sans ce champ."), { duration: 6000 })
        delete payload.is_ecart_buyer
        const retry = await supabase.from('clients').update(payload).eq('domain_id',activeDomain.domain_id).eq('id', modalEdit.id).select().single()
        error = retry.error ?? undefined as any
        data=retry.data
      }
      if (error) throw error
      if(scopeRef.current!==scope)return
      setItems(rows=>rows.map(row=>row.id===modalEdit.id?data:row))
      setDone(true)
      toast.success(_ui("Client modifié"))
    } catch (e: any) { if(scopeRef.current===scope)toast.error(_ui("Erreur :") + e.message) }
    finally{if(scopeRef.current===scope)setSaving(false)}
  }

  const del = async (c: any) => {
    if(!activeDomain||c.domain_id!==activeDomain.domain_id||!hasPermission('clients','edit'))return
    const scope=scopeRef.current
    if (!confirm(_ui("Désactiver \"{v0}\" ?",{v0:String(c.name)}))) return
    try {
      await deleteClient(c.id,activeDomain.domain_id)
      if(scopeRef.current!==scope)return
      setItems(p => p.filter(i => i.id !== c.id))
      toast.success(_ui("Client désactivé"))
    } catch (e: any) { if(scopeRef.current===scope)toast.error(_ui("Erreur :") + e.message) }
  }

  return (
    <div className="itrix-workspace">
      {modalNew && (
        <Modal title={_ui("NOUVEAU CLIENT")} busy={saving} dirty={done?false:undefined} onClose={() => { setModalNew(false); setDone(false) }}>
          {done ? <SuccessMessage message={_ui("Client créé !")} /> : (
            <>
              <FormBlock vals={form} onChange={upd} />
              <ModalFooter onCancel={() => setModalNew(false)} onSave={save} loading={saving} disabled={!form.name} saveLabel={_ui("CRÉER LE CLIENT")} />
            </>
          )}
        </Modal>
      )}
      {modalEdit && (
        <Modal title={_ui("MODIFIER — {v0}",{v0:String(modalEdit.name)})} busy={saving} dirty={done?false:undefined} onClose={() => { setModalEdit(null); setDone(false) }}>
          {done ? <SuccessMessage message={_ui("Client modifié !")} /> : (
            <>
              <FormBlock vals={formE} onChange={updE} />
              <ModalFooter onCancel={() => setModalEdit(null)} onSave={saveEdit} loading={saving} disabled={!formE.name} saveLabel={_ui("ENREGISTRER")} />
            </>
          )}
        </Modal>
      )}

      <PageHeader
        title={_ui("Clients")}
        subtitle={_ui("Commercial")}
        icon={Handshake}
        iconColor="#8b5cf6"
        description={_ui("{v0} client{v1} actif{v2}",{v0:String(items.length),v1:String(items.length > 1 ? 's' : ''),v2:String(items.length > 1 ? 's' : '')})}
        actions={
          <Button disabled={!activeDomain||!hasPermission('clients','create')} onClick={openNew} variant="primary">
            <Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouveau client")}{" "}</Button>
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
                placeholder={_ui("Rechercher code, nom, ville, email…")}
                aria-label={_ui("Rechercher un client")}
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="border-none bg-transparent focus:ring-0 px-0"
              />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect aria-label={_ui("Type de client")} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 w-auto min-w-[160px] text-body-sm">
              <option value="all">{_ui("Tous types")}</option>
              {TYPES.map(t => <option key={t.code} value={t.code}>{_uiNode(t.label)}</option>)}
            </TSelect>
            <div className="ml-auto text-caption font-mono text-fg-tertiary">{filtered.length}/{items.length}</div>
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="itrix-table">
        {loading ? (
          <div className="p-md space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title={_ui("Aucun client")}
            description={_ui("Crée tes clients pour commencer la facturation.")}
            action={<Button onClick={openNew}><Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouveau client")}</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={_ui("Aucun résultat")}
            description={_ui("Aucun client ne correspond à tes filtres.")}
            action={<Button variant="ghost" onClick={() => { setSearch(''); setTypeFilter('all') }}>{_ui("Réinitialiser")}</Button>}
          />
        ) : (
          <DataTable minWidth={1100}>
            <THead>
              <TR>
                <TH>{_ui("Code")}</TH>
                <TH>{_ui("Nom")}</TH>
                <TH>{_ui("Type")}</TH>
                <TH>{_ui("Ville")}</TH>
                <TH>{_ui("Pays")}</TH>
                <TH>{_ui("Email")}</TH>
                <TH>{_ui("Téléphone")}</TH>
                <TH right>{_ui("Délai pmt")}</TH>
                <TH right>{_ui("Actions")}</TH>
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
                      <Button onClick={() => openEdit(c)} variant="ghost" size="icon-sm" title={_ui("Modifier")}>
                        <Pencil size={12} strokeWidth={2.2} />
                      </Button>
                      <Button onClick={() => del(c)} variant="ghost" size="icon-sm" title={_ui("Désactiver")} className="hover:text-danger">
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
