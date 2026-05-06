'use client'
/**
 * EmptyState — état vide unifié, animé, avec icône + titre + description + CTA optionnel.
 */
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export function EmptyState({
  icon: Icon, title, description, action, iconColor = 'var(--tx-3)', className,
}: {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  iconColor?: string
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'py-2xl px-lg gap-md',
        'rounded-lg border border-dashed border-border-strong bg-surface-raised',
        className
      )}
    >
      {Icon && (
        <div
          className="rounded-2xl flex items-center justify-center"
          style={{
            width: 64, height: 64,
            background: `color-mix(in srgb, ${iconColor} 10%, transparent)`,
            color: iconColor,
          }}
        >
          <Icon size={28} strokeWidth={1.8} />
        </div>
      )}
      <div className="space-y-2">
        <h3 className="font-display text-heading-lg text-fg-primary">{title}</h3>
        {description && (
          <p className="text-body-sm text-fg-tertiary max-w-md mx-auto">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </motion.div>
  )
}
