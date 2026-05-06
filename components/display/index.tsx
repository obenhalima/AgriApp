'use client'
/**
 * Composants d'affichage typés métier.
 * Utilisent les helpers de lib/format.ts + tooltip valeur exacte au hover.
 *
 *   <MoneyDisplay value={1234567} compact />
 *   <VolumeDisplay value={3500} />
 *   <AreaDisplay value={42000} />
 *   <PercentDisplay value={12.5} signed />
 *   <DateDisplay value="2025-08-15" variant="compact" />
 */
import * as React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  formatMoney, formatWeight, formatArea, formatPercent, formatNumber,
  formatDate, formatRelative, formatCount,
  type FormatMoneyOpts, type FormatPercentOpts, type DateVariant, type CompactMode, type TrendInfo,
} from '@/lib/format'
import { Tooltip } from '@/components/ui/Tooltip'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'

// ════════════════════════════════════════════════════════════════════════════
// MONEY
// ════════════════════════════════════════════════════════════════════════════

export interface MoneyDisplayProps extends FormatMoneyOpts {
  value: number | null | undefined
  /** Tooltip avec la valeur exacte au hover */
  showTooltip?: boolean
  /** Anime la valeur au mount (count-up) */
  animate?: boolean
  className?: string
}

export function MoneyDisplay({
  value, currency = 'MAD', compact = 'never', decimals, showCurrency = true, signed = false,
  showTooltip = true, animate = false, className,
}: MoneyDisplayProps) {
  if (value == null || isNaN(value) || value === 0) {
    return <span className={cn('text-fg-tertiary font-mono', className)}>—</span>
  }

  const fmtOpts: FormatMoneyOpts = { currency, compact, decimals, showCurrency, signed }
  const isNeg = value < 0

  const displayNode = animate ? (
    <AnimatedNumber
      value={value}
      format={(n) => formatMoney(n, fmtOpts)}
      className={cn('font-mono tabular-nums tracking-tight', isNeg && 'text-danger', className)}
    />
  ) : (
    <span className={cn('font-mono tabular-nums tracking-tight', isNeg && 'text-danger', className)}>
      {formatMoney(value, fmtOpts)}
    </span>
  )

  if (!showTooltip || compact === 'never') return displayNode
  return (
    <Tooltip content={formatMoney(value, { ...fmtOpts, compact: 'never', decimals: 2 })}>
      {displayNode}
    </Tooltip>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VOLUME (kg/t)
// ════════════════════════════════════════════════════════════════════════════

export function VolumeDisplay({
  value, compact = 'auto', decimals, forceUnit, showTooltip = true, className,
}: {
  value: number | null | undefined
  compact?: CompactMode
  decimals?: number
  forceUnit?: 'kg' | 't'
  showTooltip?: boolean
  className?: string
}) {
  if (value == null || isNaN(value) || value === 0) {
    return <span className={cn('text-fg-tertiary font-mono', className)}>—</span>
  }
  const display = (
    <span className={cn('font-mono tabular-nums', className)}>
      {formatWeight(value, { compact, decimals, forceUnit })}
    </span>
  )
  if (!showTooltip) return display
  return (
    <Tooltip content={formatWeight(value, { compact: 'never' })}>{display}</Tooltip>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// AREA (m²/ha)
// ════════════════════════════════════════════════════════════════════════════

export function AreaDisplay({
  value, compact = 'auto', decimals, forceUnit, showTooltip = true, className,
}: {
  value: number | null | undefined
  compact?: CompactMode
  decimals?: number
  forceUnit?: 'm2' | 'ha'
  showTooltip?: boolean
  className?: string
}) {
  if (value == null || isNaN(value) || value === 0) {
    return <span className={cn('text-fg-tertiary font-mono', className)}>—</span>
  }
  const display = (
    <span className={cn('font-mono tabular-nums', className)}>
      {formatArea(value, { compact, decimals, forceUnit })}
    </span>
  )
  if (!showTooltip) return display
  return (
    <Tooltip content={formatArea(value, { compact: 'never' })}>{display}</Tooltip>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PERCENT
// ════════════════════════════════════════════════════════════════════════════

export interface PercentDisplayProps extends FormatPercentOpts {
  value: number | null | undefined
  /** Couleur selon contexte */
  context?: 'revenue' | 'expense' | 'neutral'
  className?: string
}

export function PercentDisplay({ value, decimals = 1, signed = false, fraction = false, context, className }: PercentDisplayProps) {
  if (value == null || isNaN(value)) {
    return <span className={cn('text-fg-tertiary font-mono', className)}>—</span>
  }
  const v = fraction ? value * 100 : value
  let color = ''
  if (context === 'revenue') color = v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-fg-tertiary'
  if (context === 'expense') color = v > 0 ? 'text-danger' : v < 0 ? 'text-success' : 'text-fg-tertiary'

  return (
    <span className={cn('font-mono tabular-nums', color, className)}>
      {formatPercent(value, { decimals, signed, fraction })}
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// NUMBER (général)
// ════════════════════════════════════════════════════════════════════════════

export function NumberDisplay({
  value, decimals, compact = 'never', animate = false, className,
}: {
  value: number | null | undefined
  decimals?: number
  compact?: CompactMode
  animate?: boolean
  className?: string
}) {
  if (value == null || isNaN(value)) return <span className={cn('text-fg-tertiary font-mono', className)}>—</span>

  if (animate) {
    return (
      <AnimatedNumber
        value={value}
        format={(n) => formatNumber(n, { decimals, compact })}
        className={cn('font-mono tabular-nums', className)}
      />
    )
  }
  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {formatNumber(value, { decimals, compact })}
    </span>
  )
}

export function CountDisplay({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{formatCount(value)}</span>
}

// ════════════════════════════════════════════════════════════════════════════
// DATE
// ════════════════════════════════════════════════════════════════════════════

export function DateDisplay({
  value, variant = 'compact', showRelative = false, className,
}: {
  value: string | Date | null | undefined
  variant?: DateVariant
  showRelative?: boolean
  className?: string
}) {
  if (value == null) return <span className={cn('text-fg-tertiary font-mono', className)}>—</span>
  const display = (
    <span className={cn(variant === 'mono' ? 'font-mono' : '', className)}>
      {formatDate(value, variant)}
    </span>
  )
  if (!showRelative) return display
  return (
    <Tooltip content={formatRelative(value)}>
      {display}
    </Tooltip>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TREND INDICATOR (variation %)
// ════════════════════════════════════════════════════════════════════════════

export function TrendIndicator({
  trend, size = 'sm', className,
}: {
  trend: TrendInfo
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus
  const colorClass = trend.isGood ? 'text-success' : 'text-danger'
  const sizes = {
    xs: { icon: 10, text: 'text-[10px]' },
    sm: { icon: 12, text: 'text-[11px]' },
    md: { icon: 14, text: 'text-[12px]' },
  }
  return (
    <span className={cn('inline-flex items-center gap-1 font-mono tabular-nums font-semibold', sizes[size].text, colorClass, className)}>
      <Icon size={sizes[size].icon} />
      {trend.display}
    </span>
  )
}
