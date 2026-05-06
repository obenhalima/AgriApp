'use client'
/**
 * PageHeader — bandeau supérieur uniformisé pour les pages.
 *   - Titre + sous-titre + icône
 *   - Slot droit pour actions (boutons)
 *   - Animation fade-down au mount
 *   - Stats bar optionnelle en dessous
 */
import * as React from 'react'
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface PageHeaderProps {
  title: string
  subtitle?: string
  description?: React.ReactNode
  icon?: LucideIcon
  iconColor?: string
  /** Actions à droite (boutons, toggles…) */
  actions?: React.ReactNode
  /** Stats agrégées sous le header */
  stats?: { label: string; value: React.ReactNode; icon?: LucideIcon; color?: string }[]
  className?: string
}

export function PageHeader({
  title, subtitle, description, icon: Icon, iconColor = 'var(--neon)',
  actions, stats, className,
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className={cn('mb-lg', className)}
    >
      <div className="flex items-start justify-between gap-lg flex-wrap mb-md">
        <div className="flex items-start gap-md min-w-0">
          {Icon && (
            <div
              className="rounded-lg flex items-center justify-center flex-shrink-0 mt-1"
              style={{
                width: 44, height: 44,
                background: `color-mix(in srgb, ${iconColor} 14%, transparent)`,
                border: `1px solid color-mix(in srgb, ${iconColor} 25%, transparent)`,
                color: iconColor,
              }}
            >
              <Icon size={22} strokeWidth={2.2} />
            </div>
          )}
          <div className="min-w-0">
            {subtitle && (
              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-1">
                {subtitle}
              </div>
            )}
            <h1 className="font-display text-display-sm sm:text-display text-fg-primary tracking-tight truncate">
              {title}
            </h1>
            {description && (
              <div className="text-body-sm text-fg-secondary mt-1">{description}</div>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-xs flex-shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-sm">
          {stats.map((s, i) => {
            const StatIcon = s.icon
            const color = s.color ?? 'var(--neon)'
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04, duration: 0.3 }}
                className="rounded-md border border-border bg-surface-raised px-md py-sm flex items-center gap-sm"
              >
                {StatIcon && (
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
                  >
                    <StatIcon size={14} strokeWidth={2.2} />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-fg-tertiary leading-tight">
                    {s.label}
                  </div>
                  <div className="font-mono tabular-nums text-body font-bold text-fg-primary leading-tight" style={{ color }}>
                    {s.value}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
