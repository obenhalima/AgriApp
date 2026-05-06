'use client'
import * as React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const cardVariants = cva(
  [
    'relative bg-surface-raised border border-border rounded-lg',
    'transition-all duration-200 ease-smooth',
  ],
  {
    variants: {
      variant: {
        default:  'shadow-raised',
        elevated: 'shadow-floating',
        flat:     'shadow-flat',
        ghost:    'bg-transparent border-dashed',
        gradient: [
          'bg-gradient-to-br from-surface-raised via-surface-raised to-surface-sunk',
          'shadow-floating',
        ],
        accent: [
          'shadow-floating border-brand/30',
          'bg-gradient-to-br from-brand/5 via-surface-raised to-surface-raised',
        ],
        // Premium : conic gradient border animé (utilisé pour KPI hero)
        premium: [
          'shadow-glow',
          'before:absolute before:inset-0 before:rounded-[inherit] before:p-[1px]',
          'before:bg-gradient-conic before:from-brand before:via-data-1 before:to-brand',
          'before:opacity-50 before:[mask:linear-gradient(#fff,transparent_30%,transparent_70%,#fff)]',
          'before:[mask-composite:exclude]',
        ],
      },
      padding: {
        none: 'p-0',
        sm:   'p-3',
        md:   'p-4',
        lg:   'p-5',
        xl:   'p-6',
      },
      interactive: {
        true:  'cursor-pointer hover:-translate-y-0.5 hover:shadow-floating hover:border-border-strong',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'lg',
      interactive: false,
    },
  }
)

export interface CardProps
  extends Omit<HTMLMotionProps<'div'>, 'children'>,
    VariantProps<typeof cardVariants> {
  children?: React.ReactNode
  /** Animation à l'apparition (fade-up au mount) */
  animate?: boolean
  /** Délai d'animation en secondes (pour stagger) */
  delay?: number
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, interactive, animate = false, delay = 0, children, ...props }, ref) => {
    if (animate) {
      return (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
          className={cn(cardVariants({ variant, padding, interactive, className }))}
          {...props}
        >
          {children}
        </motion.div>
      )
    }
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, padding, interactive, className }))}
        {...(props as any)}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'

// Sub-components
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1 pb-4', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-display text-heading text-fg-primary tracking-tight', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-caption text-fg-tertiary font-mono uppercase tracking-wider', className)} {...props} />
  )
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center pt-4 border-t border-border mt-4', className)} {...props} />
  )
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants }
