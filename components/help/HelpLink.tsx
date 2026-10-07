'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import * as Dialog from '@radix-ui/react-dialog'
import { BookOpen, X } from 'lucide-react'
import { useLanguage } from '@/lib/i18n'
import { findScreenDoc } from '@/lib/userDocumentation'
import { findNavItem } from '@/lib/navigation'
import { DocumentationArticle } from './DocumentationArticle'
import './branding.css'
export function HelpLink({module,variant='icon',newTab=false,label='Aide',className}:{module:string;variant?:'icon'|'text'|'pill';newTab?:boolean;label?:string;className?:string}) {
 const {t}=useLanguage(), path=usePathname(), doc=findScreenDoc(path), nav=findNavItem(path)
 const [open,setOpen]=useState(false)
 const href='/guide?screen='+encodeURIComponent(doc?.path??nav?.item.href??path)
 if(newTab)return <Link href={href} target="_blank" rel="noopener noreferrer" className={className}>{t(label)}</Link>
 return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button type="button" className={className??'inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-fg-secondary hover:text-brand'} aria-label={t('Aide sur cet écran')}><BookOpen size={16}/>{variant!=='icon'&&t(label)}</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40"/><Dialog.Content className="itrix-documentation fixed inset-y-0 end-0 z-[101] w-full max-w-xl overflow-y-auto border-s border-border bg-surface-raised p-5 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4"><div><p className="mb-2 text-xs font-semibold tracking-wider text-brand">ITRIX FARM</p><Dialog.Title className="text-xl font-semibold">{t(nav?.item.label??'Aide')}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-fg-secondary">{t('Guide de cet écran')}</Dialog.Description></div><Dialog.Close className="rounded p-2" aria-label={t('Fermer')}><X size={20}/></Dialog.Close></div>{doc?<DocumentationArticle doc={doc}/>:<p className="text-sm">{t('La fiche détaillée de cet écran reste à compléter. Consultez le wiki et le guide général.')}</p>}<div className="mt-6 flex flex-wrap gap-3"><Link onClick={()=>setOpen(false)} href={href} className="btn">{t('Ouvrir le wiki')}</Link><Link onClick={()=>setOpen(false)} href="/guide" className="btn">{t('Toutes les fonctionnalités')}</Link></div></Dialog.Content></Dialog.Portal></Dialog.Root>
}
