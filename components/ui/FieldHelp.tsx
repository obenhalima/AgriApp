'use client'

import { HelpCircle } from 'lucide-react'
import { Tooltip } from './Tooltip'

export function FieldHelp({ text }: { text: string }) {
  return <Tooltip content={<span className="block max-w-[280px] leading-relaxed">{text}</span>} side="top">
    <button type="button" aria-label="Aide sur ce champ" className="inline-flex text-fg-tertiary hover:text-brand align-middle ml-1">
      <HelpCircle size={13} />
    </button>
  </Tooltip>
}
