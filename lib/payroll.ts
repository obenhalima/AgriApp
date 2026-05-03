// ============================================================
// CALCULS DE PAIE — STANDARDS MAROC
// Sources : code du travail marocain, CNSS, AMO, barème IR (LF 2024).
// ============================================================

// ─── Plafonds & taux (à mettre à jour si la loi change) ──────
export const CNSS_CEILING_MONTHLY = 6000      // MAD/mois — plafond CNSS
export const RATE_CNSS_EMPLOYEE = 0.0448      // 4,48 %
export const RATE_AMO_EMPLOYEE = 0.0226       // 2,26 % — non plafonnée
export const RATE_CNSS_EMPLOYER = 0.0898      // 8,98 % (plafonné)
export const RATE_AMO_EMPLOYER = 0.0411       // 4,11 % (non plafonné)
export const RATE_FAMILY_ALLOWANCE = 0.064    // 6,4 %  (plafonné)
export const RATE_PROF_TRAINING = 0.016       // 1,6 %  (non plafonné)

// Frais professionnels : abattement 35 % du brut imposable, plafonné 35 000 MAD/an
export const PROF_FEES_RATE = 0.35
export const PROF_FEES_CAP_YEARLY = 35000
export const PROF_FEES_CAP_MONTHLY = PROF_FEES_CAP_YEARLY / 12  // 2916,67 MAD/mois

// Déduction familiale : 360 MAD / an / personne à charge (max 6)
// = 30 MAD / mois / personne
export const FAMILY_DEDUCTION_MONTHLY = 30
export const MAX_DEPENDENTS_FOR_DEDUCTION = 6

// Barème IR mensuel (Loi de Finances Maroc, applicable dès 2024)
// Les seuils annuels sont divisés par 12 pour le calcul mensuel.
// Source : Direction Générale des Impôts - barème en vigueur.
export type IRBracket = { upTo: number; rate: number; deduction: number }
export const IR_BRACKETS_MONTHLY: IRBracket[] = [
  // upTo : limite supérieure mensuelle inclusive
  // rate : taux marginal
  // deduction : somme à déduire après application du taux
  { upTo: 2500,    rate: 0.00, deduction: 0 },        // 30 000 / 12
  { upTo: 4166.67, rate: 0.10, deduction: 250 },      // 50 000 / 12
  { upTo: 5000,    rate: 0.20, deduction: 666.67 },   // 60 000 / 12
  { upTo: 6666.67, rate: 0.30, deduction: 1166.67 },  // 80 000 / 12
  { upTo: 15000,   rate: 0.34, deduction: 1433.33 },  // 180 000 / 12
  { upTo: Infinity,rate: 0.37, deduction: 1883.33 },
]

// ─── Types ───────────────────────────────────────────────────
export type PayFrequency = 'mensuel' | 'quinzaine' | 'journalier'
export type EmployeeCategory = 'fermier' | 'staff_admin' | 'saisonnier'

export type PayrollInput = {
  /** Salaire brut MENSUEL équivalent (référence pour CNSS plafonné) */
  baseSalaryMonthly: number
  /** Fréquence de paie de l'employé */
  payFrequency: PayFrequency
  /** Catégorie (informatif, n'influence pas le calcul) */
  category?: EmployeeCategory
  /** Personnes à charge (enfants) */
  dependents?: number
  /** Statut familial */
  familyStatus?: 'celibataire' | 'marie' | 'divorce' | 'veuf'
  /** Jours travaillés sur la période (utilisé pour saisonniers/journaliers) */
  daysWorked?: number
  /** Heures supplémentaires (montant déjà majoré, optionnel) */
  overtimeAmount?: number
  /** Primes / bonus (optionnel) */
  bonuses?: number
  /** Autres déductions (avance, prêt, etc.) */
  otherDeductions?: number
}

export type PayrollResult = {
  // Brut
  base_amount: number
  overtime_amount: number
  bonuses: number
  gross_salary: number
  // Cotisations salariales
  cnss_employee: number
  amo_employee: number
  ir_amount: number
  other_deductions: number
  // Net
  net_salary: number
  // Cotisations patronales
  cnss_employer: number
  amo_employer: number
  family_allowance_employer: number
  prof_training_employer: number
  total_employer_cost: number
  // Détail calculs (debug)
  details: {
    period_factor: number              // 1 = mensuel, 0.5 = quinzaine, jours/26 = journalier
    cnss_base: number                  // assiette CNSS (plafonné)
    amo_base: number                   // assiette AMO (non plafonné)
    taxable_income: number             // revenu imposable mensuel équivalent
    prof_fees_deduction: number
    family_deduction: number
    net_taxable: number
    ir_bracket: number                 // taux du palier appliqué
  }
}

// ─── Helpers ─────────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100

/** Détermine le facteur de période. */
function periodFactor(freq: PayFrequency, daysWorked?: number): number {
  if (freq === 'mensuel') return 1
  if (freq === 'quinzaine') return 0.5
  if (freq === 'journalier') return Math.max(0, (daysWorked ?? 0) / 26)  // 26 jours/mois standard
  return 1
}

