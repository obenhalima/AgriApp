'use client'
import * as React from 'react'
import { cn } from '@/lib/cn'

/**
 * Squelette de chargement avec effet shimmer professionnel.
 * Remplace le texte "CHARGEMENT…" partout dans l'app.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md bg-surface-sunk relative overflow-hidden',
        'before:absolute before:inset-0',
        'before:bg-gradient-to-r before:from-transparent before:via-white/[0.05] before:to-transparent',
        'before:animate-shimmer before:bg-[length:200%_100%]',
        className
      )}
      {...props}
    />
  )
}

/** Skeleton pour les KPI cards (label + big number + sub) */
export function SkeletonKPI() {
  return (
    <div className="rounded-lg bg-surface-raised border border-border p-5 space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

/** Skeleton pour ligne de table */
export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex gap-3 py-2">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn('h-6', i === 0 ? 'w-32' : 'flex-1')} />
      ))}
    </div>
  )
}
