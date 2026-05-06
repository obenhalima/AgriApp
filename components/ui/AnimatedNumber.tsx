'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Hook qui anime un nombre depuis 0 (ou la valeur précédente) vers la valeur cible
 * en respectant prefers-reduced-motion. Style Stripe.
 */
export function useCountUp(value: number, opts: { duration?: number; decimals?: number } = {}) {
  const { duration = 1200 } = opts
  const [display, setDisplay] = useState(value)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    // Respect a11y
    if (typeof window !== 'undefined') {
      const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReduce) {
        setDisplay(value)
        return
      }
    }

    fromRef.current = display
    startRef.current = null
    let raf = 0

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const progress = Math.min(1, (ts - startRef.current) / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(fromRef.current + (value - fromRef.current) * eased)
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return display
}

/**
 * Affiche un nombre qui s'anime à chaque changement de valeur.
 * Le `format` reçoit la valeur courante et renvoie la string à afficher.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 1200,
  className,
}: {
  value: number
  format: (n: number) => string
  duration?: number
  className?: string
}) {
  const display = useCountUp(value, { duration })
  return <span className={className}>{format(display)}</span>
}
