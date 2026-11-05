'use client'
import { Fragment, useEffect, useMemo, useRef, useState, type TableHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import * as Popover from '@radix-ui/react-popover'
import { Filter } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import { applyTableSelections, filterSearch, readFilterTable, type ColumnSelections, type TableColumn } from '@/lib/tableColumnFilters'

type TableModel = ReturnType<typeof readFilterTable>

function ColumnFilter({column,values,selected,onApply,container}:{column:TableColumn;values:string[];selected?:string[];onApply:(values?:string[])=>void;container:HTMLElement|null}) {
  const {t,locale}=useLanguage()
  const [open,setOpen]=useState(false)
  const [search,setSearch]=useState('')
  const [draft,setDraft]=useState<string[]>([])
  const [limit,setLimit]=useState(200)
  const choices=useMemo(()=>open?Array.from(new Set(values)).sort(new Intl.Collator(locale,{numeric:true,sensitivity:'base'}).compare):[],[values,locale,open])
  const shown=choices.filter(value=>filterSearch(value||t('Vides')).includes(filterSearch(search)))
  return <Popover.Root open={open} onOpenChange={value=>{setOpen(value);if(value){setDraft(selected??Array.from(new Set(values)));setSearch('');setLimit(200)}}}>
    <Popover.Trigger asChild><button type="button" data-column-filter-ui aria-label={t('Filtrer la colonne {v0}',{v0:column.label})} title={t('Filtrer la colonne {v0}',{v0:column.label})} onClick={event=>event.stopPropagation()} className={`inline-flex min-h-10 min-w-10 sm:min-h-6 sm:min-w-6 items-center justify-center rounded border ${selected?'border-brand bg-brand text-white':'border-border bg-surface-raised text-fg-secondary'}`}><Filter size={12}/></button></Popover.Trigger>
    {open&&<Popover.Portal container={container}><Popover.Content data-column-filter-ui aria-label={t('Filtre de la colonne {v0}',{v0:column.label})} align="start" sideOffset={5} collisionPadding={12} collisionBoundary={container?.getAttribute('role')==='dialog'?container:undefined} onClick={event=>event.stopPropagation()} onInput={event=>event.stopPropagation()} onChange={event=>event.stopPropagation()} className="z-[10000] w-80 max-w-[calc(100vw-24px)] space-y-3 rounded-xl border border-border bg-surface-raised p-4 text-start font-sans text-sm font-normal normal-case tracking-normal text-fg-primary shadow-xl">
      <p className="font-semibold break-words">{column.label}</p>
      <input aria-label={t('Rechercher une valeur')} value={search} onChange={event=>{setSearch(event.target.value);setLimit(200)}} placeholder={t('Rechercher une valeur')} className="w-full rounded border border-border bg-surface-input px-3 py-2"/>
      <div className="flex flex-wrap gap-3"><button type="button" className="text-brand underline" onClick={()=>setDraft(Array.from(new Set([...draft,...shown])))}>{t('Tout sélectionner')}</button><button type="button" className="text-brand underline" onClick={()=>setDraft(draft.filter(value=>!shown.includes(value)))}>{t('Tout désélectionner')}</button></div>
      <div className="max-h-60 space-y-1 overflow-auto" role="group" aria-label={t('Valeurs de la colonne')}>
        {!shown.length&&<p>{t('Aucune valeur trouvée')}</p>}
        {shown.slice(0,limit).map(value=><label key={value} className="flex min-h-9 cursor-pointer items-start gap-2 rounded p-1 hover:bg-surface-input"><input type="checkbox" checked={draft.includes(value)} onChange={event=>setDraft(event.target.checked?[...draft,value]:draft.filter(item=>item!==value))}/><span className="min-w-0 break-words">{value||t('Vides')}</span></label>)}
        {shown.length>limit&&<button type="button" className="text-brand underline" onClick={()=>setLimit(value=>value+200)}>{t('Afficher plus de valeurs')}</button>}
      </div>
      <p className="text-xs text-fg-secondary">{t('Valeurs présentes dans les lignes chargées du tableau.')}</p>
      <div className="flex justify-between gap-2"><button type="button" className="rounded border border-border px-3 py-2" onClick={()=>{onApply(undefined);setOpen(false)}}>{t('Effacer le filtre')}</button><button type="button" className="rounded bg-brand px-3 py-2 font-semibold text-white" onClick={()=>{onApply(draft.length===choices.length?undefined:draft);setOpen(false)}}>{t('Appliquer')}</button></div>
      <Popover.Arrow className="fill-surface-raised"/>
    </Popover.Content></Popover.Portal>}
  </Popover.Root>
}

/** Preserve existing rendering, sorting, selection and server queries while filtering loaded rows. */
export function FilterableTable({children,...props}:TableHTMLAttributes<HTMLTableElement>) {
  const {t,locale}=useLanguage()
  const {activeDomain,user}=useAuth()
  const pathname=usePathname()
  const ref=useRef<HTMLTableElement>(null)
  const [model,setModel]=useState<TableModel>({columns:[],rows:[]})
  const [selections,setSelections]=useState<ColumnSelections>({})
  const [visible,setVisible]=useState(0)
  const [container,setContainer]=useState<HTMLElement|null>(null)
  useEffect(()=>setSelections({}),[activeDomain?.domain_id,user?.id,pathname,locale])
  useEffect(()=>{
    const table=ref.current
    if(!table)return
    let frame=0
    let previous=''
    let previousColumns:TableColumn[]=[]
    let previousRows:TableModel['rows']=[]
    let headerSignature=''
    const scan=()=>{
      const next=readFilterTable(table)
      const signature=JSON.stringify([next.columns.map(column=>[column.index,column.label]),next.rows.map(row=>[row.kind,row.depth,row.values])])
      const nextHeader=JSON.stringify(next.columns.map(column=>[column.index,column.label]))
      if(headerSignature && headerSignature!==nextHeader)setSelections({})
      headerSignature=nextHeader
      const sameNodes=next.columns.length===previousColumns.length && next.rows.length===previousRows.length && next.columns.every((column,index)=>column.host===previousColumns[index]?.host) && next.rows.every((row,index)=>row.element===previousRows[index]?.element)
      if(signature!==previous||!sameNodes){previous=signature;previousColumns=next.columns;previousRows=next.rows;setModel(next)}
    }
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan)}
    const observer=new MutationObserver(mutations=>{
      if(mutations.some(mutation=>!(mutation.target instanceof Element?mutation.target:mutation.target.parentElement)?.closest('[data-column-filter-ui]')))schedule()
    })
    setContainer(table.closest<HTMLElement>('[role="dialog"]')||document.body)
    scan()
    observer.observe(table,{childList:true,subtree:true,characterData:true})
    table.addEventListener('input',schedule)
    table.addEventListener('change',schedule)
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);table.removeEventListener('input',schedule);table.removeEventListener('change',schedule)}
  },[])
  useEffect(()=>{setVisible(applyTableSelections(model.rows,selections))},[model,selections])
  const rows=useMemo(()=>model.rows.filter(row=>row.kind==='data'),[model])
  const active=Object.keys(selections).length>0
  return <>
    {active&&<div data-column-filter-ui role="status" className="my-2 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-input p-3 text-xs print:hidden"><span>{t('{v0} / {v1} lignes chargées',{v0:visible,v1:rows.length})}</span><button type="button" className="text-brand underline" onClick={()=>setSelections({})}>{t('Effacer tous les filtres')}</button><span>{t('Les totaux et sélections existantes conservent leur périmètre.')}</span>{visible===0&&<strong>{t('Aucune ligne ne correspond aux filtres.')}</strong>}</div>}
    <table {...props} ref={ref} data-filterable-table>{children}</table>
    {model.columns.map(column=><Fragment key={`${column.index}:${column.label}`}>{createPortal(<ColumnFilter column={column} values={rows.map(row=>row.values[column.index]??'')} selected={selections[String(column.index)]} container={container} onApply={values=>setSelections(current=>{const next={...current};if(values===undefined)delete next[String(column.index)];else next[String(column.index)]=values;return next})}/>,column.host)}</Fragment>)}
  </>
}
