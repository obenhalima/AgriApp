'use client'
/**
 * /fermes — Refonte avec design system.
 */
import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Building2, Plus, MapPin, Globe, Maximize, Search, X,
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

export default function FermesPage() {
  const { activeDomain } = useAuth()
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
    getFarms(activeDomain.domain_id).then(d => { setItems(d); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [activeDomain?.domain_id])

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
    setForm({
      code: genCode('F', items.map(i => i.code)),
      name: '', address: '', city: '', region: '', country: 'Maroc',
      total_area: '', notes: '',
    })
    setModal(true)
  }

  const save = async () => {
    if (!form.name || !activeDomain) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('farms').insert({
        domain_id: activeDomain.domain_id,
        code: form.code, name: form.name, address: form.address, city: form.city,
        region: form.region, country: form.country || 'Maroc',
        total_area: form.total_area ? Number(form.total_area) : null,
        notes: form.notes, is_active: true,
      }).select().single()
      if (error) throw error
      setItems(p => [data, ...p])
      setDone(true)
      toast.success(`Ferme "${data.name}" créée`)
      setTimeout(() => { setModal(false); setDone(false) }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  return (
    <div>
      {modal && (
        <Modal title="NOUVELLE FERME" onClose={() => { setModal(false); setDone(false) }}>
          {done ? <SuccessMessage message="Ferme créée avec succès !" /> : (
            <div className="space-y-md">
              <div className="grid grid-cols-2 gap-md">
                <Field label="Code (auto-généré)"><TInput value={form.code} onChange={upd('code')} placeholder="F01" /></Field>
                <Field label="Nom de la ferme" required><TInput value={form.name} onChange={upd('name')} placeholder="Domaine Souss Agri" autoFocus /></Field>
              </div>
              <Field label="Adresse"><TInput value={form.address} onChange={upd('address')} placeholder="Route d'Agadir Km 15" /></Field>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Ville"><TInput value={form.city} onChange={upd('city')} placeholder="Aït Melloul" /></Field>
                <Field label="Région"><TInput value={form.region} onChange={upd('region')} placeholder="Souss-Massa" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Pays"><TInput value={form.country} onChange={upd('country')} /></Field>
                <Field label="Superficie totale (ha)"><TInput type="number" value={form.total_area} onChange={upd('total_area')} placeholder="5.2" /></Field>
              </div>
              <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={upd('notes')} /></Field>
              <ModalFooter onCancel={() => setModal(false)} onSave={save} loading={saving} disabled={!form.name} saveLabel="CRÉER LA FERME" />
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title="Fermes"
        subtitle="Exploitation"
        icon={Building2}
        iconColor="#64748b"
        description={`${items.length} ferme${items.length > 1 ? 's' : ''} enregistrée${items.length > 1 ? 's' : ''}`}
        actions={
          <Button onClick={openNew} variant="primary">
            <Plus size={14} strokeWidth={2.5} /> Nouvelle ferme
          </Button>
        }
        stats={loading ? [] : [
          { label: 'Total',     value: String(stats.count),                                               icon: Building2, color: '#64748b' },
          { label: 'Superficie', value: <AreaDisplay value={stats.totalArea} showTooltip={false} className="!text-current" />, icon: Maximize,  color: '#10b981' },
          { label: 'Villes',     value: String(stats.cities),                                            icon: MapPin,    color: '#3b82f6' },
          { label: 'Régions',    value: String(stats.regions),                                          icon: Globe,     color: '#a855f7' },
        ]}
      />

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-sm">
            <Search size={14} className="text-fg-tertiary flex-shrink-0" />
            <TInput
              placeholder="Rechercher nom, code, ville, région…"
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
          title="Aucune ferme enregistrée"
          description="Commence par créer ta première ferme pour piloter ton exploitation."
          action={<Button onClick={openNew}><Plus size={14} strokeWidth={2.5} /> Nouvelle ferme</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Aucun résultat"
          description="Aucune ferme ne correspond à ta recherche."
          action={<Button variant="ghost" onClick={() => setSearch('')}>Réinitialiser</Button>}
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
                    {f.is_active ? 'Active' : 'Inactive'}
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
                        {item.label}
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
