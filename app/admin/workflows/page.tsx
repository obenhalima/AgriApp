'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Workflow, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'

type Def = { id: string; entity_type: string; code: string; name: string; description: string | null; version: number; is_active: boolean; is_default: boolean }

const ENTITY_LABELS: Record<string, string> = {
  sales_order: 'Commandes', invoice: 'Factures',
  purchase_order: "Bons d'achat", harvest: 'Récoltes',
}

export default function WorkflowsAdminPage() {
  const [defs, setDefs] = useState<Def[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('workflow_definitions').select('*').order('entity_type').order('name')
        if (error) throw error
        setDefs(data ?? [])
      } catch (e: any) { setError(e.message ?? 'Erreur de chargement') }
      finally { setLoading(false) }
    })()
  }, [])

  const grouped = defs.reduce<Record<string, Def[]>>((acc, d) => { (acc[d.entity_type] ??= []).push(d); return acc }, {})

  return (
    <div>
      <PageHeader
        title="Workflows" subtitle="Paramétrage" icon={Workflow} iconColor="#64748b"
        description="Paramétrage des processus métier par module"
      />

      {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger text-body-sm mb-md">⚠ {error}</div>}

      {loading ? (
        <div className="space-y-md">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : defs.length === 0 ? (
        <EmptyState icon={Workflow} title="Aucun workflow configuré" description="Applique la migration 006_workflows.sql." />
      ) : (
        Object.entries(grouped).map(([entityType, list], gi) => (
          <div key={entityType} className="mb-xl">
            <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-sm flex items-center gap-2">
              {ENTITY_LABELS[entityType] || entityType}
              <div className="flex-1 h-px bg-border" />
            </div>
            <Card animate delay={gi * 0.05} padding="none" className="overflow-hidden">
              <DataTable>
                <THead><TR><TH>Nom</TH><TH>Code</TH><TH>Version</TH><TH>Actif</TH><TH>Défaut</TH><TH right>Actions</TH></TR></THead>
                <tbody>
                  {list.map((d, i) => (
                    <TR key={d.id} animate delay={0.05 + i * 0.02}>
                      <TD>
                        <div className="font-display font-semibold text-fg-primary">{d.name}</div>
                        {d.description && <div className="text-caption text-fg-tertiary mt-0.5">{d.description}</div>}
                      </TD>
                      <TD mono className="text-caption">{d.code}</TD>
                      <TD mono className="text-caption">v{d.version}</TD>
                      <TD>{d.is_active ? <Badge variant="success" size="sm">actif</Badge> : <Badge variant="default" size="sm">inactif</Badge>}</TD>
                      <TD>{d.is_default ? <Badge variant="success" size="sm">défaut</Badge> : <span className="text-fg-tertiary text-caption">—</span>}</TD>
                      <TD right>
                        <Link href={`/admin/workflows/${d.id}`}>
                          <Button variant="ghost" size="xs"><Pencil size={11} /> Éditer</Button>
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          </div>
        ))
      )}
    </div>
  )
}
