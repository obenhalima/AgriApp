'use client'
import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Truck, Plus, Pencil, Trash2, Search, X, Mail, Phone, MapPin, Building, CreditCard } from 'lucide-react'
import { getFournisseurs, createFournisseur, supabase } from '@/lib/supabase'
import { genCode } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { useReferenceList } from '@/lib/useReferenceList'

// ─── Formulaire partagé (HORS du composant parent pour éviter remount/focus loss) ───
function FormBlock({ vals, onChange }: { vals: any; onChange: (k: string) => (e: any) => void }) {
  const { values: cats } = useReferenceList('supplier_category')
  return (
    <div className="space-y-md">
      <div className="grid grid-cols-2 gap-md">
        <Field label="Code"><TInput value={vals.code} onChange={onChange('code')} /></Field>
        <Field label="Nom" required><TInput value={vals.name} onChange={onChange('name')} placeholder="Société" autoFocus /></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Catégorie">
          <TSelect value={vals.category} onChange={onChange('category')}>{cats.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</TSelect>
        </Field>
        <Field label="Ville"><TInput value={vals.city} onChange={onChange('city')} placeholder="Casablanca" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Email"><TInput type="email" value={vals.email} onChange={onChange('email')} /></Field>
        <Field label="Téléphone"><TInput value={vals.phone} onChange={onChange('phone')} /></Field>
      </div>
      <Field label="Délai paiement (jours)"><TInput type="number" value={vals.payment_terms_days} onChange={onChange('payment_terms_days')} /></Field>
      <Field label="Notes"><Textarea rows={2} value={vals.notes} onChange={onChange('notes')} /></Field>
    </div>
  )
}

export default function FournisseursPage() {
  const { values: CATS } = useReferenceList('supplier_category')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNew, setModalNew] = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')

  const [form, setForm] = useState({ code: '', name: '', category: 'semences', city: '', email: '', phone: '', payment_terms_days: '30', notes: '' })
  const [formE, setFormE] = useState<Record<string, any>>({})
  const upd = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))
  const updE = (k: string) => (e: any) => setFormE(f => ({ ...f, [k]: e.target.value }))

  const load = () => getFournisseurs().then(d => { setItems(d); setLoading(false) }).catch(() => setLoading(false))
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter(f => {
    if (catFilter !== 'all' && f.category !== catFilter) return false
    if (search && !`${f.code} ${f.name} ${f.city ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [items, search, catFilter])

  const stats = useMemo(() => ({
    count: items.length,
    cats: new Set(items.map(i => i.category)).size,
    cities: new Set(items.map(i => i.city).filter(Boolean)).size,
  }), [items])

  const openNew = () => { setForm(f => ({ ...f, code: genCode('F', items.map(i => i.code)) })); setModalNew(true) }
  const openEdit = (f: any) => {
    setFormE({ code: f.code, name: f.name, category: f.category, city: f.city || '', email: f.email || '', phone: f.phone || '', payment_terms_days: String(f.payment_terms_days || 30), notes: f.notes || '' })
    setModalEdit(f)
  }

  const save = async () => {
    console.log('[fournisseurs.save] click', form)
    if (!form.name?.trim()) {
      toast.error('Le nom est requis')
      return
    }
    if (!form.code?.trim()) {
      toast.error('Le code est requis')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        city: form.city?.trim() || undefined,
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        payment_terms_days: Number(form.payment_terms_days) || 30,
      }
      console.log('[fournisseurs.save] payload', payload)
      const n = await createFournisseur(payload)
      console.log('[fournisseurs.save] created', n)
      setItems(p => [n, ...p])
      setDone(true)
      toast.success(`✅ Fournisseur "${n.name}" créé`)
      setTimeout(() => { setModalNew(false); setDone(false) }, 1200)
    } catch (e: any) {
      console.error('[fournisseurs.save] error', e)
      // Codes Postgres typiques
      const msg = e?.message ?? 'inconnue'
      if (e?.code === '23505') {
        toast.error(`❌ Code "${form.code}" déjà utilisé. Choisis un autre code.`)
      } else if (e?.code === '23502') {
        toast.error('❌ Un champ obligatoire est manquant : ' + msg)
      } else if (e?.code === '42501' || msg.includes('row-level security')) {
        toast.error('❌ RLS bloque l\'insertion. Vérifie que tu es bien admin.', { duration: 8000 })
      } else if (e?.code === '22P02') {
        toast.error(`❌ Catégorie invalide : "${form.category}". Doit être dans la liste.`)
      } else {
        toast.error('❌ Erreur : ' + msg, { duration: 8000 })
      }
    }
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!modalEdit) { toast.error('Aucun fournisseur sélectionné'); return }
    if (!formE.name?.trim()) { toast.error('Le nom est requis'); return }
    setSaving(true)
    try {
      const payload = {
        code: formE.code?.trim(),
        name: formE.name.trim(),
        category: formE.category,
        city: formE.city?.trim() || null,
        email: formE.email?.trim() || null,
        phone: formE.phone?.trim() || null,
        payment_terms_days: Number(formE.payment_terms_days) || 30,
        notes: formE.notes?.trim() || null,
      }
      console.log('[fournisseurs.saveEdit] payload', payload)
      const { error } = await supabase.from('suppliers').update(payload).eq('id', modalEdit.id)
      if (error) throw error
      setDone(true)
      toast.success('✅ Fournisseur modifié')
      setTimeout(() => { setModalEdit(null); setDone(false); load() }, 1200)
    } catch (e: any) {
      console.error('[fournisseurs.saveEdit] error', e)
      const msg = e?.message ?? 'inconnue'
      if (e?.code === '23505') toast.error(`❌ Code "${formE.code}" déjà utilisé`)
      else if (e?.code === '42501' || msg.includes('row-level security')) toast.error('❌ RLS bloque la modification', { duration: 8000 })
      else toast.error('❌ Erreur : ' + msg, { duration: 8000 })
    }
    setSaving(false)
  }

  const del = async (f: any) => {
    if (!confirm(`Désactiver "${f.name}" ?`)) return
    try {
      await supabase.from('suppliers').update({ is_active: false }).eq('id', f.id)
      setItems(p => p.filter(i => i.id !== f.id))
      toast.success('Fournisseur désactivé')
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div>
      {modalNew && (
        <Modal title="NOUVEAU FOURNISSEUR" onClose={() => { setModalNew(false); setDone(false) }}>
          {done ? <SuccessMessage message="Fournisseur créé !" /> : (
            <><FormBlock vals={form} onChange={upd} /><ModalFooter onCancel={() => setModalNew(false)} onSave={save} loading={saving} disabled={!form.name} saveLabel="CRÉER" /></>
          )}
        </Modal>
      )}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.name}`} onClose={() => { setModalEdit(null); setDone(false) }}>
          {done ? <SuccessMessage message="Fournisseur modifié !" /> : (
            <><FormBlock vals={formE} onChange={updE} /><ModalFooter onCancel={() => setModalEdit(null)} onSave={saveEdit} loading={saving} disabled={!formE.name} saveLabel="ENREGISTRER" /></>
          )}
        </Modal>
      )}

      <PageHeader
        title="Fournisseurs" subtitle="Achats" icon={Truck} iconColor="#f97316"
        description={`${items.length} fournisseur${items.length > 1 ? 's' : ''}`}
        actions={<Button onClick={openNew} variant="primary"><Plus size={14} strokeWidth={2.5} /> Nouveau fournisseur</Button>}
        stats={loading ? [] : [
          { label: 'Total', value: String(stats.count), icon: Truck, color: '#f97316' },
          { label: 'Catégories', value: String(stats.cats), icon: Building, color: '#3b82f6' },
          { label: 'Villes', value: String(stats.cities), icon: MapPin, color: '#10b981' },
        ]}
      />

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary" />
              <TInput placeholder="Rechercher code, nom, ville…" value={search} onChange={(e) => setSearch(e.target.value)} className="border-none bg-transparent focus:ring-0 px-0" />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 w-auto min-w-[160px] text-body-sm">
              <option value="all">Toutes catégories</option>
              {CATS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </TSelect>
            <div className="ml-auto text-caption font-mono text-fg-tertiary">{filtered.length}/{items.length}</div>
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Truck} title="Aucun fournisseur" description="Crée tes fournisseurs pour gérer les achats." action={<Button onClick={openNew}><Plus size={14} strokeWidth={2.5} /> Nouveau</Button>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="Aucun résultat" action={<Button variant="ghost" onClick={() => { setSearch(''); setCatFilter('all') }}>Réinitialiser</Button>} />
        ) : (
          <DataTable minWidth={1100}>
            <THead>
              <TR><TH>Code</TH><TH>Nom</TH><TH>Catégorie</TH><TH>Ville</TH><TH>Email</TH><TH>Téléphone</TH><TH right>Délai pmt</TH><TH right>Actions</TH></TR>
            </THead>
            <tbody>
              {filtered.map((f, i) => (
                <TR key={f.id} animate delay={0.04 + i * 0.02}>
                  <TD mono className="text-caption text-fg-tertiary">{f.code}</TD>
                  <TD className="font-display font-semibold text-fg-primary">{f.name}</TD>
                  <TD><Badge variant="warning" size="sm">{f.category}</Badge></TD>
                  <TD className="text-caption">{f.city || '—'}</TD>
                  <TD className="text-caption">{f.email ? <a href={`mailto:${f.email}`} className="text-info hover:underline flex items-center gap-1"><Mail size={10} />{f.email}</a> : <span className="text-fg-tertiary">—</span>}</TD>
                  <TD className="text-caption">{f.phone ? <a href={`tel:${f.phone}`} className="text-fg-secondary hover:text-fg-primary flex items-center gap-1"><Phone size={10} />{f.phone}</a> : <span className="text-fg-tertiary">—</span>}</TD>
                  <TD right mono className="text-brand font-semibold">{f.payment_terms_days} j</TD>
                  <TD right>
                    <div className="flex items-center justify-end gap-1">
                      <Button onClick={() => openEdit(f)} variant="ghost" size="icon-sm"><Pencil size={12} strokeWidth={2.2} /></Button>
                      <Button onClick={() => del(f)} variant="ghost" size="icon-sm" className="hover:text-danger"><Trash2 size={12} strokeWidth={2.2} /></Button>
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