/** Calcule l'IR mensuel à partir du net imposable mensuel équivalent. */
export function computeMonthlyIR(netTaxableMonthly: number, dependents: number = 0): { ir: number; bracket: number } {
  if (netTaxableMonthly <= 0) return { ir: 0, bracket: 0 }

  const bracket = IR_BRACKETS_MONTHLY.find(b => netTaxableMonthly <= b.upTo)!
  const grossIR = netTaxableMonthly * bracket.rate - bracket.deduction
  const familyDed = Math.min(dependents, MAX_DEPENDENTS_FOR_DEDUCTION) * FAMILY_DEDUCTION_MONTHLY
  const ir = Math.max(0, grossIR - familyDed)
  return { ir: round2(ir), bracket: bracket.rate }
}

// ─── Calcul principal ────────────────────────────────────────
export function computePayroll(input: PayrollInput): PayrollResult {
  const factor = periodFactor(input.payFrequency, input.daysWorked)
  const baseAmount = round2(input.baseSalaryMonthly * factor)
  const overtime = round2(input.overtimeAmount ?? 0)
  const bonuses = round2(input.bonuses ?? 0)
  const grossSalary = round2(baseAmount + overtime + bonuses)

  // Assiettes :
  // - CNSS : brut total, plafonné à CNSS_CEILING_MONTHLY × factor
  // - AMO + cotisations non plafonnées : brut total
  const cnssCeil = CNSS_CEILING_MONTHLY * factor
  const cnssBase = Math.min(grossSalary, cnssCeil)
  const amoBase = grossSalary

  // Cotisations salariales
  const cnssEmployee = round2(cnssBase * RATE_CNSS_EMPLOYEE)
  const amoEmployee = round2(amoBase * RATE_AMO_EMPLOYEE)

  // Cotisations patronales (vrai coût pour l'entreprise)
  const cnssEmployer = round2(cnssBase * RATE_CNSS_EMPLOYER)
  const amoEmployer = round2(amoBase * RATE_AMO_EMPLOYER)
  const familyAllowance = round2(cnssBase * RATE_FAMILY_ALLOWANCE)
  const profTraining = round2(amoBase * RATE_PROF_TRAINING)

  // Calcul IR (toujours sur l'équivalent mensuel pour le barème, puis prorata)
  // Étape 1 : reconvertir le brut période en équivalent mensuel
  const grossMonthlyEq = factor > 0 ? grossSalary / factor : grossSalary
  const cnssEmployeeMonthly = cnssEmployee / Math.max(factor, 0.01)
  const amoEmployeeMonthly = amoEmployee / Math.max(factor, 0.01)

  // Étape 2 : abattement frais pro
  const profFees = Math.min(grossMonthlyEq * PROF_FEES_RATE, PROF_FEES_CAP_MONTHLY)
  const taxableIncome = Math.max(0, grossMonthlyEq - cnssEmployeeMonthly - amoEmployeeMonthly - profFees)

  // Étape 3 : barème IR mensuel + déduction familiale
  const { ir: irMonthly, bracket } = computeMonthlyIR(taxableIncome, input.dependents ?? 0)
  const irAmount = round2(irMonthly * factor)  // proratisé sur la période

  const otherDeductions = round2(input.otherDeductions ?? 0)
  const netSalary = round2(grossSalary - cnssEmployee - amoEmployee - irAmount - otherDeductions)

  const totalEmployerCost = round2(
    grossSalary + cnssEmployer + amoEmployer + familyAllowance + profTraining
  )

  return {
    base_amount: baseAmount,
    overtime_amount: overtime,
    bonuses,
    gross_salary: grossSalary,
    cnss_employee: cnssEmployee,
    amo_employee: amoEmployee,
    ir_amount: irAmount,
    other_deductions: otherDeductions,
    net_salary: netSalary,
    cnss_employer: cnssEmployer,
    amo_employer: amoEmployer,
    family_allowance_employer: familyAllowance,
    prof_training_employer: profTraining,
    total_employer_cost: totalEmployerCost,
    details: {
      period_factor: factor,
      cnss_base: cnssBase,
      amo_base: amoBase,
      taxable_income: round2(taxableIncome),
      prof_fees_deduction: round2(profFees),
      family_deduction: Math.min(input.dependents ?? 0, MAX_DEPENDENTS_FOR_DEDUCTION) * FAMILY_DEDUCTION_MONTHLY,
      net_taxable: round2(taxableIncome),
      ir_bracket: bracket,
    },
  }
}

// ─── Utilitaires ─────────────────────────────────────────────

/** Formate un montant en MAD avec séparateurs FR. */
export function fmtMAD(n: number): string {
  return Math.round(n).toLocaleString('fr-FR') + ' MAD'
}

/** Génère le code période standard. */
export function periodCode(year: number, month: number, half: 'full' | 'first' | 'second'): string {
  const m = String(month).padStart(2, '0')
  const suffix = half === 'full' ? 'M' : half === 'first' ? 'Q1' : 'Q2'
  return `PAY-${year}-${m}-${suffix}`
}

/** Calcule les bornes de période. */
export function periodBounds(year: number, month: number, half: 'full' | 'first' | 'second'):
  { start: string; end: string; payDate: string }
{
  const lastDay = new Date(year, month, 0).getDate()
  if (half === 'full') {
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end,
      payDate: end,  // payé en fin de mois
    }
  }
  if (half === 'first') {
    return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: `${year}-${String(month).padStart(2, '0')}-15`,
      payDate: `${year}-${String(month).padStart(2, '0')}-15`,
    }
  }
  // second
  return {
    start: `${year}-${String(month).padStart(2, '0')}-16`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    payDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}
