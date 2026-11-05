'use client'
import {AuditHistoryButton} from '@/components/audit/AuditHistoryButton'
import {useLanguage} from '@/lib/i18n'

/**
 * /fermes — Refonte avec design system.
 */
import { useEffect, useState, useMemo,useRef } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Building2, Plus, MapPin, Globe, Maximize, Search, X,Pencil,Trash2,
} from 'lucide-react'

import { supabase, getFarms } from '@/lib/supabase'
import { genCode } from '@/lib/utils'
import { cn } from '@/lib/cn'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Textarea, Field } from '@/components/ui/Input'
import { Modal, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { AreaDisplay } from '@/components/display'
import { useAuth } from '@/lib/auth'
import {updateClientFarm,deleteEmptyFarm,farmEditPayload} from '@/lib/farmManagement'

export default function FermesPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { activeDomain,hasPermission } = useAuth()
  const domainRef=useRef(activeDomain?.domain_id);domainRef.current=activeDomain?.domain_id
  const [editingId,setEditingId]=useState<string|null>(null)
  const [deletingId,setDeletingId]=useState<string|null>(null)
  const [deleteError,setDeleteError]=useState<{farm:string;message:string}|null>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    code: '', name: '', address: '', city: '', region: '', country: 'Maroc',
    total_area: '', notes: '',
  })
  const upd = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const load = () => {
    if (!activeDomain) { setItems([]); setLoading(false); return }
    const domain=activeDomain.domain_id
    setLoading(true)
    getFarms(domain).then(d => { if(domainRef.current===domain){setItems(d); setLoading(false)} }).catch(()=>{if(domainRef.current===domain){setLoading(false);toast.error(_ui('Chargement des fermes impossible.'))}})
  }
  useEffect(() => { setItems([]);setDeleteError(null);setModal(false);setDone(false);setEditingId(null);load() }, [activeDomain?.domain_id])

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(f =>
      `${f.name} ${f.code} ${f.city ?? ''} ${f.region ?? ''}`.toLowerCase().includes(q)
    )
  }, [items, search])

  // Stats agrégées
  const stats = useMemo(() => {
    const totalArea = items.reduce((s, f) => s + Number(f.total_area || 0), 0)
    const cities = new Set(items.map(f => f.city).filter(Boolean)).size
    const regions = new Set(items.map(f => f.region).filter(Boolean)).size
    return {
      count: items.length,
      totalArea: totalArea * 10000, // ha → m² for AreaDisplay
      cities,
      regions,
    }
  }, [items])

  const openNew = () => {
    if(!hasPermission('fermes','create')||saving)return
    setEditingId(null);setDone(false)
    setForm({
      code: genCode('F', items.map(i => i.code)),
      name: '', address: '', city: '', region: '', country: 'Maroc',
      total_area: '', notes: '',
    })
    setModal(true)
  }
  const openEdit=(farm:any)=>{
    if(!hasPermission('fermes','edit')||saving)return
    setEditingId(farm.id);setDone(false)
    setForm({code:farm.code||'',name:farm.name||'',address:farm.address||'',city:farm.city||'',region:farm.region||'',country:farm.country||'Maroc',total_area:farm.total_area==null?'':String(farm.total_area),notes:farm.notes||''})
    setModal(true)
  }
  const remove=async(farm:any)=>{
    if(!activeDomain||deletingId||!hasPermission('fermes','delete'))return
    if(!window.confirm(_ui('Supprimer définitivement la ferme « {v0} » ? La suppression sera bloquée si des données lui sont liées.',{v0:String(farm.name)})))return
    const domain=activeDomain.domain_id
    setDeleteError(null)
    setDeletingId(farm.id)
    try{await deleteEmptyFarm(domain,farm.id)
      if(domainRef.current===domain){setItems(rows=>rows.filter(r=>r.id!==farm.id));toast.success(_ui('Ferme supprimée. Aucune donnée liée supprimée.'))}
    }catch(e:any){if(domainRef.current===domain)setDeleteError({farm:String(farm.name),message:e.message||_ui('Suppression impossible.')})}
    finally{setDeletingId(null)}
  }

  const save = async () => {
    if (!form.name || !activeDomain || !hasPermission('fermes',editingId?'edit':'create')) return
    const domain=activeDomain.domain_id
    setSaving(true)
    try {
      let data:any
      if(editingId)data=await updateClientFarm(domain,editingId,form)
      else{
        const result=await supabase.from('farms').insert({domain_id:domain,...farmEditPayload(form),is_active:true}).select().single()
        if(result.error)throw result.error
        data=result.data
      }
      if(domainRef.current!==domain)return
      setItems(p => editingId?p.map(f=>f.id===editingId?data:f):[data, ...p])
      setDone(true)
      toast.success(editingId?_ui('Ferme modifiée.'):_ui("Ferme \"{v0}\" créée",{v0:String(data.name)}))
      setTimeout(() => { if(domainRef.current===domain){setModal(false);setDone(false);setEditingId(null)} }, 1200)
    } catch (e: any) { if(domainRef.current===domain)toast.error(_ui("Erreur :") + e.message) }
    finally{setSaving(false)}
  }

  return (
    <div>
      {modal && (
        <Modal title={editingId?_ui('Modifier la ferme'):_ui("NOUVELLE FERME")} busy={saving} dirty={done?false:undefined} onClose={() => { setModal(false); setDone(false);setEditingId(null) }}>
          {done ? <SuccessMessage message={editingId?_ui('Ferme modifiée.'):_ui("Ferme créée avec succès !")} /> : (
            <div className="space-y-md">
              <div className="grid grid-cols-2 gap-md">
                <Field label={_ui("Code (auto-généré)")}><TInput value={form.code} onChange={upd('code')} placeholder="F01" /></Field>
                <Field label={_ui("Nom de la ferme")} required><TInput value={form.name} onChange={upd('name')} placeholder={_ui("Domaine Souss Agri")} autoFocus /></Field>
              </div>
              <Field label={_ui("Adresse")}><TInput value={form.address} onChange={upd('address')} placeholder={_ui("Route d'Agadir Km 15")} /></Field>
              <div className="grid grid-cols-2 gap-md">
                <Field label={_ui("Ville")}><TInput value={form.city} onChange={upd('city')} placeholder={_ui("Aït Melloul")} /></Field>
                <Field label={_ui("Région")}><TInput value={form.region} onChange={upd('region')} placeholder={_ui("Souss-Massa")} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label={_ui("Pays")}><TInput value={form.country} onChange={upd('country')} /></Field>
                <Field label={_ui("Superficie totale (ha)")}><TInput type="number" value={form.total_area} onChange={upd('total_area')} placeholder="5.2" /></Field>
              </div>
              <Field label={_ui("Notes")}><Textarea rows={2} value={form.notes} onChange={upd('notes')} /></Field>
              <ModalFooter onCancel={() => setModal(false)} onSave={save} loading={saving} disabled={!form.name.trim()||!form.code.trim()} saveLabel={editingId?_ui('ENREGISTRER LES MODIFICATIONS'):_ui("CRÉER LA FERME")} />
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title={_ui("Fermes")}
        subtitle={_ui("Exploitation")}
        icon={Building2}
        iconColor="#64748b"
        description={_ui("{v0} ferme{v1} enregistrée{v2}",{v0:String(items.length),v1:String(items.length > 1 ? 's' : ''),v2:String(items.length > 1 ? 's' : '')})}
        actions={
          <Button disabled={!hasPermission('fermes','create')} onClick={openNew} variant="primary">
            <Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouvelle ferme")}{" "}</Button>
        }
        stats={loading ? [] : [
          { label: 'Total',     value: String(stats.count),                                               icon: Building2, color: '#64748b' },
          { label: 'Superficie', value: <AreaDisplay value={stats.totalArea} showTooltip={false} className="!text-current" />, icon: Maximize,  color: '#10b981' },
          { label: 'Villes',     value: String(stats.cities),                                            icon: MapPin,    color: '#3b82f6' },
          { label: 'Régions',    value: String(stats.regions),                                          icon: Globe,     color: '#a855f7' },
        ]}
      />

      {deleteError && (
        <div role="alert" className="mb-md rounded-xl border border-red-600 bg-red-50 p-4 text-red-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{_ui('Suppression impossible.')} — {deleteError.farm}</p>
              <p className="mt-2">{deleteError.message}</p>
            </div>
            <button type="button" aria-label={_ui('Fermer')} onClick={()=>setDeleteError(null)} className="p-1"><X size={18}/></button>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-sm">
            <Search size={14} className="text-fg-tertiary flex-shrink-0" />
            <TInput
              placeholder={_ui("Rechercher nom, code, ville, région…")}
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="border-none bg-transparent focus:ring-0 px-0"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary">
                <X size={14} />
              </button>
            )}
            <div className="ml-auto text-caption font-mono text-fg-tertiary">{filtered.length}/{items.length}</div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={_ui("Aucune ferme enregistrée")}
          description={_ui("Commence par créer ta première ferme pour piloter ton exploitation.")}
          action={<Button disabled={!hasPermission('fermes','create')} onClick={openNew}><Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouvelle ferme")}</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={_ui("Aucun résultat")}
          description={_ui("Aucune ferme ne correspond à ta recherche.")}
          action={<Button variant="ghost" onClick={() => setSearch('')}>{_ui("Réinitialiser")}</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          {filtered.map((f, i) => (
            <Card
              key={f.id}
              animate
              delay={0.05 + i * 0.04}
              interactive
              padding="none"
              className="overflow-hidden flex flex-col group"
            >
              <div className="h-1 bg-gradient-to-r from-brand to-brand/40" />
              <div className="p-lg flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-sm mb-md pb-md border-b border-border">
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-heading font-bold text-fg-primary uppercase tracking-tight truncate">
                      {f.name}
                    </div>
                    <div className="font-mono text-caption text-fg-tertiary mt-0.5 flex items-center gap-1.5">
                      <span className="font-semibold">{f.code}</span>
                      {f.city && (
                        <>
                          <span className="opacity-50">·</span>
                          <span className="flex items-center gap-1"><MapPin size={9} />{f.city}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant={f.is_active ? 'success' : 'default'} size="sm" dot={f.is_active}>
                    {f.is_active ? _ui("Active") : _ui("Inactive")}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-sm">
                  {[
                    { label: 'Ville', value: f.city || '—', icon: MapPin },
                    { label: 'Région', value: f.region || '—', icon: Globe },
                    { label: 'Superficie', value: f.total_area ? `${f.total_area} ha` : '—', icon: Maximize },
                    { label: 'Pays', value: f.country || '—', icon: Globe },
                  ].map((item, idx) => (
                    <div key={idx} className="rounded-md bg-surface-sunk border border-border px-md py-sm">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-tertiary mb-0.5">
                        {_uiNode(item.label)}
                      </div>
                      <div className="font-semibold text-body-sm text-fg-primary truncate">{item.value}</div>
                    </div>
                  ))}
                </div>

                {f.notes && (
                  <div className="mt-md text-caption text-fg-tertiary italic border-l-2 border-border pl-sm">
                    {f.notes}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-md pt-md border-t border-border">
                  <AuditHistoryButton table="farms" entity={f.id}/>
                  {hasPermission('fermes','edit') && <Button variant="secondary" disabled={saving||!!deletingId} onClick={()=>openEdit(f)}><Pencil size={14}/>{_ui('Modifier')}</Button>}
                  {hasPermission('fermes','delete') && <Button variant="ghost" disabled={saving||!!deletingId} onClick={()=>remove(f)} className="text-danger"><Trash2 size={14}/>{deletingId===f.id?_ui('Traitement en cours…'):_ui('Supprimer')}</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
