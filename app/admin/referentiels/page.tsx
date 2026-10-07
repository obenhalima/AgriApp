'use client'
import {useLanguage} from '@/lib/i18n'

/**
 * /admin/referentiels — Gestion no-code des listes déroulantes.
 *
 * Colonne gauche : liste des référentiels (reference_lists)
 * Colonne droite : valeurs éditables du référentiel sélectionné
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { List, Plus, Trash2, Save, GripVertical, Star, Eye, EyeOff, RefreshCw, X, Download, Upload } from 'lucide-react'

import {
  type ReferenceList, type ReferenceValue,
  listReferenceLists, listReferenceValues,
  createReferenceValue, updateReferenceValue, deleteReferenceValue, hardDeleteReferenceValue,
  createReferenceList, countUsage, exportReferentielsXlsx, importReferentielsXlsx,
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
 const {t:_ui,text:_uiNode}=useLanguage()

  const { isAdmin, loading: authLoading } = useAuth()

  const [lists, setLists] = useState<ReferenceList[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [values, setValues] = useState<ReferenceValue[]>([])
  const [loadingLists, setLoadingLists] = useState(true)
  const [loadingValues, setLoadingValues] = useState(false)

  // Modal ajout valeur
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ code: '', label: '', color: '', poids_kg: '' })
  const [saving, setSaving] = useState(false)

  // Listes ayant un poids unitaire éditable (metadata.poids_kg) — ex: types de plateaux
  const WEIGHTED_LISTS = ['tray_type']
  const hasWeight = WEIGHTED_LISTS.includes(selectedKey)

  // Modal nouvelle liste
  const [newListOpen, setNewListOpen] = useState(false)
  const [newListForm, setNewListForm] = useState({ key: '', label: '', description: '' })

  // P4 — drag & drop (index en cours de glissement)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  // P4 — import fichier
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const l = await listReferenceLists()
      setLists(l)
      if (l.length > 0 && !selectedKey) setSelectedKey(l[0].key)
    } catch (e: any) {
      toast.error(_ui("Chargement listes : {v0}",{v0:String(e.message ?? e)}))
    } finally {
      setLoadingLists(false)
    }
  }, [selectedKey,_ui])

  const loadValues = useCallback(async (key: string) => {
    if (!key) return
    setLoadingValues(true)
    try {
      setValues(await listReferenceValues(key))
    } catch (e: any) {
      toast.error(_ui("Chargement valeurs : {v0}",{v0:String(e.message ?? e)}))
    } finally {
      setLoadingValues(false)
    }
  }, [_ui])

  useEffect(() => { loadLists() }, [loadLists])
  useEffect(() => { if (selectedKey) loadValues(selectedKey) }, [selectedKey, loadValues])

  const selectedList = useMemo(() => lists.find(l => l.key === selectedKey), [lists, selectedKey])

  // ─── Actions valeurs ───
  const handleAdd = async () => {
    if (!addForm.code.trim() || !addForm.label.trim()) { toast.error(_ui("Code et libellé requis")); return }
    setSaving(true)
    try {
      const maxOrder = values.reduce((m, v) => Math.max(m, v.order_idx), 0)
      await createReferenceValue({
        list_key: selectedKey,
        code: addForm.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        label: addForm.label.trim(),
        color: addForm.color || null,
        order_idx: maxOrder + 1,
        metadata: hasWeight ? { poids_kg: Number(addForm.poids_kg) || 0 } : undefined,
      })
      toast.success(_ui("Valeur ajoutée"))
      setAddOpen(false)
      setAddForm({ code: '', label: '', color: '', poids_kg: '' })
      await Promise.all([loadValues(selectedKey), loadLists()])
    } catch (e: any) {
      if (/duplicate key|unique/i.test(e.message ?? '')) toast.error(_ui("Ce code existe déjà dans cette liste"))
      else toast.error(_ui("Ajout échoué : {v0}",{v0:String(e.message ?? e)}))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateLabel = async (v: ReferenceValue, label: string) => {
    if (label === v.label) return
    try {
      await updateReferenceValue(v.id, { label })
      setValues(prev => prev.map(x => x.id === v.id ? { ...x, label } : x))
    } catch (e: any) { toast.error(_ui("MAJ échouée : {v0}",{v0:String(e.message ?? e)})) }
  }

  // Édition du poids unitaire (metadata.poids_kg) — listes pondérées (plateaux)
  const handleUpdateWeight = async (v: ReferenceValue, kgStr: string) => {
    const kg = Number(kgStr) || 0
    if (kg === Number(v.metadata?.poids_kg ?? 0)) return
    const metadata = { ...(v.metadata ?? {}), poids_kg: kg }
    try {
      await updateReferenceValue(v.id, { metadata })
      setValues(prev => prev.map(x => x.id === v.id ? { ...x, metadata } : x))
    } catch (e: any) { toast.error(_ui("MAJ échouée : {v0}",{v0:String(e.message ?? e)})) }
  }

  const handleSetDefault = async (v: ReferenceValue) => {
    try {
      await updateReferenceValue(v.id, { is_default: true })
      setValues(prev => prev.map(x => ({ ...x, is_default: x.id === v.id })))
      toast.success(_ui("\"{v0}\" est la valeur par défaut",{v0:String(v.label)}))
    } catch (e: any) { toast.error(_ui("MAJ échouée : {v0}",{v0:String(e.message ?? e)})) }
  }

  const applyToggle = async (v: ReferenceValue) => {
    try {
      await updateReferenceValue(v.id, { is_active: !v.is_active })
      setValues(prev => prev.map(x => x.id === v.id ? { ...x, is_active: !x.is_active } : x))
      toast.success(v.is_active ? _ui("Valeur désactivée") : _ui("Valeur réactivée"))
    } catch (e: any) { toast.error(_ui("MAJ échouée : {v0}",{v0:String(e.message ?? e)})) }
  }

  const handleToggleActive = async (v: ReferenceValue) => {
    // Réactivation : pas de garde-fou
    if (!v.is_active) { applyToggle(v); return }
    // Désactivation : vérifie d'abord combien de lignes utilisent ce code
    let used = -1
    try { used = await countUsage(selectedKey, v.code) } catch { used = -1 }
    if (used > 0) {
      const ok = window.confirm(
        _ui("⚠️ \"{v0}\" est utilisé par {v1} enregistrement(s).",{v0:String(v.label),v1:String(used)}) +
        _ui("La désactiver l'empêchera d'être choisi dans les nouveaux formulaires,") +
        _ui("mais les {v0} enregistrement(s) existant(s) la conserveront.",{v0:String(used)}) +
        _ui("Désactiver quand même ?")
      )
      if (!ok) return
    }
    applyToggle(v)
  }

  // Suppression définitive — autorisée uniquement si la valeur n'est utilisée nulle part.
  // Sinon on redirige vers la désactivation (préserve les données existantes).
  const handleDelete = async (v: ReferenceValue) => {
    let used = -1
    try { used = await countUsage(selectedKey, v.code) } catch { used = -1 }
    if (used > 0) {
      toast.error(
        _ui("« {v0} » est utilisé par {v1} enregistrement(s) — impossible de supprimer.",{v0:String(v.label),v1:String(used)}) +
        _ui("Désactive-la (👁) à la place : elle disparaît des listes mais l'historique est préservé."),
        { duration: 8000 },
      )
      return
    }
    const note = used === 0
      ? 'Cette valeur n\'est utilisée nulle part.'
      : 'L\'usage de cette liste n\'est pas tracé — vérifie qu\'elle n\'est pas référencée ailleurs.'
    if (!window.confirm(_ui("Supprimer définitivement « {v0} » ? {v1} Suppression irréversible.",{v0:String(v.label),v1:String(note)}))) return
    try {
      await hardDeleteReferenceValue(v.id)
      setValues(prev => prev.filter(x => x.id !== v.id))
      await loadLists()  // rafraîchit le compteur de la liste
      toast.success(_ui("Valeur supprimée"))
    } catch (e: any) {
      toast.error(_ui("Suppression échouée : {v0}",{v0:String(e.message ?? e)}))
    }
  }

  // P4 — drag & drop : réordonne `values` et persiste les nouveaux order_idx
  const handleDrop = async (targetIdx: number) => {
    const from = dragIdx
    setDragIdx(null); setOverIdx(null)
    if (from === null || from === targetIdx) return
    const reordered = [...values]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(targetIdx, 0, moved)
    // Réindexe localement (1..n) puis persiste
    const withIdx = reordered.map((v, i) => ({ ...v, order_idx: i + 1 }))
    setValues(withIdx)
    try {
      await Promise.all(withIdx.map(v => updateReferenceValue(v.id, { order_idx: v.order_idx })))
    } catch (e: any) {
      toast.error(_ui("Réordonnancement échoué : {v0}",{v0:String(e.message ?? e)}))
      loadValues(selectedKey)
    }
  }

  // P4 — export : télécharge un classeur Excel (.xlsx) de toute la config
  const handleExport = async () => {
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const buf = await exportReferentielsXlsx()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `referentiels-${stamp}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(_ui("Export Excel téléchargé"))
    } catch (e: any) { toast.error(_ui("Export échoué : {v0}",{v0:String(e.message ?? e)})) }
  }

  // P4 — import : lit un fichier Excel (.xlsx) et upsert
  const handleImportFile = async (file: File) => {
    try {
      const res = await importReferentielsXlsx(file)
      toast.success(
        _ui("Import : {v0} valeur(s) dans {v1} liste(s)",{v0:String(res.values),v1:String(res.lists)}) +
        (res.skipped > 0 ? _ui("— {v0} ligne(s) ignorée(s)",{v0:String(res.skipped)}) : '')
      )
      await loadLists()
      if (selectedKey) await loadValues(selectedKey)
    } catch (e: any) {
      toast.error(_ui("Import échoué : {v0}",{v0:String(e.message ?? e)}))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleNewList = async () => {
    if (!newListForm.key.trim() || !newListForm.label.trim()) { toast.error(_ui("Clé et libellé requis")); return }
    setSaving(true)
    try {
      const created = await createReferenceList(newListForm)
      toast.success(_ui("Liste créée"))
      setNewListOpen(false)
      setNewListForm({ key: '', label: '', description: '' })
      await loadLists()
      setSelectedKey(created.key)
    } catch (e: any) {
      if (/duplicate key|unique/i.test(e.message ?? '')) toast.error(_ui("Cette clé existe déjà"))
      else toast.error(_ui("Création échouée : {v0}",{v0:String(e.message ?? e)}))
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) return <div className="p-md"><Skeleton className="h-12 w-64" /></div>
  if (!isAdmin) return (
    <div className="p-md"><Card><div className="p-md text-center">
      <h2 className="text-heading-sm font-bold text-fg-primary mb-sm">{_ui("Accès réservé")}</h2>
      <p className="text-body-sm text-fg-secondary">{_ui("Cette page est réservée aux administrateurs.")}</p>
    </div></Card></div>
  )

  return (
    <div className="p-md">
      <PageHeader
        icon={List}
        title={_ui("Référentiels")}
        description={_ui("Gérez les listes déroulantes de l'application sans code (types, catégories, unités…)")}
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
            />
            <Button variant="ghost" size="sm" onClick={handleExport} title={_ui("Télécharger toutes les listes en Excel")}>
              <Download size={14} strokeWidth={2.5} /> {" "}{_ui("Exporter Excel")}{" "}</Button>
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title={_ui("Importer un fichier Excel (édité)")}>
              <Upload size={14} strokeWidth={2.5} /> {" "}{_ui("Importer Excel")}{" "}</Button>
            <Button variant="ghost" size="sm" onClick={() => setNewListOpen(true)}>
              <Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouvelle liste")}{" "}</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-md mt-md">
        {/* ─── Colonne gauche : listes ─── */}
        <Card padding="none" className="overflow-hidden h-fit">
          <div className="px-md py-sm border-b border-border flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold">{_ui("Listes")}</span>
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
                    <div className={`text-body-sm font-semibold truncate ${selectedKey === l.key ? 'text-primary' : 'text-fg-primary'}`}>{_uiNode(l.label)}</div>
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
            <EmptyState icon={List} title={_ui("Sélectionne une liste")} description={_ui("Choisis un référentiel à gauche pour éditer ses valeurs.")} />
          ) : (
            <>
              <div className="px-md py-sm border-b border-border flex items-center justify-between gap-md flex-wrap">
                <div>
                  <div className="font-display text-heading-sm font-bold text-fg-primary">{_uiNode(selectedList.label)}</div>
                  {selectedList.description && <div className="text-body-sm text-fg-secondary">{_uiNode(selectedList.description)}</div>}
                </div>
                <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={13} strokeWidth={2.5} /> {" "}{_ui("Ajouter une valeur")}{" "}</Button>
              </div>

              {loadingValues ? (
                <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : values.length === 0 ? (
                <EmptyState icon={Plus} title={_ui("Aucune valeur")} description={_ui("Ajoute la première valeur de cette liste.")} />
              ) : (
                <div className="divide-y divide-border">
                  {values.map((v, i) => (
                    <div
                      key={v.id}
                      draggable
                      onDragStart={() => setDragIdx(i)}
                      onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i) }}
                      onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                      onDrop={(e) => { e.preventDefault(); handleDrop(i) }}
                      className={`flex items-center gap-sm px-md py-2 transition-colors ${!v.is_active ? 'opacity-50' : ''} ${
                        dragIdx === i ? 'opacity-40' : ''
                      } ${overIdx === i && dragIdx !== null && dragIdx !== i ? 'bg-primary/10 border-t-2 border-primary' : ''}`}
                    >
                      {/* Poignée de glissement */}
                      <GripVertical size={15} className="text-fg-tertiary cursor-grab active:cursor-grabbing shrink-0" />

                      {/* Code (immuable) */}
                      <code className="font-mono text-[11px] text-fg-tertiary bg-surface-sunk px-2 py-1 rounded min-w-[120px]">{v.code}</code>

                      {/* Label (éditable) */}
                      <input
                        defaultValue={v.label}
                        onBlur={(e) => handleUpdateLabel(v, e.target.value)}
                        className="form-input flex-1 min-w-[140px]"
                        style={{ height: 32 }}
                      />

                      {/* Poids unitaire (listes pondérées : plateaux) */}
                      {hasWeight && (
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            defaultValue={String(v.metadata?.poids_kg ?? '')}
                            onBlur={(e) => handleUpdateWeight(v, e.target.value)}
                            className="form-input w-20 text-right"
                            style={{ height: 32 }}
                            placeholder="0"
                          />
                          <span className="text-caption text-fg-tertiary">kg</span>
                        </div>
                      )}

                      {/* Default */}
                      <button
                        onClick={() => handleSetDefault(v)}
                        title={v.is_default ? _ui("Valeur par défaut") : _ui("Définir par défaut")}
                        className={v.is_default ? 'text-warning' : 'text-fg-tertiary hover:text-warning'}
                      >
                        <Star size={16} fill={v.is_default ? 'currentColor' : 'none'} />
                      </button>

                      {/* Actif */}
                      <button
                        onClick={() => handleToggleActive(v)}
                        title={v.is_active ? _ui("Désactiver (masque la valeur, garde l'historique)") : _ui("Réactiver")}
                        className="text-fg-tertiary hover:text-fg-primary"
                      >
                        {v.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>

                      {/* Supprimer définitivement (si non utilisée) */}
                      <button
                        onClick={() => handleDelete(v)}
                        title={_ui("Supprimer définitivement (uniquement si non utilisée)")}
                        className="text-fg-tertiary hover:text-danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-md py-sm border-t border-border text-caption text-fg-tertiary">
                {" "}{_ui("💡 Le")}{" "}<strong>{_ui("code")}</strong> {" "}{_ui("est immuable (utilisé en base). Modifie seulement le")}{" "}<strong>{_ui("libellé affiché")}</strong>{_ui(". Glisse les lignes")}{" "}<GripVertical size={11} className="inline -mt-0.5" /> {" "}{_ui("pour réordonner.")}{" "}<strong>{_ui("Désactiver")}</strong> <Eye size={11} className="inline -mt-0.5" /> {" "}{_ui("masque la valeur mais garde l'historique (recommandé si elle a déjà servi).")}{" "}<strong>{_ui("Supprimer")}</strong> <Trash2 size={11} className="inline -mt-0.5" /> {" "}{_ui("l'efface définitivement — possible seulement si elle n'est utilisée nulle part. Pour éditer en masse :")}{" "}<strong>{_ui("Exporter Excel")}</strong> {" "}{_ui("→ modifier dans Excel →")}{" "}<strong>{_ui("Importer Excel")}</strong>.
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ─── Modal ajout valeur ─── */}
      {addOpen && (
        <Modal title={_ui("Ajouter à « {v0} »",{v0:String(selectedList?.label)})} onClose={() => setAddOpen(false)}>
          <div className="space-y-md">
            <Field label={_ui("Code (technique, sans espaces)")} required>
              <TInput
                value={addForm.code}
                onChange={(e) => setAddForm(f => ({ ...f, code: e.target.value }))}
                placeholder={_ui("ex: nouveau_type")}
                autoFocus
              />
              <div className="text-caption text-fg-tertiary mt-1">{_ui("Sera normalisé en minuscules + underscores.")}</div>
            </Field>
            <Field label={_ui("Libellé affiché")} required>
              <TInput
                value={addForm.label}
                onChange={(e) => setAddForm(f => ({ ...f, label: e.target.value }))}
                placeholder={_ui("ex: Nouveau type")}
              />
            </Field>
            {hasWeight && (
              <Field label={_ui("Poids unitaire (kg)")} required>
                <TInput
                  type="number"
                  value={addForm.poids_kg}
                  onChange={(e) => setAddForm(f => ({ ...f, poids_kg: e.target.value }))}
                  placeholder={_ui("ex: 10")}
                />
                <div className="text-caption text-fg-tertiary mt-1">{_ui("Poids théorique d'un plateau de ce type — sert à estimer le tonnage.")}</div>
              </Field>
            )}
            <Field label={_ui("Couleur (optionnel, hex)")}>
              <TInput
                value={addForm.color}
                onChange={(e) => setAddForm(f => ({ ...f, color: e.target.value }))}
                placeholder="#10b981"
              />
            </Field>
            <ModalFooter onCancel={() => setAddOpen(false)} onSave={handleAdd} loading={saving} disabled={!addForm.code || !addForm.label || (hasWeight && !addForm.poids_kg)} saveLabel={_ui("AJOUTER")} />
          </div>
        </Modal>
      )}

      {/* ─── Modal nouvelle liste ─── */}
      {newListOpen && (
        <Modal title={_ui("Nouvelle liste de référence")} onClose={() => setNewListOpen(false)}>
          <div className="space-y-md">
            <Field label={_ui("Clé technique (unique)")} required>
              <TInput
                value={newListForm.key}
                onChange={(e) => setNewListForm(f => ({ ...f, key: e.target.value }))}
                placeholder={_ui("ex: payment_method")}
                autoFocus
              />
            </Field>
            <Field label={_ui("Libellé")} required>
              <TInput
                value={newListForm.label}
                onChange={(e) => setNewListForm(f => ({ ...f, label: e.target.value }))}
                placeholder={_ui("ex: Modes de paiement")}
              />
            </Field>
            <Field label={_ui("Description (optionnel)")}>
              <TInput
                value={newListForm.description}
                onChange={(e) => setNewListForm(f => ({ ...f, description: e.target.value }))}
                placeholder={_ui("À quoi sert cette liste")}
              />
            </Field>
            <ModalFooter onCancel={() => setNewListOpen(false)} onSave={handleNewList} loading={saving} disabled={!newListForm.key || !newListForm.label} saveLabel={_ui("CRÉER")} />
          </div>
        </Modal>
      )}
    </div>
  )
}
