'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { Domain } from '@/lib/domains'

const groups = [
  {
    title: '1. Vérifier le socle',
    rows: [
      { table: 'crops', label: 'Cultures', needed: 'Avant les variétés et les plantations', scope: 'domain_id', href: '/cultures' },
      { table: 'reference_values', label: 'Unités et listes de choix', needed: 'Avant les articles et les formulaires métier', scope: null, href: '/admin/parametres' },
      { table: 'account_categories', label: 'Catégories comptables', needed: 'Avant les budgets et le suivi des coûts', scope: null, href: '/admin/account-categories' },
      { table: 'roles', label: 'Rôles', needed: 'Avant de donner accès à l’équipe', scope: null, href: '/admin/users' },
      { table: 'workflow_definitions', label: 'Modèles de workflow', needed: 'À vérifier avant d’utiliser les workflows', scope: null, href: '/admin/workflows' },
      { table: 'approval_policies', label: 'Circuits de validation de la société', needed: 'À vérifier avant les opérations soumises à validation', scope: 'domain_id', href: '/admin/validations' },
    ],
  },
  {
    title: '2. Choisir les fiches du catalogue',
    rows: [
      { table: 'varieties', label: 'Variétés', needed: 'Avant les plantations', scope: 'domain_id', href: '/varietes' },
      { table: 'stock_items', label: 'Articles de stock', needed: 'Avant les achats et les mouvements de stock', scope: 'domain_id', href: '/stocks' },
      { table: 'markets', label: 'Marchés', needed: 'Avant les opérations commerciales qui utilisent un marché', scope: 'domain_id', href: '/marches' },
    ],
  },
  {
    title: '3. Renseigner la société',
    rows: [
      { table: 'farms', label: 'Fermes', needed: 'Avant les serres et les campagnes', scope: 'domain_id', href: '/fermes' },
      { table: 'greenhouses', label: 'Serres', needed: 'Après les fermes, avant les plantations sous serre', scope: 'farms.domain_id', href: '/serres' },
      { table: 'warehouses', label: 'Entrepôts', needed: 'Avant les stocks d’ouverture et les mouvements', scope: 'domain_id', href: '/entrepots' },
      { table: 'campaigns', label: 'Campagnes', needed: 'Avant les plantations et les budgets', scope: 'domain_id', href: '/campagnes' },
      { table: 'suppliers', label: 'Fournisseurs', needed: 'À saisir avant les achats concernés', scope: 'domain_id', href: '/fournisseurs' },
      { table: 'plant_protection_products', label: 'Produits phytosanitaires', needed: 'À renseigner si la société utilise les prescriptions phytosanitaires', scope: 'domain_id', href: '/agronomie/produits' },
      { table: 'workers', label: 'Employés', needed: 'Avant le pointage et la paie', scope: 'farms.domain_id', href: '/rh/employes' },
      { table: 'domain_memberships', label: 'Affectations utilisateurs', needed: 'Avant de donner accès à la société', scope: 'domain_id', href: '/admin/users' },
    ],
  },
]

export function DedicatedReferenceChecklist({ domain, onClose, onCatalog }: {
  domain: Domain
  onClose: () => void
  onCatalog: () => void
}) {
  const router = useRouter()
  const { activeDomain, switchDomain } = useAuth()
  const [counts, setCounts] = useState<Record<string, number | null> | null>(null)
  const [navigationError, setNavigationError] = useState('')
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    let current = true
    void Promise.all(groups.flatMap(group => group.rows).map(async row => {
      let query = supabase.from(row.table).select(row.scope === 'farms.domain_id' ? 'id,farms!inner(domain_id)' : '*', {
        count: 'exact', head: true,
      })
      if (row.scope) query = query.eq(row.scope, domain.id)
      const { count, error } = await query
      return [row.table, error ? null : count] as const
    })).then(results => {
      if (current) setCounts(Object.fromEntries(results))
    })
    return () => { current = false }
  }, [domain.id])

  async function open(href: string) {
    setOpening(true)
    setNavigationError('')
    try {
      if (activeDomain?.domain_id !== domain.id) await switchDomain(domain.id)
      onClose()
      router.push(href)
    } catch {
      setNavigationError('Impossible d’ouvrir cet écran pour la société sélectionnée.')
    } finally {
      setOpening(false)
    }
  }

  return <Modal title={`Référentiels · ${domain.name}`} onClose={onClose} size="xl">
    <div className="space-y-md">
      <p>Complète les éléments nécessaires avant d’utiliser le processus indiqué.</p>
      {navigationError && <p role="alert" className="text-danger">{navigationError}</p>}
      {groups.map((group, index) => <section key={group.title} className="space-y-sm">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <h3 className="font-semibold">{group.title}</h3>
          {index === 1 && <Button variant="secondary" size="sm" onClick={onCatalog}>Parcourir le catalogue général</Button>}
        </div>
        {group.rows.map(row => {
          const count = counts?.[row.table]
          return <div key={row.table} className="flex items-center justify-between gap-sm border-b border-border py-sm">
            <div>
              <p className="font-medium">{row.label}</p>
              <p className="text-caption text-fg-secondary">{row.needed}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-sm text-caption">
              <span>{count === undefined ? 'Vérification…' : count === null ? 'Non vérifié' : count === 0 ? 'À renseigner' : `${count} enregistré(s)`}</span>
              <Button variant="ghost" size="sm" disabled={opening} onClick={() => void open(row.href)}>Ouvrir</Button>
            </div>
          </div>
        })}
        {index === 2 && <div className="flex flex-wrap gap-sm">
          <Button variant="ghost" size="sm" disabled={opening} onClick={() => void open('/clients')}>Saisir les clients commerciaux</Button>
          <Button variant="ghost" size="sm" disabled={opening} onClick={() => void open('/stocks/reprise')}>Renseigner le stock d’ouverture</Button>
        </div>}
      </section>)}
    </div>
  </Modal>
}
