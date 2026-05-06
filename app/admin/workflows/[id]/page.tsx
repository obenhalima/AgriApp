'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Workflow, Plus, Trash2, ArrowRight, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'

type Def = { id: string; entity_type: string; code: string; name: string; description: string | null; is_active: boolean; is_default: boolean }
type State = { id: string; code: string; label: string; color: string | null; is_initial: boolean; is_final: boolean; order_idx: number }
type Transition = { id: string; from_state_id: string; to_state_id: string; code: string; label: string; is_active: boolean; order_idx: number; requires_approval: boolean }

export default function WorkflowDefinitionEditor() {
  const params = useParams<{ id: string }>()
  const defId = params?.id as string

  const [def, setDef] = useState<Def | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [trans, setTrans] = useState<Transition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newT, setNewT] = useState({ from_state_id: '', to_state_id: '', code: '', label: '' })
  const [savingT, setSavingT] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [d, s, t] = await Promise.all([
        supabase.from('workflow_definitions').select('*').eq('id', defId).maybeSingle(),
        supabase.from('workflow_states').select('*').eq('definition_id', defId).order('order_idx'),
        supabase.from('workflow_transitions').select('*').eq('definition_id', defId).order('order_idx'),
      ])
      if (d.error) throw d.error
      setDef(d.data as Def | null); setStates(s.data ?? []); setTrans(t.data ?? [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (defId) load() }, [defId])

  const stateById = (id: string) => states.find(s => s.id === id)

  const toggleTransition = async (t: Transition) => {
    try {
      await supabase.from('workflow_transitions').update({ is_active: !t.is_active }).eq('id', t.id)
      setTrans(p => p.map(x => x.id === t.id ? { ...x, is_active: !t.is_active } : x))
      toast.success(t.is_active ? 'Transition désactivée' : 'Transition activée')
    } catch (e: any) { toast.error(e.message) }
  }

  const deleteTransition = async (t: Transition) => {
    if (!confirm(`Supprimer la transition "${t.label}" ?`)) return
    try {
      await supabase.from('workflow_transitions').delete().eq('id', t.id)
      setTrans(p => p.filter(x => x.id !== t.id))
      toast.success('Transition supprimée')
    } catch (e: any) { toast.error(e.message) }
  }

  const addTransition = async () => {
    if (!newT.from_state_id || !newT.to_state_id || !newT.code || !newT.label) return
    if (newT.from_state_id === newT.to_state_id) { toast.error("Les états doivent être différents"); return }
    setSavingT(true)
    try {
      const { data, error } = await supabase.from('workflow_transitions').insert({
        definition_id: defId, from_state_id: newT.from_state_id, to_state_id: newT.to_state_id,
        code: newT.code, label: newT.label, order_idx: (trans.length + 1) * 10,
      }).select().single()
      if (error) throw error
      setTrans(p => [...p, data])
      setNewT({ from_state_id: '', to_state_id: '', code: '', label: '' })
      toast.success('Transition ajoutée')
    } catch (e: any) { toast.error(e.message) }
    finally { setSavingT(false) }
  }

  if (loading) return <div className="space-y-md"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
  if (error) return <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger">⚠ {error}</div>
  if (!def) return <div className="p-xl text-center text-fg-tertiary">Workflow introuvable.</div>

  return (
    <div>
      <Link href="/admin/workflows" className="inline-flex items-center gap-1 text-caption text-fg-tertiary hover:text-fg-primary mb-2 transition-colors">
        <ArrowLeft size={12} /> Retour
      </Link>

      <PageHeader
        title={def.name} subtitle="Workflow" icon={Workflow} iconColor="#64748b"
        description={
          <span className="flex items-center gap-2">
            <span className="font-mono">{def.entity_type}</span>
            <span className="opacity-50">·</span>
            <code className="font-mono">{def.code}</code>
            {def.is_default && <Badge variant="success" size="xs">défaut</Badge>}
            {!def.is_active && <Badge variant="default" size="xs">inactif</Badge>}
          </span>
        }
      />

      {/* États */}
      <div className="mb-xl">
        <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-sm">États ({states.length})</div>
        <Card animate padding="none" className="overflow-hidden">
          <DataTable>
            <THead><TR><TH>Ordre</TH><TH>Code</TH><TH>Libellé</TH><TH>Couleur</TH><TH>Initial</TH><TH>Final</TH></TR></THead>
            <tbody>
              {states.map((s, i) => (
                <TR key={s.id} animate delay={0.04 + i * 0.02}>
                  <TD mono className="text-caption">{s.order_idx}</TD>
                  <TD><code className="text-caption">{s.code}</code></TD>
                  <TD>
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color ?? 'var(--tx-3)' }} />
                      {s.label}
                    </span>
                  </TD>
                  <TD mono className="text-caption text-fg-tertiary">{s.color}</TD>
                  <TD>{s.is_initial && '✓'}</TD>
                  <TD>{s.is_final && '✓'}</TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        </Card>
        <div className="mt-2 text-caption text-fg-tertiary flex items-center gap-1.5">
          <Info size={11} /> L'édition des états se fera en phase ultérieure — ils sont définis par migration.
        </div>
      </div>

      {/* Transitions */}
      <div>
        <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-sm">Transitions ({trans.length})</div>

        <Card animate className="mb-md">
          <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1.5fr_auto] gap-sm items-end">
            <Field label="De">
              <TSelect value={newT.from_state_id} onChange={(e) => setNewT({ ...newT, from_state_id: e.target.value })}>
                <option value="">— état —</option>
                {states.filter(s => !s.is_final).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </TSelect>
            </Field>
            <Field label="Vers">
              <TSelect value={newT.to_state_id} onChange={(e) => setNewT({ ...newT, to_state_id: e.target.value })}>
                <option value="">— état —</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </TSelect>
            </Field>
            <Field label="Code"><TInput value={newT.code} onChange={(e) => setNewT({ ...newT, code: e.target.value })} placeholder="confirm" /></Field>
            <Field label="Libellé du bouton"><TInput value={newT.label} onChange={(e) => setNewT({ ...newT, label: e.target.value })} placeholder="Confirmer la commande" /></Field>
            <Button onClick={addTransition} loading={savingT} variant="primary"><Plus size={14} strokeWidth={2.5} /> Ajouter</Button>
          </div>
        </Card>

        <Card animate delay={0.1} padding="none" className="overflow-hidden">
          <DataTable>
            <THead><TR><TH>De</TH><TH>Vers</TH><TH>Code</TH><TH>Libellé</TH><TH>Actif</TH><TH right>Actions</TH></TR></THead>
            <tbody>
              {trans.map((t, i) => {
                const from = stateById(t.from_state_id)
                const to = stateById(t.to_state_id)
                return (
                  <TR key={t.id} animate delay={0.05 + i * 0.02} className={!t.is_active ? 'opacity-50' : ''}>
                    <TD>{from?.label ?? '?'}</TD>
                    <TD className="flex items-center gap-1"><ArrowRight size={11} className="text-fg-tertiary" />{to?.label ?? '?'}</TD>
                    <TD><code className="text-caption">{t.code}</code></TD>
                    <TD>{t.label}</TD>
                    <TD>
                      <button onClick={() => toggleTransition(t)}
                        className={`px-2.5 py-0.5 rounded text-caption font-mono uppercase font-semibold border transition-colors ${t.is_active ? 'border-success/40 bg-success/15 text-success' : 'border-border bg-transparent text-fg-tertiary'}`}>
                        {t.is_active ? 'actif' : 'inactif'}
                      </button>
                    </TD>
                    <TD right>
                      <Button onClick={() => deleteTransition(t)} variant="ghost" size="icon-sm" title="Supprimer" className="hover:text-danger">
                        <Trash2 size={12} strokeWidth={2.2} />
                      </Button>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        </Card>
      </div>
    </div>
  )
}
