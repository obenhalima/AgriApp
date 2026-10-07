'use client'
import * as Dialog from '@radix-ui/react-dialog'
import {X} from 'lucide-react'
import {useLanguage} from '@/lib/i18n'

const screenshots:Record<string,{src:string;caption:string}[]>={
 '/agronomie/dashboard':[{src:'/guide-screenshots/current/dashboard-desktop.jpg',caption:'Dashboard actuel : campagne, priorités et indicateurs de l’exploitation.'}],
 '/plan-culture':[{src:'/guide-screenshots/current/plan-culture.jpg',caption:'Plan de culture : sélection du périmètre, vues et objectifs de campagne.'}],
 '/recoltes':[{src:'/guide-screenshots/current/recolte-saisie.jpg',caption:'Saisir une récolte : plantation, date, plateaux, personnel et notes.'},{src:'/guide-screenshots/current/recoltes.jpg',caption:'Récoltes : indicateurs, filtres et accès aux étapes de commercialisation.'}],
}
export function DocumentationScreenshots({path}:{path:string}){
 const {t}=useLanguage(),images=screenshots[path]
 if(!images)return null
 return <section className="space-y-3">{images.map(image=><figure key={image.src} className="overflow-hidden rounded-xl border border-border"><Dialog.Root><Dialog.Trigger asChild><button type="button" className="block w-full bg-white p-3" aria-label={image.caption}><img loading="lazy" src={image.src} alt={image.caption} className="mx-auto max-h-72 max-w-full object-contain"/></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[120] bg-black/70"/><Dialog.Content className="fixed inset-4 z-[121] flex flex-col rounded-xl bg-white p-4"><div className="flex justify-between gap-4"><Dialog.Title className="text-sm text-slate-900">{image.caption}</Dialog.Title><Dialog.Close aria-label={t('Fermer')} className="p-2 text-slate-900"><X/></Dialog.Close></div><Dialog.Description className="text-xs text-slate-600">Capture d’interface : les valeurs dépendent du client et des filtres sélectionnés.</Dialog.Description><div className="min-h-0 flex-1 overflow-auto"><img src={image.src} alt={image.caption} className="mx-auto max-w-full"/></div></Dialog.Content></Dialog.Portal></Dialog.Root><figcaption className="bg-surface-input p-3 text-xs">{image.caption} · Cliquez sur la capture pour l’agrandir.</figcaption></figure>)}</section>
}
