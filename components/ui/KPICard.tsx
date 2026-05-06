'use client'
import * as React from 'react'
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Card } from './Card'
import { TrendIndicator } from '@/components/display'
import type { TrendInfo } from '@/lib/format'

export interface KPICardProps {
  label: string
  value: React.ReactNode               // peut être un MoneyDisplay, AreaDisplay, AnimatedNumber…
  sub?: React.ReactNode                // sous-texte (formatMoney(avgPrice) etc.)
  icon?: LucideIcon
  trend?: TrendInfo                    // variation
  /** Couleur d'accent (CSS var ou hex) */
  accent?: string
  /** Sparkline data optionnelle (7-30 derniers points) */
  sparkline?: number[]
  /** Variante visuelle */
  variant?: 'default' | 'hero' | 'compact'
  /** Onclick pour navigation */
  onClick?: () => void
  /** Délai pour stagger animation */
  delay?: number
  className?: string
}

/**
 * KPI Card premium :
 *   - Animation fade-up au mount
 *   - Hover lift + glow
 *   - Sparkline mini-chart en bas (si data fournie)
 *   - Trend indicator avec icône directionnelle
 *   - Effet shine subtil au mount
 */
export function KPICard({
  label, value, sub, icon: Icon, trend, accent = 'var(--neon)',
  sparkline, variant = 'default', onClick, delay = 0, className,
}: KPICardProps) {
  const isHero = variant === 'hero'
  const isCompact = variant === 'compact'

  return (
    <Card
      animate
      delay={delay}
      interactive={!!onClick}
      onClick={onClick}
      variant={isHero ? 'premium' : 'default'}
      padding={isCompact ? 'md' : 'lg'}
      className={cn(
        'group relative overflow-hidden',
        'border-l-[3px]',
        className
      )}
      style={{ borderLeftColor: accent } as React.CSSProperties}
    >
      {/* Glow d'accent en haut */}
      {isHero && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full blur-2xl opacity-30 group-hover:opacity-50 transition-opacity duration-500"
          style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)` }}
        />
      )}

      {/* Header (label + icon) */}
      <div className="flex items-center justify-between mb-2">
        <div
          className={cn(
            'font-mono uppercase tracking-wider text-fg-tertiary',
            isCompact ? 'text-[9px]' : 'text-[10px]'
          )}
        >
          {label}
        </div>
        {Icon && (
          <div
            className="rounded-md flex items-center justify-center transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3"
            style={{
              width: isCompact ? 24 : 32,
              height: isCompact ? 24 : 32,
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
            }}
          >
            <Icon size={isCompact ? 14 : 18} strokeWidth={2.2} />
          </div>
        )}
      </div>

      {/* Valeur principale */}
      <div
        className={cn(
          'font-display font-extrabold leading-none tracking-tight',
          isCompact ? 'text-display-sm' : isHero ? 'text-display-lg' : 'text-display'
        )}
        style={{ color: accent }}
      >
        {value}
      </div>

      {/* Sub + Trend */}
      {(sub || trend) && (
        <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
          {sub && (
            <div className={cn('font-mono text-fg-tertiary', isCompact ? 'text-[10px]' : 'text-[11px]')}>
              {sub}
            </div>
          )}
          {trend && <TrendIndicator trend={trend} size={isCompact ? 'xs' : 'sm'} />}
        </div>
      )}

      {/* Sparkline */}
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 h-8 -mx-1">
          <Sparkline data={sparkline} color={accent} />
        </div>
      )}

      {/* Effet shine au mount (hero only) */}
      {isHero && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={{ x: '-100%', opacity: 0 }}
          animate={{ x: '100%', opacity: [0, 0.15, 0] }}
          transition={{ duration: 1.5, delay: delay + 0.6, ease: 'easeOut' }}
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
            transform: 'skewX(-15deg)',
          }}
        />
      )}
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SPARKLINE — mini line chart SVG
// ════════════════════════════════════════════════════════════════════════════
function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null

  const width = 100  // viewBox ratio (sera étiré)
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return { x, y, v }
  })

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`

  // Animation du tracé (stroke-dasharray)
  const id = React.useId().replace(/:/g, '')

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={areaD}
        fill={`url(#grad-${id})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      />
      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
      {/* Dernier point */}
      <motion.circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2}
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1.2, type: 'spring', stiffness: 300 }}
      />
    </svg>
  )
}
