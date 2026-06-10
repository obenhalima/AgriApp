'use client'
/**
 * /admin/referentiels — Gestion no-code des listes déroulantes.
 *
 * Colonne gauche : liste des référentiels (reference_lists)
 * Colonne droite : valeurs éditables du référentiel sélectionné
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { List, Plus, Trash2, Save, GripVertical, Star, Eye, EyeOff, RefreshCw, X } from 'lucide-react'

import {
  type ReferenceList, type ReferenceValue,
  listReferenceLists, listReferenceValues,
  createReferenceValue, updateReferenceValue, deleteReferenceValue,
  createReferenceList,
} from '@/lib/referenceData'
import { useAuth } from '@/lib/auth'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Field, Input as TInput } from '@/components/ui/Input'
import { Modal, ModalFooter } from '@/components/ui/Modal'

export default function ReferentielsPage() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [lists, setLists] = useState<ReferenceList[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [values, setValues] = useState<ReferenceValue[]>([])
  const [loadingLists, setLoadingLists] = useState(true)
  const [loadingValues, setLoadingValues] = useState(false)

  // Modal ajout valeur
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ code: '', label: '', color: '' })
  const [saving, setSaving] = useState(false)

  // Modal nouvelle liste
  const [newListOpen, setNewListOpen] = useState(false)
  const [newListForm, setNewListForm] = useState({ key: '', label: '', description: '' })

  const loadLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const l = await listReferenceLists()
      setLists(l)
      if (l.length > 0 && !selectedKey) setSelectedKey(l[0].key)
    } catch (e: any) {
      toast.error(`Chargement listes : ${e.message ?? e}`)
    } finally {
      setLoadingLists(false)
    }
  }, [selectedKey])

  const loadValues = useCallback(async (key: string) => {
    if (!key) return
    setLoadingValues(true)
    try {
      setValues(await listReferenceValues(key))
    } catch (e: any) {
      toast.error(`Chargement valeurs : ${e.message ?? e}`)
    } finally {
      setLoadingValues(false)
    }
  }, [])

  useEffect(() => { loadLists() }, [loadLists])
  useEffect(() => { if (selectedKey) loadValues(selectedKey) }, [selectedKey, loadValues])

  const selectedList = useMemo(() => lists.find(l => l.key === selectedKey), [lists, selectedKey])

  // ─── Actions valeurs ───
  const handleAdd = async () => {
    if (!addForm.code.trim() || !addForm.label.trim()) { toast.error('Code et libellé requis'); return }
    setSaving(true)
    try {
      const maxOrder = values.reduce((m, v) => Math.max(m, v.order_idx), 0)
      await createReferenceValue({
        list_key: selectedKey,
        code: addForm.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        label: addForm.label.trim(),
        color: addForm.color || null,
        order_idx: maxOrder + 1,
      })
      toast.success('Valeur ajoutée')
      setAddOpen(false)
      setAddForm({ code: '', label: '', color: '' })
      await Promise.all([loadValues(selectedKey), loadLists()])
    } catch (e: any) {
      if (/duplicate key|unique/i.test(e.message ?? '')) toast.error('Ce code existe déjà dans cette liste')
      else toast.error(`Ajout échoué : ${e.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateLabel = async (v: ReferenceValue, label: string) => {
    if (label === v.label) return
    try {
      await updateReferenceValue(v.id, { label })
      setValues(prev => prev.map(x => x.id === v.id ? { ...x, label } : x))
    } catch (e: any) { toast.error(`MAJ échouée : ${e.message ?? e}`) }
  }

  const handleSetDefault = async (v: ReferenceValue) => {
    try {
      await updateReferenceValue(v.id, { is_default: true })
      setValues(prev => prev.map(x => ({ ...x, is_default: x.id === v.id })))
      toast.success(`"${v.label}" est la valeur par défaut`)
    } catch (e: any) { toast.error(`MAJ échouée : ${e.message ?? e}`) }
  }

  const handleToggleActive = async (v: ReferenceValue) => {
    try {
      await updateReferenceValue(v.id, { is_active: !v.is_active })
      setValues(prev => prev.map(x => x.id === v.id ? { ...x, is_active: !x.is_active } : x))
      toast.success(v.is_active ? 'Valeur désactivée' : 'Valeur réactivée')
    } catch (e: any) { toast.error(`MAJ échouée : ${e.message ?? e}`) }
  }

  const handleMove = async (v: ReferenceValue, dir: -1 | 1) => {
    const sorted = [...values].sort((a, b) => a.order_idx - b.order_idx)
    const idx = sorted.findIndex(x => x.id === v.id)
    const swap = sorted[idx + dir]
    if (!swap) return
    try {
      await Promise.all([
        updateReferenceValue(v.id, { order_idx: swap.order_idx }),
        updateReferenceValue(swap.id, { order_idx: v.order_idx }),
      ])
      await loadValues(selectedKey)
    } catch (e: any) { toast.error(`Réordonnancement échoué : ${e.message ?? e}`) }
  }

  const handleNewList = async () => {
    if (!newListForm.key.trim() || !newListForm.label.trim()) { toast.error('Clé et libellé requis'); return }
    setSaving(true)
    try {
      const created = await createReferenceList(newListForm)
      toast.success('Liste créée')
      setNewListOpen(false)
      setNewListForm({ key: '', label: '', description: '' })
      await loadLists()
      setSelectedKey(created.key)
    } catch (e: any) {
      if (/duplicate key|unique/i.test(e.message ?? '')) toast.error('Cette clé existe déjà')
      else toast.error(`Création échouée : ${e.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) return <div className="p-md"><Skeleton className="h-12 w-64" /></div>
  if (!isAdmin) return (
    <div className="p-md"><Card><div className="p-md text-center">
      <h2 className="text-heading-sm font-bold text-fg-primary mb-sm">Accès réservé</h2>
      <p className="text-body-sm text-fg-secondary">Cette page est réservée aux administrateurs.</p>
    </div></Card></div>
  )

  return (
    <div className="p-md">
      <PageHeader
        icon={List}
        title="Référentiels"
        description="Gérez les listes déroulantes de l'application sans code (types, catégories, unités…)"
        actions={
          <Button variant="ghost" onClick={() => setNewListOpen(true)}>
            <Plus size={14} strokeWidth={2.5} /> Nouvelle liste
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-md mt-md">
        {/* ─── Colonne gauche : listes ─── */}
        <Card padding="none" className="overflow-hidden h-fit">
          <div className="px-md py-sm border-b border-border flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold">Listes</span>
            <button onClick={loadLists} className="text-fg-tertiary hover:text-fg-primary"><RefreshCw size={12} /></button>
          </div>
          {loadingLists ? (
            <div className="p-md space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : (
            <div className="divide-y divide-border">
              {lists.map(l => (
                <button
                  key={l.key}
                  onClick={() => setSelectedKey(l.key)}
                  className={`w-full text-left px-md py-2.5 transition-colors flex items-center justify-between gap-2 ${
                    selectedKey === l.key ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-surface-hover border-l-2 border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className={`text-body-sm font-semibold truncate ${selectedKey === l.key ? 'text-primary' : 'text-fg-primary'}`}>{l.label}</div>
                    <div className="font-mono text-[10px] text-fg-tertiary truncate">{l.key}</div>
                  </div>
                  <Badge variant="default" size="xs">{l.value_count}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* ─── Colonne droite : valeurs ─── */}
        <Card padding="none" className="overflow-hidden">
          {!selectedList ? (
            <EmptyState icon={List} title="Sélectionne une liste" description="Choisis un référentiel à gauche pour éditer ses valeurs." />
          ) : (
            <>
              <div className="px-md py-sm border-b border-border flex items-center justify-between gap-md flex-wrap">
                <div>
                  <div className="font-display text-heading-sm font-bold text-fg-primary">{selectedList.label}</div>
                  {selectedList.description && <div className="text-body-sm text-fg-secondary">{selectedList.description}</div>}
                </div>
                <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={13} strokeWidth={2.5} /> Ajouter une valeur
                </Button>
              </div>

              {loadingValues ? (
                <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : values.length === 0 ? (
                <EmptyState icon={Plus} title="Aucune valeur" description="Ajoute la première valeur de cette liste." />
              ) : (
                <div className="divide-y divide-border">
                  {values.map((v, i) => (
                    <div key={v.id} className={`flex items-center gap-sm px-md py-2 ${!v.is_active ? 'opacity-50' : ''}`}>
                      {/* Réordonnancement */}
                      <div className="flex flex-col">
                        <button onClick={() => handleMove(v, -1)} disabled={i === 0} className="text-fg-tertiary hover:text-fg-primary disabled:opacity-20 leading-none text-[10px]">▲</button>
                        <button onClick={() => handleMove(v, 1)} disabled={i === values.length - 1} className="text-fg-tertiary hover:text-fg-primary disabled:opacity-20 leading-none text-[10px]">▼</button>
                      </div>

                      {/* Code (immuable) */}
                      <code className="font-mono text-[11px] text-fg-tertiary bg-surface-sunk px-2 py-1 rounded min-w-[120px]">{v.code}</code>

                      {/* Label (éditable) */}
                      <input
                        defaultValue={v.label}
                        onBlur={(e) => handleUpdateLabel(v, e.target.value)}
                        className="form-input flex-1 min-w-[140px]"
                        style={{ height: 32 }}
                      />

                      {/* Default */}
                      <button
                        onClick={() => handleSetDefault(v)}
                        title={v.is_default ? 'Valeur par défaut' : 'Définir par défaut'}
                        className={v.is_default ? 'text-warning' : 'text-fg-tertiary hover:text-warning'}
                      >
                        <Star size={16} fill={v.is_default ? 'currentColor' : 'none'} />
                      </button>

                      {/* Actif */}
                      <button
                        onClick={() => handleToggleActive(v)}
                        title={v.is_active ? 'Désactiver' : 'Réactiver'}
                        className="text-fg-tertiary hover:text-fg-primary"
                      >
                        {v.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-md py-sm border-t border-border text-caption text-fg-tertiary">
                💡 Le <strong>code</strong> est immuable (utilisé en base). Modifie seulement le <strong>libellé affiché</strong>.
                Désactive plutôt que supprimer pour préserver les données existantes.
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ─── Modal ajout valeur ─── */}
      {addOpen && (
        <Modal title={`Ajouter à « ${selectedList?.label} »`} onClose={() => setAddOpen(false)}>
          <div className="space-y-md">
            <Field label="Code (technique, sans espaces)" required>
              <TInput
                value={addForm.code}
                onChange={(e) => setAddForm(f => ({ ...f, code: e.target.value }))}
                placeholder="ex: nouveau_type"
                autoFocus
              />
              <div className="text-caption text-fg-tertiary mt-1">Sera normalisé en minuscules + underscores.</div>
            </Field>
            <Field label="Libellé affiché" required>
              <TInput
                value={addForm.label}
                onChange={(e) => setAddForm(f => ({ ...f, label: e.target.value }))}
                placeholder="ex: Nouveau type"
              />
            </Field>
            <Field label="Couleur (optionnel, hex)">
              <TInput
                value={addForm.color}
                onChange={(e) => setAddForm(f => ({ ...f, color: e.target.value }))}
                placeholder="#10b981"
              />
            </Field>
            <ModalFooter onCancel={() => setAddOpen(false)} onSave={handleAdd} loading={saving} disabled={!addForm.code || !addForm.label} saveLabel="AJOUTER" />
          </div>
        </Modal>
      )}

      {/* ─── Modal nouvelle liste ─── */}
      {newListOpen && (
        <Modal title="Nouvelle liste de référence" onClose={() => setNewListOpen(false)}>
          <div className="space-y-md">
            <Field label="Clé technique (unique)" required>
              <TInput
                value={newListForm.key}
                onChange={(e) => setNewListForm(f => ({ ...f, key: e.target.value }))}
                placeholder="ex: payment_method"
                autoFocus
              />
            </Field>
            <Field label="Libellé" required>
              <TInput
                value={newListForm.label}
                onChange={(e) => setNewListForm(f => ({ ...f, label: e.target.value }))}
                placeholder="ex: Modes de paiement"
              />
            </Field>
            <Field label="Description (optionnel)">
              <TInput
                value={newListForm.description}
                onChange={(e) => setNewListForm(f => ({ ...f, description: e.target.value }))}
                placeholder="À quoi sert cette liste"
              />
            </Field>
            <ModalFooter onCancel={() => setNewListOpen(false)} onSave={handleNewList} loading={saving} disabled={!newListForm.key || !newListForm.label} saveLabel="CRÉER" />
          </div>
        </Modal>
      )}
    </div>
  )
}
