'use client'
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  // Base
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-display tracking-wide select-none',
    'rounded-md',
    'transition-all duration-150 ease-smooth',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
    'active:scale-[0.98]',
    // Effet shine premium au hover (overlay subtil)
    'relative overflow-hidden',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-brand text-white font-bold uppercase',
          'shadow-[0_2px_10px_var(--neon-dim)]',
          'hover:brightness-110 hover:-translate-y-0.5 hover:shadow-glow',
        ],
        secondary: [
          'bg-brand/10 text-brand border border-brand/25 font-semibold uppercase',
          'hover:bg-brand/20',
        ],
        ghost: [
          'bg-surface-raised text-fg-secondary border border-border',
          'hover:bg-surface-hover hover:text-fg-primary hover:border-border-strong',
        ],
        outline: [
          'bg-transparent text-fg-primary border border-border-strong',
          'hover:bg-surface-hover',
        ],
        destructive: [
          'bg-danger/10 text-danger border border-danger/25 font-semibold',
          'hover:bg-danger/20',
        ],
        link: [
          'bg-transparent text-brand underline-offset-4',
          'hover:underline',
        ],
      },
      size: {
        xs: 'h-6 px-2 text-[10px] gap-1',
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-[13px]',
        lg: 'h-11 px-6 text-sm',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
            </svg>
            <span>{children}</span>
          </>
        ) : children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
