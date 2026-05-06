'use client'
/**
 * Input + Select + Textarea + Label : composants form unifiés.
 */
import * as React from 'react'
import { cn } from '@/lib/cn'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full h-9 px-3 rounded-md border border-border bg-surface-input',
        'text-body text-fg-primary placeholder:text-fg-muted',
        'transition-colors duration-150 outline-none',
        'focus:border-brand focus:ring-2 focus:ring-brand/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full h-9 px-3 rounded-md border border-border bg-surface-input',
        'text-body text-fg-primary',
        'transition-colors duration-150 outline-none cursor-pointer',
        'focus:border-brand focus:ring-2 focus:ring-brand/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full px-3 py-2 rounded-md border border-border bg-surface-input',
        'text-body text-fg-primary placeholder:text-fg-muted',
        'transition-colors duration-150 outline-none resize-vertical min-h-[80px]',
        'focus:border-brand focus:ring-2 focus:ring-brand/20',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export function Label({
  children, htmlFor, required, className,
}: {
  children: React.ReactNode
  htmlFor?: string
  required?: boolean
  className?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'block font-mono text-[10px] uppercase tracking-wider text-fg-tertiary mb-1.5',
        className
      )}
    >
      {children}
      {required && <span className="text-danger ml-1">*</span>}
    </label>
  )
}

/** Field — wrapper qui associe label + input avec gestion d'erreur */
export function Field({
  label, htmlFor, required, error, hint, children, className,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor} required={required}>{label}</Label>
      {children}
      {error && <div className="text-caption text-danger">{error}</div>}
      {hint && !error && <div className="text-caption text-fg-tertiary">{hint}</div>}
    </div>
  )
}
