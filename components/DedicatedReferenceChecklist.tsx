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
      { table: 'reference_values', label: 'Unités et listes de choix', needed: 'Avant les articles et les formulaires métier', scope: null, href: '/admin/referentiels' },
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
      { table: 'campaign_plantings', label: 'Plantations', needed: 'Avant les récoltes', scope: 'domain_id', href: '/plan-culture' },
      { table: 'suppliers', label: 'Fournisseurs', needed: 'À saisir avant les achats concernés', scope: 'domain_id', href: '/fournisseurs' },
      { table: 'clients', label: 'Clients commerciaux', needed: 'À saisir avant les commandes clients', scope: 'domain_id', href: '/clients' },
      { table: 'plant_protection_products', label: 'Produits phytosanitaires', needed: 'À renseigner si la société utilise les prescriptions phytosanitaires', scope: 'domain_id', href: '/agronomie/produits' },
      { table: 'workers', label: 'Employés', needed: 'Avant le pointage et la paie', scope: 'farms.domain_id', href: '/rh/employes' },
      { table: 'domain_memberships', label: 'Affectations utilisateurs', needed: 'Avant de donner accès à la société', scope: 'domain_id', href: '/admin/users' },
    ],
  },
]

export function DedicatedReferenceChecklist({ domain, onClose, onCatalog }: {
  domain: Domain
  onClose: () => void
  onCatalog: (category: string) => void
}) {
  const router = useRouter()
  const { activeDomain, switchDomain } = useAuth()
  const [counts, setCounts] = useState<Record<string, number | null> | null>(null)
  const [navigationError, setNavigationError] = useState('')
  const [opening, setOpening] = useState(false)
  const steps = groups.flatMap((group, index) => group.rows.map(row => ({
    ...row, group: group.title, hasCatalog: index === 1,
  })))
  const storageKey = `itrix-reference-step:${domain.id}`
  const [step, setStep] = useState(() => {
    try {
      const saved = Number(sessionStorage.getItem(storageKey))
      return Number.isInteger(saved) && saved >= 0 && saved <= steps.length ? saved : 0
    } catch {
      return 0
    }
  })
  const current = steps[step]

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

  function goTo(next: number) {
    setStep(next)
    try { sessionStorage.setItem(storageKey, String(next)) } catch {}
  }

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

  const count = current ? counts?.[current.table] : undefined
  return <Modal title={`Assistant des référentiels · ${domain.name}`} onClose={onClose} size="lg">
    <div className="space-y-md">
      {navigationError && <p role="alert" className="text-danger">{navigationError}</p>}
      <p role="status" className="font-semibold">Étape {step + 1} sur {steps.length + 1} · {current?.group ?? 'Récapitulatif'}</p>
      {current ? <section className="space-y-sm">
        <h3 className="text-lg font-semibold">{current.label}</h3>
        <p>{current.needed}</p>
        <p>{count === undefined ? 'Vérification…' : count === null ? 'Non vérifié' : count === 0 ? 'À renseigner' : `${count} enregistré(s)`}</p>
        <div className="flex flex-wrap gap-sm">
          {current.hasCatalog && <Button variant="secondary" onClick={() => onCatalog(current.table)}>Reprendre du catalogue général</Button>}
          <Button variant="ghost" disabled={opening} onClick={() => void open(current.href)}>
            {count ? 'Vérifier ou compléter' : 'Saisir dans la société'}
          </Button>
        </div>
      </section> : <section className="space-y-sm">
        <p>Les modules soumis à des prérequis s’ouvrent lorsque la société dispose des données nécessaires.</p>
        <ul className="space-y-xs">
          {steps.map((row, index) => <li key={row.table}>
            <button type="button" className="text-left underline" onClick={() => goTo(index)}>
              {row.label} · {counts?.[row.table] ?? 'Non vérifié'}
            </button>
          </li>)}
        </ul>
        <div className="flex flex-wrap gap-sm">
          <Button variant="ghost" size="sm" disabled={opening} onClick={() => void open('/stocks/reprise')}>Renseigner le stock d’ouverture</Button>
        </div>
      </section>}
      <div className="flex justify-between gap-sm border-t border-border pt-md">
        <Button variant="ghost" disabled={step === 0 || opening} onClick={() => goTo(step - 1)}>Précédent</Button>
        <Button disabled={opening} onClick={() => current ? goTo(step + 1) : onClose()}>{current ? 'Suivant' : 'Fermer'}</Button>
      </div>
    </div>
  </Modal>
}
