'use client'
import {useState} from 'react'
import {usePathname} from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import {BookOpen,X} from 'lucide-react'
import {useLanguage} from '@/lib/i18n'
import {findScreenDoc} from '@/lib/userDocumentation'
import {DocumentationArticle} from './DocumentationArticle'
import {UserWiki} from './UserWiki'
import './branding.css'

/** The overlay leaves the current screen and its unsaved form mounted. */
export function GuideLauncher(){
 const {t,locale}=useLanguage(),path=usePathname(),doc=findScreenDoc(path)
 const [mode,setMode]=useState<'screen'|'wiki'|'guide'>('screen')
 const guide=locale==='fr'?'/guide-utilisateur.html':`/guide-utilisateur.${locale}.html`
 return <Dialog.Root><Dialog.Trigger asChild><button type="button" className="fixed bottom-24 end-4 z-40 flex items-center gap-2 rounded-full border border-[#D4A95C] bg-[#0B3D2E] px-4 py-3 text-sm font-semibold text-white shadow-lg" aria-label={t('Guide utilisateur')}><BookOpen size={20}/><span>{t('Guide utilisateur')}</span></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[110] bg-black/50"/><Dialog.Content className="itrix-documentation fixed inset-3 z-[111] mx-auto flex max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised p-4 shadow-xl sm:inset-6 sm:p-6"><header className="flex items-start justify-between gap-3 border-b border-border pb-4"><div><p className="text-xs font-semibold tracking-widest text-brand">ITRIX FARM</p><Dialog.Title className="mt-1 text-xl font-semibold">{t('Guide utilisateur')}</Dialog.Title><Dialog.Description className="text-sm text-fg-secondary">{t('Documentation complète de ItriX Farm')}</Dialog.Description></div><Dialog.Close aria-label={t('Fermer')} className="rounded-lg p-2"><X/></Dialog.Close></header><div className="flex flex-wrap gap-2 py-4">{(['screen','wiki','guide'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)} className={`rounded-lg border px-3 py-2 text-sm ${mode===value?'border-brand bg-brand text-white':'border-border'}`}>{t(value==='screen'?'Guide de cet écran':value==='wiki'?'Ouvrir le wiki':'Guide général')}</button>)}</div><div className="min-h-0 flex-1 overflow-auto">{mode==='screen'?(doc?<DocumentationArticle doc={doc}/>:<p>{t('La fiche détaillée de cet écran reste à compléter. Consultez le wiki et le guide général.')}</p>):mode==='wiki'?<UserWiki embedded/>:<iframe title={t('Guide général')} src={guide} className="h-full min-h-[60vh] w-full border-0"/>}</div></Dialog.Content></Dialog.Portal></Dialog.Root>
}
