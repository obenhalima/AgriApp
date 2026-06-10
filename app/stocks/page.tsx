'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Package, Plus, Pencil, ArrowUpCircle, ArrowDownCircle, AlertTriangle, BarChart3, Search, X, CheckCircle2 } from 'lucide-react'
import { getStocks, createStockItem, createMouvement, supabase } from '@/lib/supabase'
import { genCode } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay } from '@/components/display'
import { useReferenceList } from '@/lib/useReferenceList'

export default function StocksPage() {
  const { values: CATS } = useReferenceList('stock_category')
  const { values: UNITS } = useReferenceList('unit')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalArticle, setModalArticle] = useState(false)
  const [modalEditArt, setModalEditArt] = useState<any>(null)
  const [modalMvt, setModalMvt] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')

  const blankA = { code: '', name: '', category: 'engrais', unit: 'kg', min_qty: '', unit_cost: '', location: '' }
  const [formA, setFormA] = useState({ ...blankA })
  const [formAE, setFormAE] = useState<Record<string, any>>({})
  const [formM, setFormM] = useState({ stock_item_id: '', movement_type: 'entree', quantity: '', movement_date: '', reference: '', notes: '' })
  const sa = (k: string) => (e: any) => setFormA(f => ({ ...f, [k]: e.target.value }))
  const sae = (k: string) => (e: any) => setFormAE(f => ({ ...f, [k]: e.target.value }))
  const sm = (k: string) => (e: any) => setFormM(f => ({ ...f, [k]: e.target.value }))

  const load = () => getStocks().then(d => { setItems(d); setLoading(false) }).catch(() => setLoading(false))
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter(i => {
    if (catFilter !== 'all' && i.category !== catFilter) return false
    if (search && !`${i.code} ${i.name} ${i.location ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [items, search, catFilter])

  const stats = useMemo(() => {
    const alerts = items.filter(i => i.current_qty <= i.min_qty && i.min_qty > 0).length
    const totalValue = items.reduce((s, i) => s + (i.current_qty || 0) * (i.unit_cost || 0), 0)
    return { count: items.length, alerts, cats: new Set(items.map(i => i.category)).size, totalValue }
  }, [items])

  const openNewArt = () => { setFormA({ ...blankA, code: genCode('ST', items.map(i => i.code)) }); setModalArticle(true) }
  const openEditArt = (i: any) => {
    setFormAE({ code: i.code, name: i.name, category: i.category, unit: i.unit, min_qty: String(i.min_qty || 0), unit_cost: String(i.unit_cost || ''), location: i.location || '' })
    setModalEditArt(i)
  }
  const openMvt = (item: any, type = 'entree') => {
    setFormM({ stock_item_id: item.id, movement_type: type, quantity: '', movement_date: new Date().toISOString().slice(0, 10), reference: '', notes: '' })
    setModalMvt(item)
  }

  const saveArticle = async () => {
    if (!formA.name) return
    setSaving(true)
    try {
      const n = await createStockItem({ ...formA, min_qty: Number(formA.min_qty) || 0, unit_cost: formA.unit_cost ? Number(formA.unit_cost) : undefined })
      setItems(p => [n, ...p]); setDone(true)
      toast.success(`Article "${n.name}" créé`)
      setTimeout(() => { setModalArticle(false); setDone(false) }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const saveEditArt = async () => {
    if (!modalEditArt || !formAE.name) return
    setSaving(true)
    try {
      const { error } = await supabase.from('stock_items').update({
        code: formAE.code, name: formAE.name, category: formAE.category, unit: formAE.unit,
        min_qty: Number(formAE.min_qty) || 0,
        unit_cost: formAE.unit_cost ? Number(formAE.unit_cost) : null,
        location: formAE.location || null,
      }).eq('id', modalEditArt.id)
      if (error) throw error
      setDone(true)
      toast.success('Article modifié')
      setTimeout(() => { setModalEditArt(null); setDone(false); load() }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const saveMvt = async () => {
    if (!formM.stock_item_id || !formM.quantity || !formM.movement_date) return
    setSaving(true)
    try {
      await createMouvement({ ...formM, quantity: Number(formM.quantity) })
      await load(); setDone(true)
      toast.success('Mouvement enregistré')
      setTimeout(() => { setModalMvt(null); setDone(false) }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const ArtForm = ({ vals, onChange }: any) => (
    <div className="space-y-md">
      <div className="grid grid-cols-2 gap-md">
        <Field label="Code"><TInput value={vals.code} onChange={onChange('code')} /></Field>
        <Field label="Nom" required><TInput value={vals.name} onChange={onChange('name')} placeholder="NPK 20-20-20" autoFocus /></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Catégorie"><TSelect value={vals.category} onChange={onChange('category')}>{CATS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</TSelect></Field>
        <Field label="Unité"><TSelect value={vals.unit} onChange={onChange('unit')}>{UNITS.map(u => <option key={u.code} value={u.code}>{u.label}</option>)}</TSelect></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Stock min. (alerte)"><TInput type="number" value={vals.min_qty} onChange={onChange('min_qty')} placeholder="100" /></Field>
        <Field label="Coût unitaire (MAD)"><TInput type="number" value={vals.unit_cost} onChange={onChange('unit_cost')} placeholder="12.50" /></Field>
      </div>
      <Field label="Emplacement"><TInput value={vals.location} onChange={onChange('location')} placeholder="Entrepôt A / Rayon 3" /></Field>
    </div>
  )

  return (
    <div>
      {modalArticle && (
        <Modal title="NOUVEL ARTICLE" onClose={() => { setModalArticle(false); setDone(false) }}>
          {done ? <SuccessMessage message="Article créé !" /> : (<><ArtForm vals={formA} onChange={sa} /><ModalFooter onCancel={() => setModalArticle(false)} onSave={saveArticle} loading={saving} disabled={!formA.name} saveLabel="CRÉER L'ARTICLE" /></>)}
        </Modal>
      )}
      {modalEditArt && (
        <Modal title={`MODIFIER — ${modalEditArt.name}`} onClose={() => { setModalEditArt(null); setDone(false) }}>
          {done ? <SuccessMessage message="Article modifié !" /> : (<><ArtForm vals={formAE} onChange={sae} /><ModalFooter onCancel={() => setModalEditArt(null)} onSave={saveEditArt} loading={saving} disabled={!formAE.name} saveLabel="ENREGISTRER" /></>)}
        </Modal>
      )}
      {modalMvt && (
        <Modal title={`MOUVEMENT — ${modalMvt.name}`} onClose={() => { setModalMvt(null); setDone(false) }}>
          {done ? <SuccessMessage message="Mouvement enregistré !" /> : (
            <div className="space-y-md">
              <div className="rounded-md border border-border bg-surface-sunk p-md text-body-sm">
                Stock actuel : <strong className="text-success font-mono">{modalMvt.current_qty} {modalMvt.unit}</strong>
                <span className="text-fg-tertiary ml-md">Min : {modalMvt.min_qty} {modalMvt.unit}</span>
              </div>
              <FormRow>
                <FormGroup label="Type">
                  <TSelect value={formM.movement_type} onChange={sm('movement_type')}>
                    <option value="entree">Entrée (réception)</option>
                    <option value="sortie">Sortie (consommation)</option>
                    <option value="ajustement">Ajustement inventaire</option>
                  </TSelect>
                </FormGroup>
                <FormGroup label="Quantité *"><TInput type="number" value={formM.quantity} onChange={sm('quantity')} autoFocus /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Date *"><TInput type="date" value={formM.movement_date} onChange={sm('movement_date')} /></FormGroup>
                <FormGroup label="Référence"><TInput value={formM.reference} onChange={sm('reference')} placeholder="BL-2026-001" /></FormGroup>
              </FormRow>
              <FormGroup label="Notes"><Textarea rows={2} value={formM.notes} onChange={sm('notes')} /></FormGroup>
              <ModalFooter onCancel={() => setModalMvt(null)} onSave={saveMvt} loading={saving} disabled={!formM.quantity || !formM.movement_date} saveLabel="ENREGISTRER" />
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title="Stocks" subtitle="Inventaire" icon={Package} iconColor="#14b8a6"
        description={`${items.length} article${items.length > 1 ? 's' : ''} · ${stats.alerts} alerte${stats.alerts > 1 ? 's' : ''}`}
        actions={
          <div className="flex gap-xs">
            <Link href="/stocks/mouvements">
              <Button variant="ghost"><BarChart3 size={14} strokeWidth={2.2} /> Mouvements</Button>
            </Link>
            <Button onClick={openNewArt} variant="primary"><Plus size={14} strokeWidth={2.5} /> Nouvel article</Button>
          </div>
        }
        stats={loading ? [] : [
          { label: 'Articles', value: String(stats.count), icon: Package, color: '#14b8a6' },
          { label: 'Alertes', value: String(stats.alerts), icon: AlertTriangle, color: stats.alerts > 0 ? '#f59e0b' : '#10b981' },
          { label: 'Catégories', value: String(stats.cats), icon: BarChart3, color: '#a855f7' },
          { label: 'Valeur totale', value: <MoneyDisplay value={stats.totalValue} compact="auto" showCurrency={false} className="!text-current" />, icon: BarChart3, color: '#3b82f6' },
        ]}
      />

      {/* Bandeau alertes */}
      {!loading && stats.alerts > 0 && (
        <Card variant="ghost" className="mb-md border-warning/30 bg-warning/5">
          <div className="space-y-1.5">
            {items.filter(i => i.current_qty <= i.min_qty && i.min_qty > 0).slice(0, 3).map(i => (
              <div key={i.id} className="flex items-center gap-sm text-body-sm">
                <AlertTriangle size={14} className="text-warning flex-shrink-0" />
                <strong className="text-fg-primary">{i.name}</strong>
                <span className="text-fg-tertiary">— Stock : <span className="text-warning font-mono">{i.current_qty} {i.unit}</span> · Seuil : {i.min_qty} {i.unit}</span>
              </div>
            ))}
            {stats.alerts > 3 && <div className="text-caption text-fg-tertiary">+{stats.alerts - 3} autre{stats.alerts - 3 > 1 ? 's' : ''} alerte{stats.alerts - 3 > 1 ? 's' : ''}</div>}
          </div>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary" />
              <TInput placeholder="Rechercher code, nom, emplacement…" value={search} onChange={(e) => setSearch(e.target.value)} className="border-none bg-transparent focus:ring-0 px-0" />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 w-auto min-w-[160px] text-body-sm">
              <option value="all">Toutes catégories</option>
              {CATS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </TSelect>
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Package} title="Stock vide" description="Crée un article pour commencer." action={<Button onClick={openNewArt}><Plus size={14} /> Article</Button>} />
        ) : (
          <DataTable minWidth={1200}>
            <THead>
              <TR><TH>Code</TH><TH>Article</TH><TH>Catégorie</TH><TH right>Stock</TH><TH right>Seuil</TH><TH right>Coût unit.</TH><TH right>Valeur</TH><TH>Alerte</TH><TH right>Actions</TH></TR>
            </THead>
            <tbody>
              {filtered.map((i, idx) => {
                const alerte = i.current_qty <= i.min_qty && i.min_qty > 0
                return (
                  <TR key={i.id} animate delay={0.04 + idx * 0.02}>
                    <TD mono className="text-caption text-fg-tertiary">{i.code}</TD>
                    <TD className="font-display font-semibold text-fg-primary">{i.name}</TD>
                    <TD><Badge variant="info" size="sm">{i.category}</Badge></TD>
                    <TD right mono className={alerte ? 'text-danger font-bold' : 'text-success font-bold'}>{i.current_qty} {i.unit}</TD>
                    <TD right mono className="text-caption text-fg-tertiary">{i.min_qty} {i.unit}</TD>
                    <TD right mono className="text-caption">{i.unit_cost ? `${i.unit_cost.toFixed(2)} MAD` : '—'}</TD>
                    <TD right mono className="font-semibold"><MoneyDisplay value={(i.current_qty || 0) * (i.unit_cost || 0)} compact="auto" showCurrency={false} /></TD>
                    <TD>{alerte ? <Badge variant="danger" size="sm">⚠ Alerte</Badge> : <Badge variant="success" size="sm" dot>OK</Badge>}</TD>
                    <TD right>
                      <div className="flex items-center justify-end gap-1">
                        <Button onClick={() => openMvt(i, 'entree')} variant="secondary" size="xs" title="Entrée"><ArrowUpCircle size={12} /></Button>
                        <Button onClick={() => openMvt(i, 'sortie')} variant="ghost" size="xs" title="Sortie"><ArrowDownCircle size={12} /></Button>
                        <Button onClick={() => openEditArt(i)} variant="ghost" size="icon-sm"><Pencil size={12} strokeWidth={2.2} /></Button>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  )
}
