'use client'
import * as Dialog from '@radix-ui/react-dialog'
import {Maximize,X} from 'lucide-react'
import {useLanguage} from '@/lib/i18n'
export function FullscreenGuide({src}:{src:string}){
 const {t}=useLanguage()
 return <Dialog.Root><Dialog.Trigger asChild><button type="button" className="btn inline-flex items-center gap-2"><Maximize size={16}/>{t('Plein écran')}</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[120] bg-black/40"/><Dialog.Content className="itrix-documentation fixed inset-0 z-[121] flex flex-col bg-white"><header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2"><Dialog.Title className="font-semibold">ItriX Farm · {t('Guide général')}</Dialog.Title><Dialog.Description className="sr-only">{t('Documentation complète de ItriX Farm')}</Dialog.Description><Dialog.Close className="btn inline-flex items-center gap-2" aria-label={t('Fermer')}><X size={18}/>{t('Fermer')}</Dialog.Close></header><iframe src={src} title={t('Guide général')} className="min-h-0 w-full flex-1 border-0"/></Dialog.Content></Dialog.Portal></Dialog.Root>
}
