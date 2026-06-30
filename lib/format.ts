/**
 * FarmPilot — Helpers de formatage unifiés.
 *
 * Une seule source de vérité pour afficher tous les chiffres dans l'app.
 * Locale FR avec espaces fines insécables, modes compact (auto/always/never),
 * fallback dash propre pour zéros et nullables.
 *
 * Tous les helpers retournent une string. Pour avoir le détail (raw + display
 * + tooltip), utilise les fonctions `*Detail()` qui retournent un objet.
 */

const NB_SPACE = ' '  // espace fine insécable (séparateur milliers FR moderne)

// ════════════════════════════════════════════════════════════════════════════
// MONÉTAIRE
// ════════════════════════════════════════════════════════════════════════════

export type CompactMode = 'auto' | 'always' | 'never'

export type FormatMoneyOpts = {
  /** Devise — défaut MAD */
  currency?: 'MAD' | 'EUR' | 'USD'
  /** Mode compact : 1234567 → "1,2 M MAD" */
  compact?: CompactMode
  /** Décimales (override le défaut intelligent) */
  decimals?: number
  /** Affiche le symbole de devise ? */
  showCurrency?: boolean
  /** Force le signe + pour les positifs */
  signed?: boolean
}

const CURRENCY_SYMBOL: Record<string, string> = {
  MAD: 'MAD',
  EUR: '€',
  USD: '$',
}

/**
 * Format monétaire intelligent.
 * @example
 *   formatMoney(1234567)            → "1 234 567 MAD"
 *   formatMoney(1234567, { compact: 'auto' })  → "1,23 M MAD"
 *   formatMoney(0)                  → "—"
 *   formatMoney(-3500, { signed: true })  → "(3 500 MAD)"
 */
export function formatMoney(value: number | null | undefined, opts: FormatMoneyOpts = {}): string {
  if (value == null || isNaN(value)) return '—'
  if (value === 0) return '—'

  const {
    currency = 'MAD',
    compact = 'never',
    decimals,
    showCurrency = true,
    signed = false,
  } = opts

  const abs = Math.abs(value)
  const sym = showCurrency ? ` ${CURRENCY_SYMBOL[currency] ?? currency}` : ''

  // Mode compact
  let str: string
  if (compact === 'always' || (compact === 'auto' && abs >= 1000)) {
    if (abs >= 1_000_000_000) str = `${(value / 1_000_000_000).toFixed(decimals ?? 2)} Md`
    else if (abs >= 1_000_000) str = `${(value / 1_000_000).toFixed(decimals ?? 2)} M`
    else if (abs >= 1_000)     str = `${(value / 1_000).toFixed(decimals ?? 1)} k`
    else                       str = `${value.toFixed(decimals ?? 0)}`
    str = str.replace('.', ',')
  } else {
    str = value.toLocaleString('fr-FR', {
      minimumFractionDigits: decimals ?? 2,
      maximumFractionDigits: decimals ?? 2,
    }).replace(/\s/g, NB_SPACE)
  }

  // Convention comptable : négatifs entre parenthèses
  if (value < 0) {
    str = str.replace('-', '')
    return `(${str.trim()}${sym})`
  }

  return `${signed && value > 0 ? '+' : ''}${str}${sym}`
}

