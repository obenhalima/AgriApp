'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {invoiceDate,invoiceMoney,invoiceQuantity,invoiceStatus,invoiceTitle,invoiceTotals,type InvoiceDocument,type InvoiceParty} from '@/lib/invoiceDocumentModel'
import './invoice-document.css'
function Party({label,party}:{label:string;party:InvoiceParty}){return <section className="invoice-party"><h2>{label}</h2><strong>{party.name}</strong>{[party.address,[party.city,party.country].filter(Boolean).join(', '),party.tax_id?`Identifiant fiscal : ${party.tax_id}`:'',party.email,party.phone].filter(Boolean).map((value,i)=><p key={i}>{value}</p>)}</section>}
export function InvoiceSheet({document:doc}:{document:InvoiceDocument}){
 const purchase=doc.documentType==='purchase'
 return <article className="invoice-sheet" lang="fr" dir="ltr">
  <header className="invoice-heading"><div><img className="invoice-brand-logo" src="/itrix-logo.png" alt="ITRIX Agri Intelligence"/><p>ItriX Farm · by ItriX Technologies</p></div><div><h1>{invoiceTitle(doc)}</h1><strong>{doc.invoice.invoice_number||'Numéro non renseigné'}</strong></div></header>
  <div className="invoice-parties"><Party label="Émetteur" party={doc.issuer}/><Party label="Destinataire" party={doc.recipient}/></div>
  <dl className="invoice-meta"><div><dt>{purchase?'Date de commande':'Date de facture'}</dt><dd>{invoiceDate(doc.invoice.invoice_date)}</dd></div><div><dt>{purchase?'Livraison prévue':'Échéance'}</dt><dd>{invoiceDate(doc.invoice.due_date)}</dd></div><div><dt>Devise</dt><dd>{doc.currency||'Non renseignée'}</dd></div><div><dt>Statut enregistré</dt><dd>{invoiceStatus(doc.invoice.status)}</dd></div></dl>
  <p className="invoice-caption">{purchase?'Bon de commande existant - ce document ne constitue pas une facture.':doc.kind==='fournisseur'?'Copie de consultation - ne remplace pas la facture originale du fournisseur.':'Édition de consultation de la facture existante.'}<br/>Coordonnées issues des référentiels actuels ; aucune copie historique n’est reconstituée.</p>
  <h2>Détail enregistré ou lié</h2><div className="invoice-table-scroll"><FilterableTable><thead><tr><th>Désignation / provenance</th><th>Quantité</th><th>Prix unitaire</th><th>Montant</th></tr></thead><tbody>{doc.lines.map((line,i)=><tr key={i}><td>{line.description}<small>{line.source}</small></td><td>{invoiceQuantity(line.quantity)} {line.unit}</td><td>{line.price===null?'—':`${invoiceQuantity(line.price)} ${doc.currency||'(devise non renseignée)'}`}</td><td>{invoiceMoney(line.amount,doc.currency)}</td></tr>)}</tbody></FilterableTable></div>
  <dl className="invoice-totals">{invoiceTotals(doc).map(([label,value])=><div key={label} className={label==='Total de la facture'?'invoice-grand-total':''}><dt>{label}</dt><dd>{invoiceMoney(value,doc.currency)}</dd></div>)}</dl>
  {!purchase&&<><h2>Journal des paiements</h2>{doc.payments.length?<div className="invoice-table-scroll"><FilterableTable><thead><tr><th>Date</th><th>Mode</th><th>Référence</th><th>Montant</th></tr></thead><tbody>{doc.payments.map(p=><tr key={p.id}><td>{invoiceDate(p.payment_date)}</td><td>{p.payment_method||'Non renseigné'}</td><td>{p.reference||'—'}</td><td>{invoiceMoney(p.amount,doc.currency)}</td></tr>)}</tbody></FilterableTable></div>:<p>Aucune ligne de paiement disponible dans le journal consulté.</p>}</>}
  {doc.invoice.notes&&<section><h2>Notes enregistrées</h2><p className="invoice-notes">{String(doc.invoice.notes)}</p></section>}
  {!!doc.warnings.length&&<aside className="invoice-warnings"><h2>Informations sur cette édition</h2>{doc.warnings.map(w=><p key={w}>{w}</p>)}</aside>}
  <footer>ItriX Farm · by ItriX Technologies<br/>Document de consultation issu des données enregistrées. Aucun numéro ni montant n’a été régénéré.</footer>
 </article>
}
