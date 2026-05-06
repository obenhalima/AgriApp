'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BookText, Plus, Pencil, Power, RotateCcw, Trash2, ChevronDown, ChevronRight, ChevronsUpDown, ChevronsDownUp } from 'lucide-react'
import {
  AccountCategory, AccountCategoryNode, AccountCategoryType,
  TYPE_LABELS, TYPE_COLORS,
  listAccountCategories, buildTree, toggleAccountCategoryActive, deleteAccountCategory,
} from '@/lib/accountCategories'
import { AccountCategoryModal } from '@/components/accounting/AccountCategoryModal'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Select as TSelect } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

export default function AccountCategoriesAdminPage() {
  const [flat, setFlat] = useState<AccountCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filterType, setFilterType] = useState<AccountCategoryType | 'all'>('all')
  const [showInactive, setShowInactive] = useState(false)

  const [modalState, setModalState] = useState<
    | { kind: 'create_root' }
    | { kind: 'create_child'; parent: AccountCategory }
    | { kind: 'edit'; category: AccountCategory }
    | null
  >(null)

  const load = async () => {
    try {
      setLoading(true)
      const list = await listAccountCategories()
      setFlat(list)
      const toOpen = new Set<string>()
      list.forEach(c => { if (c.level <= 2) toOpen.add(c.id) })
      setExpanded(toOpen)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const tree = useMemo(() => buildTree(
    flat.filter(c => (showInactive || c.is_active) && (filterType === 'all' || c.type === filterType))
  ), [flat, filterType, showInactive])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleToggleActive = async (c: AccountCategory) => {
    const verb = c.is_active ? 'désactiver' : 'réactiver'
    if (!confirm(`Vous voulez ${verb} "${c.label}" ?`)) return
    try {
      const u = await toggleAccountCategoryActive(c.id, !c.is_active)
      setFlat(prev => prev.map(x => x.id === c.id ? u : x))
      toast.success(c.is_active ? 'Catégorie désactivée' : 'Catégorie réactivée')
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (c: AccountCategory) => {
    if (!confirm(`Supprimer définitivement "${c.label}" ?`)) return
    try {
      await deleteAccountCategory(c.id)
      setFlat(prev => prev.filter(x => x.id !== c.id))
      toast.success('Catégorie supprimée')
    } catch (e: any) { toast.error('Suppression impossible : ' + e.message) }
  }

  const handleSaved = (saved: AccountCategory) => {
    setFlat(prev => {
      const exists = prev.find(x => x.id === saved.id)
      return exists ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]
    })
    setModalState(null)
    toast.success('Catégorie enregistrée')
  }

  const countByType = useMemo(() => {
    const c: Record<AccountCategoryType, number> = { produit: 0, charge_variable: 0, charge_fixe: 0, amortissement: 0 }
    flat.forEach(x => { if (x.is_active) c[x.type]++ })
    return c
  }, [flat])

  const renderNode = (node: AccountCategoryNode, depth: number) => {
    const hasChildren = node.children.length > 0
    const isOpen = expanded.has(node.id)
    const color = TYPE_COLORS[node.type]
    return (
      <div key={node.id}>
        <div className={cn(
          'flex items-center gap-sm px-md py-2 border-b border-border last:border-b-0',
          depth === 0 && 'bg-surface-sunk',
          !node.is_active && 'opacity-55'
        )}>
          <div style={{ width: depth * 18 }} className="flex-shrink-0" />
          {hasChildren ? (
            <button onClick={() => toggleExpand(node.id)} className="text-fg-secondary hover:text-fg-primary p-1 transition-colors">
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : <div className="w-5" />}
          <span className="w-2 h-2 rounded flex-shrink-0" style={{ background: color }} />
          <code className="font-mono text-[10px] text-fg-tertiary min-w-[110px]">{node.code}</code>
          <strong className={cn('font-display', depth === 0 ? 'text-body font-bold' : 'text-body-sm font-medium')}>{node.label}</strong>
          {node.default_depreciation_years != null && (
            <span className="font-mono text-[10px] text-fg-tertiary">({node.default_depreciation_years} ans)</span>
          )}
          {!node.is_active && <Badge variant="default" size="xs">inactif</Badge>}
          <div className="flex-1" />
          {node.level < 3 && (
            <Button onClick={() => setModalState({ kind: 'create_child', parent: node })} variant="ghost" size="xs" title="Sous-catégorie">
              <Plus size={11} /> enfant
            </Button>
          )}
          <Button onClick={() => setModalState({ kind: 'edit', category: node })} variant="ghost" size="icon-sm" title="Modifier">
            <Pencil size={11} strokeWidth={2.2} />
          </Button>
          <Button onClick={() => handleToggleActive(node)} variant="ghost" size="icon-sm" title={node.is_active ? 'Désactiver' : 'Réactiver'} className={node.is_active ? 'hover:text-warning' : 'hover:text-success'}>
            {node.is_active ? <Power size={11} strokeWidth={2.2} /> : <RotateCcw size={11} strokeWidth={2.2} />}
          </Button>
          <Button onClick={() => handleDelete(node)} variant="ghost" size="icon-sm" title="Supprimer" className="hover:text-danger">
            <Trash2 size={11} strokeWidth={2.2} />
          </Button>
        </div>
        {hasChildren && isOpen && node.children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Plan comptable" subtitle="Paramétrage" icon={BookText} iconColor="#0ea5e9"
        description="Hiérarchie des catégories utilisée pour le CPC, le budget et les rapports"
        actions={<Button onClick={() => setModalState({ kind: 'create_root' })} variant="primary"><Plus size={14} strokeWidth={2.5} /> Catégorie racine</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-md">
        {(['produit', 'charge_variable', 'charge_fixe', 'amortissement'] as AccountCategoryType[]).map((t, i) => {
          const color = TYPE_COLORS[t].replace('var(--neon)', '#10b981').replace('var(--amber)', '#f59e0b').replace('var(--blue)', '#3b82f6').replace('var(--purple)', '#a855f7')
          return (
            <Card key={t} animate delay={i * 0.04} padding="md" className="border-l-[3px]" style={{ borderLeftColor: color } as any}>
              <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold">{TYPE_LABELS[t]}</div>
              <div className="font-display text-display-sm font-extrabold mt-1" style={{ color }}>{countByType[t]}</div>
            </Card>
          )
        })}
      </div>

      <Card animate delay={0.2} className="mb-md">
        <div className="flex flex-wrap gap-md items-center">
          <div className="flex items-center gap-sm">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary">TYPE :</span>
            <TSelect value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="h-8 w-auto min-w-[150px] text-body-sm">
              <option value="all">Tous</option>
              {(['produit', 'charge_variable', 'charge_fixe', 'amortissement'] as AccountCategoryType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </TSelect>
          </div>
          <label className="flex items-center gap-2 text-body-sm text-fg-secondary cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Afficher les inactifs
          </label>
          <div className="ml-auto flex gap-1">
            <Button onClick={() => setExpanded(new Set(flat.map(c => c.id)))} variant="ghost" size="sm"><ChevronsUpDown size={11} /> Tout déplier</Button>
            <Button onClick={() => setExpanded(new Set())} variant="ghost" size="sm"><ChevronsDownUp size={11} /> Tout replier</Button>
          </div>
        </div>
      </Card>

      <Card animate delay={0.3} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : tree.length === 0 ? (
          <EmptyState icon={BookText} title="Aucune catégorie" description="Applique la migration 009 ou crée une catégorie racine." />
        ) : (
          tree.map(n => renderNode(n, 0))
        )}
      </Card>

      {modalState && (
        <AccountCategoryModal open mode={modalState.kind === 'edit' ? 'edit' : 'create'}
          parent={modalState.kind === 'create_child' ? modalState.parent : null}
          category={modalState.kind === 'edit' ? modalState.category : undefined}
          onClose={() => setModalState(null)} onSaved={handleSaved}
        />
      )}
    </div>
  )
}
