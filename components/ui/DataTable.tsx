'use client'
/**
 * DataTable — wrapper léger pour tables stylées homogènes.
 * Pas TanStack pour cette V1 (les pages existantes ont leur propre logique de tri/filtre).
 * Juste un styling Tailwind cohérent + animations row par row + sticky header optionnel.
 */
import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export function DataTable({
  className, sticky = true, minWidth, children, ...props
}: React.HTMLAttributes<HTMLTableElement> & { sticky?: boolean; minWidth?: number }) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full text-body-sm', className)}
        style={minWidth ? { minWidth } : undefined}
        {...props}
      >
        {children}
      </table>
    </div>
  )
}

export function THead({ children, className, sticky = true }: { children: React.ReactNode; className?: string; sticky?: boolean }) {
  return (
    <thead className={cn(sticky && 'sticky top-0 z-[2]', className)}>
      {children}
    </thead>
  )
}

export function TR({
  children, className, animate = false, delay = 0, ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { animate?: boolean; delay?: number }) {
  if (animate) {
    return (
      <motion.tr
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay, duration: 0.25 }}
        className={cn(
          'border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors',
          className
        )}
        {...(props as any)}
      >
        {children}
      </motion.tr>
    )
  }
  return (
    <tr
      className={cn(
        'border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TH({
  children, right, className, ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return (
    <th
      className={cn(
        'py-2.5 px-3 font-mono text-[9.5px] uppercase tracking-wider text-fg-tertiary font-semibold whitespace-nowrap',
        'bg-surface-sunk border-b border-border',
        right ? 'text-right' : 'text-left',
        className
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function TD({
  children, right, mono, className, ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { right?: boolean; mono?: boolean }) {
  return (
    <td
      className={cn(
        'py-2.5 px-3 align-middle',
        right && 'text-right',
        mono && 'font-mono tabular-nums',
        className
      )}
      {...props}
    >
      {children}
    </td>
  )
}
