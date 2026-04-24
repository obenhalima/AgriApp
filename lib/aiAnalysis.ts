import { supabase } from './supabase'
import { ComparisonMonthly } from './actuals'
import { Diagnostics } from './diagnostics'

export type AICPCInput = {
  context: {
    campaignName: string
    farmName?: string
    greenhouseCode?: string
    scope: 'domain' | 'farm' | 'greenhouse'
    versionName: string
    today?: string
  }
  data: {
    produits:          { budget: number; actual: number }
    charges_variables: { budget: number; actual: number }
    charges_fixes:     { budget: number; actual: number }
    amortissements:    { budget: number; actual: number }
    ebitda:            { budget: number; actual: number }
    resultat:          { budget: number; actual: number }
    topLines: Array<{
      label: string
      type: 'produit' | 'charge_variable' | 'charge_fixe' | 'amortissement'
      budget: number
      actual: number
      variancePct: number
    }>
  }
  diagnostics?: Diagnostics   // optionnel — enrichit l'analyse avec audit de qualité
}

export async function analyzeCPC(input: AICPCInput): Promise<string> {
  // Appel direct via fetch pour avoir l'erreur complète (supabase.functions.invoke masque le body)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Variables Supabase manquantes')

  const res = await fetch(`${url}/functions/v1/ai-analyze-cpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(input),
  })

  const raw = await res.text()
  let parsed: any
  try { parsed = JSON.parse(raw) } catch { parsed = { error: raw } }

  if (!res.ok) {
    throw new Error(`Edge Function ${res.status} — ${parsed.error ?? raw.slice(0, 500)}`)
  }
  if (parsed.error) throw new Error(parsed.error)
  if (!parsed.analysis) throw new Error('Réponse vide de l\'IA')
  return parsed.analysis as string
}

/**
 * Prépare les inputs IA à partir des lignes de comparaison + totaux par type.
 * Sélectionne les top écarts significatifs pour nourrir le prompt.
 */
export function buildAIInput(params: {
  campaignName: string
  versionName: string
  scope: 'domain' | 'farm' | 'greenhouse'
  farmName?: string
  greenhouseCode?: string
  rows: ComparisonMonthly[]
  aggregatesByParent: Record<string, number>
  aggregatesBudgetByParent: Record<string, number>
  typeTotals: {
    produit: { budget: number; actual: number }
    charge_variable: { budget: number; actual: number }
    charge_fixe: { budget: number; actual: number }
    amortissement: { budget: number; actual: number }
  }
  diagnostics?: Diagnostics
}): AICPCInput {
  const { typeTotals } = params
  const ebitda = {
    budget: typeTotals.produit.budget - typeTotals.charge_variable.budget - typeTotals.charge_fixe.budget,
    actual: typeTotals.produit.actual - typeTotals.charge_variable.actual - typeTotals.charge_fixe.actual,
  }
  const resultat = {
    budget: ebitda.budget - typeTotals.amortissement.budget,
    actual: ebitda.actual - typeTotals.amortissement.actual,
  }

  // Top écarts : prend les lignes feuilles (pas de children)
  const childIds = new Set(params.rows.filter(r => r.parent_id).map(r => r.parent_id))
  const leaves = params.rows.filter(r => !childIds.has(r.category_id))

  const topLines = leaves
    .map(l => {
      const variancePct = l.budget === 0 ? (l.actual > 0 ? 100 : 0) : ((l.actual - l.budget) / l.budget) * 100
      return {
        label: l.category_label,
        type: l.category_type,
        budget: l.budget,
        actual: l.actual,
        variancePct,
      }
    })
    // Ne garde que les lignes avec un montant significatif (réel OU budget non nul)
    .filter(l => Math.abs(l.budget) > 0 || Math.abs(l.actual) > 0)
    // Tri par valeur absolue d'écart (MAD) décroissante
    .sort((a, b) => Math.abs(b.actual - b.budget) - Math.abs(a.actual - a.budget))
    .slice(0, 15)

  return {
    context: {
      campaignName: params.campaignName,
      versionName: params.versionName,
      scope: params.scope,
      farmName: params.farmName,
      greenhouseCode: params.greenhouseCode,
      today: new Date().toISOString().slice(0, 10),
    },
    data: {
      produits:          typeTotals.produit,
      charges_variables: typeTotals.charge_variable,
      charges_fixes:     typeTotals.charge_fixe,
      amortissements:    typeTotals.amortissement,
      ebitda,
      resultat,
      topLines,
    },
    diagnostics: params.diagnostics,
  }
}
