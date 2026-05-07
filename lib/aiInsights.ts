/**
 * aiInsights — Moteur d'insights déterministe pour le CEO.
 *
 * Génère pour chaque KPI/thème une analyse en langage naturel + recommandation
 * concrète, à partir des données calculées du Dashboard. Pas d'API : tout est
 * basé sur des règles métier (Big Four / agronome / financier).
 *
 * Le but : le CEO comprend en 5 secondes. Aucun effort analytique.
 *
 * Niveaux :
 *   - good     : tout va bien (vert)
 *   - warning  : à surveiller (ambre)
 *   - critical : action urgente (rouge)
 *   - info     : neutre / explicatif (bleu)
 */
import { formatMoney, formatWeight } from './format'

export type InsightLevel = 'good' | 'warning' | 'critical' | 'info'

export type Insight = {
  level: InsightLevel
  /** Phrase courte (≤ 90 caractères) qui explique le KPI */
  headline: string
  /** Recommandation actionnable (≤ 140 caractères) */
  recommendation?: string
  /** Source de l'analyse (ex: "Marge brute", "Trésorerie") */
  topic?: string
}

export type DashboardMetrics = {
  // Marge / CA
  margeBrute: number
  margePct: number
  caTotal: number
  // Coûts / Budget
  totalCostsAll: number
  expectedCostsByNow: number
  costsVsBudgetPct: number
  budgetTotal: number
  budgetProgressPct: number
  // Trésorerie
  cashPosition: number
  totalCollected: number
  totalPaidOut: number
  totalToPay: number
  // Créances
  totalReceivable: number
  overdueAmount: number
  overdueInvoicesCount: number
  topReceivableName?: string
  topReceivableAmount?: number
  // Production
  prodMonth: number
  prod30: number
  prodPrev30: number
  prodTrend: number
  yieldKgM2: number
  targetYield: number
  yieldRatio: number
  premiumRate: number
  wasteRate: number
  totalQ: number
  // Performance serres
  topGhCode?: string
  topGhRatio?: number
  flopGhCode?: string
  flopGhRatio?: number
  // Commerce
  dispatchesNoPriceCount: number
  caDispatches: number
  // Stocks
  stockAlertsCount: number
  // Misc
  workersCount: number
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════
const m = (v: number) => formatMoney(v, { compact: 'auto' })
const w = (v: number) => formatWeight(v)
const pct = (v: number, dp = 1) => `${v > 0 ? '+' : ''}${v.toFixed(dp)}%`

// ════════════════════════════════════════════════════════════════════════════
// INSIGHTS PAR KPI
// ════════════════════════════════════════════════════════════════════════════

export function insightMargeBrute(d: DashboardMetrics): Insight {
  if (d.caTotal === 0) {
    return {
      level: 'info',
      topic: 'Marge brute',
      headline: 'Pas encore de CA enregistré sur la période.',
      recommendation: 'Vérifiez la saisie des prix sur les dispatches et les factures clients.',
    }
  }
  if (d.margeBrute < 0) {
    return {
      level: 'critical',
      topic: 'Marge brute',
      headline: `Marge brute négative (${m(d.margeBrute)}). Vous vendez à perte.`,
      recommendation: 'Diagnostic urgent : analysez les coûts variables et le mix qualité (Cat. 1 vs Cat. 3).',
    }
  }
  if (d.margePct < 15) {
    return {
      level: 'critical',
      topic: 'Marge brute',
      headline: `Marge brute fragile à ${d.margePct.toFixed(1)}% (seuil sain : 25%+).`,
      recommendation: 'Réduisez les coûts variables ou renforcez le mix premium pour gagner 5-10 pts.',
    }
  }
  if (d.margePct < 25) {
    return {
      level: 'warning',
      topic: 'Marge brute',
      headline: `Marge brute correcte (${d.margePct.toFixed(1)}%) mais sous l'objectif filière (25-35%).`,
      recommendation: 'Optimisez le mix qualité et négociez les intrants pour atteindre 25%+.',
    }
  }
  if (d.margePct < 35) {
    return {
      level: 'good',
      topic: 'Marge brute',
      headline: `Marge brute saine à ${d.margePct.toFixed(1)}% (filière : 25-35%).`,
      recommendation: 'Maintenez le cap. Surveillez les charges fixes pour ne pas dégrader le ratio.',
    }
  }
  return {
    level: 'good',
    topic: 'Marge brute',
    headline: `Excellente marge brute à ${d.margePct.toFixed(1)}%. Au-dessus du benchmark filière.`,
    recommendation: 'Documentez les bonnes pratiques pour les répliquer la prochaine campagne.',
  }
}

export function insightCash(d: DashboardMetrics): Insight {
  const burnRate = d.totalPaidOut > 0 ? d.totalPaidOut / Math.max(d.workersCount, 1) : 0
  if (d.cashPosition < 0) {
    const months = d.totalToPay > 0 ? Math.abs(d.cashPosition) / Math.max(d.totalCollected / 6, 1) : 0
    return {
      level: 'critical',
      topic: 'Trésorerie',
      headline: `Trésorerie nette négative (${m(d.cashPosition)}). Vous avez payé plus que vous n'avez encaissé.`,
      recommendation: 'Accélérez le recouvrement clients et étalez les paiements fournisseurs si possible.',
    }
  }
  if (d.totalToPay > d.cashPosition) {
    return {
      level: 'warning',
      topic: 'Trésorerie',
      headline: `${m(d.totalToPay)} de dettes fournisseurs > trésorerie disponible (${m(d.cashPosition)}).`,
      recommendation: 'Priorisez les paiements critiques et négociez des délais sur le reste.',
    }
  }
  if (d.cashPosition < d.totalToPay * 1.5) {
    return {
      level: 'warning',
      topic: 'Trésorerie',
      headline: `Trésorerie tendue : couvre ${(d.cashPosition / Math.max(d.totalToPay, 1)).toFixed(1)}× les dettes à payer.`,
      recommendation: 'Visez un coussin de 2-3× les dettes fournisseurs pour dormir tranquille.',
    }
  }
  return {
    level: 'good',
    topic: 'Trésorerie',
    headline: `Trésorerie saine (${m(d.cashPosition)}). Couvre largement les engagements.`,
    recommendation: 'Envisagez un placement court-terme pour faire travailler le cash dormant.',
  }
}

export function insightReceivables(d: DashboardMetrics): Insight {
  if (d.totalReceivable === 0) {
    return {
      level: 'good',
      topic: 'Créances clients',
      headline: 'Aucune créance en cours. Tous les clients sont à jour.',
      recommendation: 'Excellent. Maintenez ce niveau de discipline commerciale.',
    }
  }
  const overdueRatio = d.totalReceivable > 0 ? (d.overdueAmount / d.totalReceivable) * 100 : 0
  if (overdueRatio > 30) {
    const topClient = d.topReceivableName ? ` Le plus gros : ${d.topReceivableName} (${m(d.topReceivableAmount ?? 0)}).` : ''
    return {
      level: 'critical',
      topic: 'Créances clients',
      headline: `${overdueRatio.toFixed(0)}% des créances sont en retard (${m(d.overdueAmount)}).${topClient}`,
      recommendation: 'Lancez immédiatement les relances. Considérez les frais de retard contractuels.',
    }
  }
  if (overdueRatio > 10) {
    return {
      level: 'warning',
      topic: 'Créances clients',
      headline: `${d.overdueInvoicesCount} factures en retard (${m(d.overdueAmount)}, ${overdueRatio.toFixed(0)}% du total).`,
      recommendation: 'Plan de relance graduée : email J+5, appel J+15, lettre recommandée J+30.',
    }
  }
  if (d.overdueAmount > 0) {
    return {
      level: 'warning',
      topic: 'Créances clients',
      headline: `Quelques retards mineurs : ${m(d.overdueAmount)} sur ${m(d.totalReceivable)} d'encours.`,
      recommendation: 'Une simple relance email devrait suffire. À traiter cette semaine.',
    }
  }
  return {
    level: 'good',
    topic: 'Créances clients',
    headline: `${m(d.totalReceivable)} d'encours sain. Aucun retard.`,
    recommendation: 'Continuez à surveiller les délais de paiement par client.',
  }
}

export function insightCostsBudget(d: DashboardMetrics): Insight {
  if (d.budgetTotal === 0 || d.expectedCostsByNow === 0) {
    return {
      level: 'info',
      topic: 'Coûts vs Budget',
      headline: 'Pas de budget défini sur la campagne active.',
      recommendation: 'Saisissez le budget pour piloter les écarts en temps réel.',
    }
  }
  if (d.costsVsBudgetPct > 20) {
    return {
      level: 'critical',
      topic: 'Coûts vs Budget',
      headline: `Dérive critique : +${d.costsVsBudgetPct.toFixed(0)}% vs budget. Surcoût de ${m(d.totalCostsAll - d.expectedCostsByNow)}.`,
      recommendation: 'Audit immédiat ligne par ligne dans le Compte d\'exploitation.',
    }
  }
  if (d.costsVsBudgetPct > 10) {
    return {
      level: 'warning',
      topic: 'Coûts vs Budget',
      headline: `Coûts +${d.costsVsBudgetPct.toFixed(0)}% au-dessus du budget prorata.`,
      recommendation: 'Identifiez les 2-3 catégories qui dérapent et mettez un plan d\'action.',
    }
  }
  if (d.costsVsBudgetPct < -10) {
    return {
      level: 'info',
      topic: 'Coûts vs Budget',
      headline: `Sous-consommation budget : ${d.costsVsBudgetPct.toFixed(0)}%. Vérifiez la saisie.`,
      recommendation: 'Soit vraie économie, soit retard de saisie. Confrontez aux factures fournisseurs.',
    }
  }
  return {
    level: 'good',
    topic: 'Coûts vs Budget',
    headline: `Coûts maîtrisés à ${d.costsVsBudgetPct >= 0 ? '+' : ''}${d.costsVsBudgetPct.toFixed(1)}% du budget prorata.`,
    recommendation: 'Pilotage sain. Continuez les revues mensuelles pour rester dans les clous.',
  }
}

export function insightProduction(d: DashboardMetrics): Insight {
  if (d.totalQ === 0) {
    return {
      level: 'info',
      topic: 'Production',
      headline: 'Aucune récolte sur la période en cours.',
      recommendation: 'Vérifiez que les saisies récolte sont à jour (Telegram bot ou interface).',
    }
  }
  if (d.yieldRatio > 0 && d.yieldRatio < 70) {
    return {
      level: 'critical',
      topic: 'Production',
      headline: `Yield à ${d.yieldRatio.toFixed(0)}% de la cible (${d.yieldKgM2.toFixed(1)} vs ${d.targetYield.toFixed(1)} kg/m²).`,
      recommendation: 'Diagnostic agronomique urgent : irrigation, EC/pH, ravageurs, vigueur plante.',
    }
  }
  if (d.yieldRatio > 0 && d.yieldRatio < 90) {
    return {
      level: 'warning',
      topic: 'Production',
      headline: `Yield sous-performant à ${d.yieldRatio.toFixed(0)}% de la cible.`,
      recommendation: 'Auditez les serres en queue de classement et appliquez les techniques des leaders.',
    }
  }
  if (d.prodTrend < -15) {
    return {
      level: 'warning',
      topic: 'Production',
      headline: `Production en baisse de ${d.prodTrend.toFixed(0)}% sur 30 jours.`,
      recommendation: 'Normal en fin de cycle ? Sinon vérifiez fertirrigation et pression sanitaire.',
    }
  }
  if (d.prodTrend > 15) {
    return {
      level: 'good',
      topic: 'Production',
      headline: `Production en hausse de +${d.prodTrend.toFixed(0)}% sur 30 jours.`,
      recommendation: 'Anticipez la commercialisation et la logistique pour absorber les volumes.',
    }
  }
  return {
    level: 'good',
    topic: 'Production',
    headline: `Production stable et yield à ${d.yieldRatio.toFixed(0)}% de la cible. Pilotage sous contrôle.`,
    recommendation: 'Maintenez les bonnes pratiques de fertirrigation et taillage.',
  }
}

export function insightQuality(d: DashboardMetrics): Insight {
  if (d.totalQ === 0) {
    return { level: 'info', topic: 'Qualité', headline: 'Pas de récolte récente pour évaluer la qualité.' }
  }
  if (d.wasteRate > 10) {
    return {
      level: 'critical',
      topic: 'Qualité',
      headline: `Taux de perte élevé : ${d.wasteRate.toFixed(1)}% (cible : <8%).`,
      recommendation: 'Inspectez la chaîne récolte → station : choc thermique, surmaturité, manutention.',
    }
  }
  if (d.premiumRate < 50) {
    return {
      level: 'warning',
      topic: 'Qualité',
      headline: `Mix premium faible : ${d.premiumRate.toFixed(0)}% en Cat. 1 (objectif : 60%+).`,
      recommendation: 'Renforcez le triage et les pratiques culturales (calibrage, exposition).',
    }
  }
  if (d.premiumRate > 65) {
    return {
      level: 'good',
      topic: 'Qualité',
      headline: `Excellent mix qualité : ${d.premiumRate.toFixed(0)}% en Cat. 1.`,
      recommendation: 'Valorisez ce premium dans la négociation commerciale (export, bio, etc.).',
    }
  }
  return {
    level: 'good',
    topic: 'Qualité',
    headline: `Mix qualité sain : ${d.premiumRate.toFixed(0)}% Cat. 1, ${d.wasteRate.toFixed(1)}% pertes.`,
    recommendation: 'Continuez le tri rigoureux à la station.',
  }
}

export function insightPerformance(d: DashboardMetrics): Insight {
  if (!d.topGhCode || !d.flopGhCode) {
    return { level: 'info', topic: 'Performance serres', headline: 'Pas assez de données pour comparer les serres.' }
  }
  const gap = (d.topGhRatio ?? 0) - (d.flopGhRatio ?? 0)
  if (gap > 50) {
    return {
      level: 'critical',
      topic: 'Performance serres',
      headline: `Écart énorme entre serres : ${d.topGhCode} (${d.topGhRatio?.toFixed(0)}%) vs ${d.flopGhCode} (${d.flopGhRatio?.toFixed(0)}%).`,
      recommendation: `Auditez ${d.flopGhCode} en priorité : structure, climat, irrigation, variétés.`,
    }
  }
  if (gap > 25) {
    return {
      level: 'warning',
      topic: 'Performance serres',
      headline: `Disparité notable : ${d.topGhCode} performe ${gap.toFixed(0)} pts au-dessus de ${d.flopGhCode}.`,
      recommendation: `Transférez les bonnes pratiques de ${d.topGhCode} vers ${d.flopGhCode}.`,
    }
  }
  return {
    level: 'good',
    topic: 'Performance serres',
    headline: `Performances homogènes (écart : ${gap.toFixed(0)} pts). Pilotage cohérent.`,
    recommendation: 'Identifiez ce qui marche bien chez tous et standardisez.',
  }
}

export function insightCommerce(d: DashboardMetrics): Insight {
  if (d.dispatchesNoPriceCount > 5) {
    return {
      level: 'critical',
      topic: 'Saisie commerciale',
      headline: `${d.dispatchesNoPriceCount} dispatches sans prix. CA non comptabilisé.`,
      recommendation: 'Saisissez les prix dès la confirmation pour piloter en temps réel.',
    }
  }
  if (d.dispatchesNoPriceCount > 0) {
    return {
      level: 'warning',
      topic: 'Saisie commerciale',
      headline: `${d.dispatchesNoPriceCount} dispatches sans prix encore en attente.`,
      recommendation: 'Complétez les prix cette semaine pour boucler le suivi.',
    }
  }
  return {
    level: 'good',
    topic: 'Saisie commerciale',
    headline: 'Tous les dispatches ont un prix saisi. Suivi commercial à jour.',
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SYNTHÈSE GLOBALE (pour le FAB / chatbot)
// ════════════════════════════════════════════════════════════════════════════

export type GlobalInsight = {
  health: 'good' | 'warning' | 'critical'
  oneLiner: string
  bullets: string[]
  topActions: Array<{ label: string; href: string; impact?: string }>
}

export function buildGlobalInsight(d: DashboardMetrics): GlobalInsight {
  const insights = [
    insightMargeBrute(d),
    insightCash(d),
    insightReceivables(d),
    insightCostsBudget(d),
    insightProduction(d),
    insightQuality(d),
    insightPerformance(d),
    insightCommerce(d),
  ]
  const criticals = insights.filter(i => i.level === 'critical')
  const warnings = insights.filter(i => i.level === 'warning')

  let health: 'good' | 'warning' | 'critical' = 'good'
  let oneLiner = `Le domaine se porte bien. Marge brute ${d.margePct.toFixed(1)}%, ${w(d.prodMonth)} produits ce mois.`

  if (criticals.length > 0) {
    health = 'critical'
    oneLiner = `${criticals.length} point${criticals.length > 1 ? 's' : ''} critique${criticals.length > 1 ? 's' : ''} : ${criticals[0].headline}`
  } else if (warnings.length >= 2) {
    health = 'warning'
    oneLiner = `${warnings.length} alertes à surveiller. ${warnings[0].headline}`
  } else if (warnings.length === 1) {
    health = 'warning'
    oneLiner = warnings[0].headline
  }

  const bullets = insights
    .filter(i => i.level !== 'good' && i.level !== 'info')
    .slice(0, 5)
    .map(i => `${i.level === 'critical' ? '🚨' : '⚠️'} ${i.headline}${i.recommendation ? ` → ${i.recommendation}` : ''}`)

  // Si tout va bien, donne quand même 2-3 insights positifs
  if (bullets.length === 0) {
    insights.filter(i => i.level === 'good').slice(0, 3).forEach(i => {
      bullets.push(`✅ ${i.headline}`)
    })
  }

  const topActions: GlobalInsight['topActions'] = []
  if (d.dispatchesNoPriceCount > 0) {
    topActions.push({ label: 'Saisir les prix', href: '/recoltes', impact: `${d.dispatchesNoPriceCount} dispatches` })
  }
  if (d.overdueAmount > 0) {
    topActions.push({ label: 'Relancer factures', href: '/factures', impact: m(d.overdueAmount) })
  }
  if (d.costsVsBudgetPct > 10) {
    topActions.push({ label: 'Auditer coûts', href: '/admin/compte-exploitation', impact: `+${d.costsVsBudgetPct.toFixed(0)}%` })
  }
  if (d.yieldRatio > 0 && d.yieldRatio < 80) {
    topActions.push({ label: 'Diagnostic production', href: '/production', impact: `${d.yieldRatio.toFixed(0)}% cible` })
  }
  if (d.stockAlertsCount > 0) {
    topActions.push({ label: 'Réapprovisionner', href: '/stocks', impact: `${d.stockAlertsCount} articles` })
  }

  return { health, oneLiner, bullets, topActions }
}

// ════════════════════════════════════════════════════════════════════════════
// QUESTIONS RAPIDES (pour le FAB chatbot)
// ════════════════════════════════════════════════════════════════════════════

export type QuickAnswer = {
  question: string
  answer: string
  level: InsightLevel
  cta?: { label: string; href: string }
}

export function answerQuestion(q: 'health' | 'margin' | 'cash' | 'priorities' | 'production' | 'quality', d: DashboardMetrics): QuickAnswer {
  switch (q) {
    case 'health': {
      const g = buildGlobalInsight(d)
      return {
        question: 'Comment va la ferme aujourd\'hui ?',
        answer: g.oneLiner + (g.bullets.length > 0 ? '\n\n' + g.bullets.join('\n') : ''),
        level: g.health === 'good' ? 'good' : g.health,
      }
    }
    case 'margin': {
      const i = insightMargeBrute(d)
      return {
        question: 'Comment est ma rentabilité ?',
        answer: `${i.headline}\n\n${i.recommendation ?? ''}\n\nDétail : CA ${m(d.caTotal)} − Coûts ${m(d.totalCostsAll)} = ${m(d.margeBrute)} (${d.margePct.toFixed(1)}%).`,
        level: i.level,
        cta: { label: 'Compte d\'exploitation', href: '/admin/compte-exploitation' },
      }
    }
    case 'cash': {
      const i = insightCash(d)
      return {
        question: 'Combien j\'ai en caisse ?',
        answer: `${i.headline}\n\n${i.recommendation ?? ''}\n\nDétail : Encaissé ${m(d.totalCollected)} − Payé ${m(d.totalPaidOut)} = ${m(d.cashPosition)}.\nReste à payer : ${m(d.totalToPay)}.\nÀ encaisser : ${m(d.totalReceivable)}.`,
        level: i.level,
        cta: { label: 'Voir les factures', href: '/factures' },
      }
    }
    case 'priorities': {
      const g = buildGlobalInsight(d)
      const list = g.topActions.length > 0
        ? g.topActions.map((a, i) => `${i + 1}. ${a.label}${a.impact ? ` (${a.impact})` : ''}`).join('\n')
        : 'Aucune action urgente. Vous pouvez vous concentrer sur la stratégie long-terme.'
      return {
        question: 'Sur quoi je dois agir cette semaine ?',
        answer: list,
        level: g.health,
      }
    }
    case 'production': {
      const i = insightProduction(d)
      return {
        question: 'Comment va ma production ?',
        answer: `${i.headline}\n\n${i.recommendation ?? ''}\n\nDétail : ${w(d.prodMonth)} ce mois, ${w(d.prod30)} sur 30j (${d.prodTrend > 0 ? '+' : ''}${d.prodTrend.toFixed(1)}% vs 30j précédents).\nYield : ${d.yieldKgM2.toFixed(1)} kg/m² (cible ${d.targetYield.toFixed(1)}).`,
        level: i.level,
        cta: { label: 'Production', href: '/production' },
      }
    }
    case 'quality': {
      const i = insightQuality(d)
      return {
        question: 'Quelle est la qualité de mes tomates ?',
        answer: `${i.headline}\n\n${i.recommendation ?? ''}\n\nDétail : ${d.premiumRate.toFixed(0)}% Cat. 1, ${d.wasteRate.toFixed(1)}% pertes sur ${w(d.totalQ)}.`,
        level: i.level,
        cta: { label: 'Récoltes', href: '/recoltes' },
      }
    }
  }
}

export const QUICK_QUESTIONS: Array<{ key: 'health' | 'margin' | 'cash' | 'priorities' | 'production' | 'quality'; label: string; emoji: string }> = [
  { key: 'health',     label: 'Comment va la ferme ?',          emoji: '🏥' },
  { key: 'priorities', label: 'Mes priorités cette semaine ?',  emoji: '🎯' },
  { key: 'margin',     label: 'Comment est ma rentabilité ?',   emoji: '💰' },
  { key: 'cash',       label: 'Combien j\'ai en caisse ?',      emoji: '🏦' },
  { key: 'production', label: 'Comment va ma production ?',     emoji: '🌱' },
  { key: 'quality',    label: 'Quelle qualité de tomates ?',    emoji: '⭐' },
]
