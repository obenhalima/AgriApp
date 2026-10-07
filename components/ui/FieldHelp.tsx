'use client'
import {useLanguage} from '@/lib/i18n'
import * as Popover from '@radix-ui/react-popover'
import {HelpCircle,X} from 'lucide-react'
import '@/components/help/branding.css'
export function FieldHelp({text}:{text:string}) {
 const {t}=useLanguage()
 return <Popover.Root><Popover.Trigger asChild><button type="button" aria-label={t('Aide sur ce champ')} className="ms-1 inline-flex min-h-7 min-w-7 items-center justify-center rounded text-fg-tertiary hover:text-brand"><HelpCircle size={16}/></button></Popover.Trigger><Popover.Portal><Popover.Content sideOffset={6} collisionPadding={12} className="itrix-documentation itrix-doc-field z-[120] max-w-[min(340px,calc(100vw-24px))] rounded-lg border border-border bg-surface-raised p-4 text-sm normal-case leading-relaxed tracking-normal text-fg-primary shadow-xl"><div className="flex items-start gap-3"><p className="whitespace-pre-line">{t(text)}</p><Popover.Close aria-label={t('Fermer')} className="shrink-0 rounded p-1"><X size={16}/></Popover.Close></div><Popover.Arrow className="fill-current text-surface-raised"/></Popover.Content></Popover.Portal></Popover.Root>
}
