import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge classnames intelligemment (résout les conflits Tailwind).
 *   cn('p-4', condition && 'text-red-500', 'p-6')  // → 'text-red-500 p-6'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