/** Variante avec détail (raw + display + tooltip de la valeur exacte) */
export function formatMoneyDetail(value: number | null | undefined, opts: FormatMoneyOpts = {}) {
  if (value == null || isNaN(value)) return { display: '—', tooltip: 'Non renseigné', raw: 0 }
  return {
    display: formatMoney(value, opts),
    tooltip: formatMoney(value, { ...opts, compact: 'never', decimals: 2 }),
    raw: value,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// VOLUME (kg / t)
// ════════════════════════════════════════════════════════════════════════════

/** Format auto kg ↔ t selon la magnitude. */
export function formatWeight(kg: number | null | undefined, opts: { compact?: CompactMode; decimals?: number; forceUnit?: 'kg' | 't' } = {}): string {
  if (kg == null || isNaN(kg) || kg === 0) return '—'
  const abs = Math.abs(kg)
  const { compact = 'auto', decimals, forceUnit } = opts

  if (forceUnit === 't' || (forceUnit !== 'kg' && compact !== 'never' && abs >= 1000)) {
    return `${(kg / 1000).toFixed(decimals ?? 1).replace('.', ',')}${NB_SPACE}t`
  }
  return `${Math.round(kg).toLocaleString('fr-FR').replace(/\s/g, NB_SPACE)}${NB_SPACE}kg`
}

// ════════════════════════════════════════════════════════════════════════════
// SURFACE (m² / ha)
// ════════════════════════════════════════════════════════════════════════════

/** Format auto m² ↔ ha selon la magnitude. */
export function formatArea(m2: number | null | undefined, opts: { compact?: CompactMode; decimals?: number; forceUnit?: 'm2' | 'ha' } = {}): string {
  if (m2 == null || isNaN(m2) || m2 === 0) return '—'
  const { compact = 'auto', decimals, forceUnit } = opts

  if (forceUnit === 'ha' || (forceUnit !== 'm2' && compact !== 'never' && m2 >= 10000)) {
    return `${(m2 / 10000).toFixed(decimals ?? 2).replace('.', ',')}${NB_SPACE}ha`
  }
  return `${Math.round(m2).toLocaleString('fr-FR').replace(/\s/g, NB_SPACE)}${NB_SPACE}m²`
}

// ════════════════════════════════════════════════════════════════════════════
// POURCENTAGES
// ════════════════════════════════════════════════════════════════════════════

export type FormatPercentOpts = {
  /** Décimales — défaut 1 */
  decimals?: number
  /** Force le signe ± */
  signed?: boolean
  /** Si true, value est en 0..1 (sera *100). Si false, en 0..100. Défaut: false. */
  fraction?: boolean
}

/**
 * @example
 *   formatPercent(12.5)               → "12,5 %"
 *   formatPercent(0.125, { fraction: true })  → "12,5 %"
 *   formatPercent(-3.2, { signed: true })     → "-3,2 %"
 */
export function formatPercent(value: number | null | undefined, opts: FormatPercentOpts = {}): string {
  if (value == null || isNaN(value)) return '—'
  const { decimals = 1, signed = false, fraction = false } = opts
  const v = fraction ? value * 100 : value
  const sign = signed && v > 0 ? '+' : ''
  return `${sign}${v.toFixed(decimals).replace('.', ',')}${NB_SPACE}%`
}

// ════════════════════════════════════════════════════════════════════════════
// NOMBRES GÉNÉRAUX
// ════════════════════════════════════════════════════════════════════════════

export function formatNumber(value: number | null | undefined, opts: { decimals?: number; compact?: CompactMode } = {}): string {
  if (value == null || isNaN(value)) return '—'
  if (value === 0) return '—'
  const { decimals = 0, compact = 'never' } = opts
  const abs = Math.abs(value)

  if (compact === 'always' || (compact === 'auto' && abs >= 1000)) {
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(decimals || 1).replace('.', ',')}M`
    if (abs >= 1_000)     return `${(value / 1_000).toFixed(decimals || 1).replace('.', ',')}k`
  }

  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).replace(/\s/g, NB_SPACE)
}

/** Compteur d'unités sans décimales (saisons, plants…). */
export function formatCount(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('fr-FR').replace(/\s/g, NB_SPACE)
}

// ════════════════════════════════════════════════════════════════════════════
// DATES
// ════════════════════════════════════════════════════════════════════════════

export type DateVariant = 'short' | 'long' | 'compact' | 'mono' | 'iso' | 'time'

/**
 * @example
 *   formatDate('2025-08-15', 'short')   → "15 août 2025"
 *   formatDate('2025-08-15', 'compact') → "15 août 25"
 *   formatDate('2025-08-15', 'mono')    → "15/08/25"
 */
export function formatDate(date: string | Date | null | undefined, variant: DateVariant = 'short'): string {
  if (date == null) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(+d)) return '—'

  const opts: Record<DateVariant, Intl.DateTimeFormatOptions> = {
    'short':   { day: '2-digit', month: 'long', year: 'numeric' },
    'long':    { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' },
    'compact': { day: '2-digit', month: 'short', year: '2-digit' },
    'mono':    { day: '2-digit', month: '2-digit', year: '2-digit' },
    'iso':     { day: '2-digit', month: '2-digit', year: 'numeric' },
    'time':    { hour: '2-digit', minute: '2-digit' },
  }
  return d.toLocaleDateString('fr-FR', opts[variant])
}

export function formatDateRange(start: string | Date | null, end: string | Date | null, variant: DateVariant = 'compact'): string {
  if (!start && !end) return '—'
  return `${formatDate(start, variant)} → ${formatDate(end, variant)}`
}

/** "il y a 3 jours" / "dans 2 mois" */
export function formatRelative(date: string | Date | null | undefined): string {
  if (date == null) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(+d)) return '—'

  const diff = +d - Date.now()
  const absDays = Math.abs(diff) / (1000 * 60 * 60 * 24)

  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })
  if (absDays < 1) {
    const hours = Math.round(diff / (1000 * 60 * 60))
    return rtf.format(hours, 'hour')
  }
  if (absDays < 30) return rtf.format(Math.round(diff / (1000 * 60 * 60 * 24)), 'day')
  if (absDays < 365) return rtf.format(Math.round(diff / (1000 * 60 * 60 * 24 * 30)), 'month')
  return rtf.format(Math.round(diff / (1000 * 60 * 60 * 24 * 365)), 'year')
}

/** "3 mois 12 jours" */
export function formatDuration(days: number | null | undefined): string {
  if (days == null || isNaN(days) || days <= 0) return '—'
  if (days < 7) return `${days} jour${days > 1 ? 's' : ''}`
  if (days < 30) {
    const w = Math.floor(days / 7)
    const d = days % 7
    return `${w} sem${w > 1 ? 's' : ''}${d > 0 ? ` ${d}j` : ''}`
  }
  if (days < 365) {
    const m = Math.floor(days / 30)
    const d = days % 30
    return `${m} mois${d > 0 ? ` ${d}j` : ''}`
  }
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  return `${y} an${y > 1 ? 's' : ''}${m > 0 ? ` ${m} mois` : ''}`
}

// ════════════════════════════════════════════════════════════════════════════
// TENDANCES (variations)
// ════════════════════════════════════════════════════════════════════════════

export type TrendInfo = {
  display: string         // "+12,5 %"
  direction: 'up' | 'down' | 'flat'
  delta: number           // valeur brute
  isGood: boolean         // selon le contexte (revenue=up bien, expense=up mal)
}

/**
 * Calcule une variation entre deux valeurs.
 * @param context - 'revenue' (up=positif), 'expense' (down=positif), 'neutral'
 */
export function computeTrend(
  current: number,
  previous: number,
  context: 'revenue' | 'expense' | 'neutral' = 'revenue'
): TrendInfo {
  if (previous === 0 || isNaN(previous) || isNaN(current)) {
    return { display: '—', direction: 'flat', delta: 0, isGood: true }
  }
  const delta = current - previous
  const pct = (delta / Math.abs(previous)) * 100
  const direction: TrendInfo['direction'] = Math.abs(pct) < 0.1 ? 'flat' : pct > 0 ? 'up' : 'down'
  const isGood =
    context === 'revenue' ? direction !== 'down'
    : context === 'expense' ? direction !== 'up'
    : true
  return { display: formatPercent(pct, { signed: true, decimals: 1 }), direction, delta, isGood }
}
