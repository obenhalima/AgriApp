'use client'
import Link from 'next/link'
import type {InvoiceKind} from '@/lib/invoiceDocumentModel'
import {useLanguage} from '@/lib/i18n'
export function InvoiceDocumentActions({id,kind,domain}:{id:string;kind:InvoiceKind;domain:string}){
 const {t}=useLanguage()
 const href=`/factures/document/${encodeURIComponent(id)}?type=${kind}&domain=${encodeURIComponent(domain)}`
 return <Link className="btn btn-secondary text-xs" href={href}>{t('Consulter')}</Link>
}
