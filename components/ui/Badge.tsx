'use client'
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 rounded-md',
    'font-mono uppercase tracking-wider font-semibold',
    'transition-colors duration-150',
  ],
  {
    variants: {
      variant: {
        default:  'bg-surface-sunk text-fg-secondary border border-border',
        brand:    'bg-brand/12 text-brand border border-brand/25',
        success:  'bg-success/12 text-success border border-success/25',
        warning:  'bg-warning/12 text-warning border border-warning/25',
        danger:   'bg-danger/12 text-danger border border-danger/25',
        info:     'bg-info/12 text-info border border-info/25',
        // Métiers
        revenue:  'bg-success/12 text-success border border-success/25',
        expense:  'bg-danger/12 text-danger border border-danger/25',
        // Solid
        solid:    'bg-brand text-white border border-brand',
        outline:  'bg-transparent text-fg-secondary border border-border-strong',
      },
      size: {
        xs: 'h-4 px-1.5 text-[9px]',
        sm: 'h-5 px-2 text-[10px]',
        md: 'h-6 px-2.5 text-[11px]',
        lg: 'h-7 px-3 text-[12px]',
      },
      pulse: {
        true: 'animate-glow-pulse',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
      pulse: false,
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Petit point coloré devant le label */
  dot?: boolean
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, pulse, dot = false, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size, pulse, className }))}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {children}
    </span>
  )
)
Badge.displayName = 'Badge'

export { Badge, badgeVariants }
