'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { importBucket, invoiceImportLink, mutateInvoiceImport, unitFactor, type ImportData, type InvoiceImport, type ExtractedLine, type LineMatch, type StockOption } from '@/lib/supplierInvoiceImport'

const statuses: Record<string, string> = {
  uploading: 'Chargement', queued: 'En cours', processing: 'En cours', to_review: 'À vérifier',
  failed: 'Échec', abandoned: 'Abandonné', validated: 'Validé',
}

export function SupplierInvoiceImports({ domain, canUpload, onReview }: {
  domain: string; canUpload: boolean; onReview: (entry: InvoiceImport) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [imports, setImports] = useState<InvoiceImport[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [duplicates, setDuplicates] = useState<{ label: string; id?: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let live = true
    async function refresh() {
      const result = await supabase.from('supplier_invoice_imports')
        .select('id,filename,status,error_message,invoice_id,object_path,preview_pages,extracted_data,checks')
        .eq('domain_id', domain).not('status', 'in', '(abandoned,validated)').order('created_at', { ascending: false }).limit(50)
      if (live && !result.error) setImports(result.data)
    }
    void refresh()
    const timer = setInterval(refresh, 4000)
    return () => { live = false; clearInterval(timer) }
  }, [domain, reload])

  async function upload(files: File[]) {
    if (!canUpload || busy || !files.length) return
    setBusy(true)
    setErrors([])
    setDuplicates([])
    try {
      for (const file of files) {
        try {
          if (!file.size || file.size > 10_000_000) throw Error('Fichier vide ou supérieur à 10 Mo.')
          const result = await mutateInvoiceImport(domain, { file })
          if (result.duplicate) setDuplicates(previous => [...previous, { label: file.name, id: result.invoice_id }])
        } catch (error) {
          setErrors(previous => [...previous, `${file.name} — ${(error as Error).message}`])
        }
      }
    } finally { setBusy(false); setReload(value => value + 1) }
  }

  async function update(id: string, action: 'retry' | 'abandon') {
    try { await mutateInvoiceImport(domain, { id, action }); setReload(value => value + 1) }
    catch (error) { setErrors([(error as Error).message]) }
  }

  return <section className="mb-4 rounded-lg border border-dashed p-3" aria-label="Imports de factures"
    onDragOver={event => { if (canUpload) event.preventDefault() }}
    onDrop={event => { if (canUpload) { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)) } }}>
    {canUpload && <div className="flex flex-wrap items-center gap-3">
      <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" multiple hidden onChange={event => {
        void upload(Array.from(event.target.files ?? []))
        event.target.value = ''
      }} />
      <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Chargement…' : 'Charger une facture'}
      </Button>
      <span>Déposez vos PDF, JPG, PNG ou HEIC ici. 10 Mo par fichier.</span>
    </div>}
    {errors.map(error => <p key={error} role="alert">{error}</p>)}
    {duplicates.map(({ label, id }) => <p key={label} role="status">{label} a déjà été importé.{' '}
      {id ? <Link href={invoiceImportLink(id, domain)}>Voir la facture existante</Link> : 'Consultez les imports ci-dessous.'}</p>)}
    {imports.length > 0 && <ul className="mt-2 space-y-2">{imports.map(entry => <li className="flex flex-wrap items-center gap-2" key={entry.id}>
      <strong>{entry.filename}</strong><span>{statuses[entry.status]}</span>
      {entry.error_message && <span role="alert">{entry.error_message}</span>}
      {entry.status === 'to_review' && canUpload && <Button variant="secondary" onClick={() => onReview(entry)}>Vérifier</Button>}
      {['failed', 'to_review'].includes(entry.status) && canUpload && <Button variant="secondary" onClick={() => void update(entry.id, 'retry')}>Relancer</Button>}
      {entry.status !== 'uploading' && canUpload && <Button variant="secondary" onClick={() => void update(entry.id, 'abandon')}>Abandonner</Button>}
    </li>)}</ul>}
  </section>
}

export function SupplierInvoicePreview({ entry }: { entry: InvoiceImport }) {
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const pages = entry.preview_pages ?? 1
  useEffect(() => {
    let cancelled = false
    setUrl(''); setError('')
    void supabase.storage.from(importBucket).createSignedUrl(`${entry.object_path}/preview-${page}.jpg`, 300)
      .then(result => {
        if (cancelled) return
        if (result.error) setError('Aperçu indisponible.')
        else setUrl(result.data.signedUrl)
      })
    return () => { cancelled = true }
  }, [entry.object_path, page])
  return <aside className="min-w-0 space-y-2">
    <div className="flex flex-wrap gap-2 items-center">
      <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Précédente</Button>
      <span>{page} / {pages}</span>
      <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Suivante</Button>
      <label>Zoom <input type="range" min="75" max="250" step="25" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
    </div>
    {error && <p role="alert">{error}</p>}
    {url && <div className="max-h-[65vh] overflow-auto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Page ${page} de ${entry.filename}`} style={{ width: `${zoom}%`, maxWidth: 'none' }} />
    </div>}
  </aside>
}

const lineFields = [
  ['description', 'Désignation'], ['product_code', 'Code produit'], ['quantity', 'Quantité'], ['unit', 'Unité'],
  ['packaging', 'Conditionnement'], ['unit_price_ht', 'Prix unitaire HT'], ['discount_pct', 'Remise (%)'],
  ['vat_rate', 'TVA (%)'], ['amount_ht', 'Montant HT'], ['lot_number', 'Lot'],
] as const
const numericLineFields = new Set<string>(['quantity', 'unit_price_ht', 'discount_pct', 'vat_rate', 'amount_ht'])

export function SupplierImportLines({ lines, matches, options, issue, onLines, onMatches }: {
  lines: ExtractedLine[]; matches: LineMatch[]; options: StockOption[]; issue: (path: string) => string | undefined
  onLines: (lines: ExtractedLine[]) => void; onMatches: (matches: LineMatch[]) => void
}) {
  if (!lines.length) return null
  return <details className="rounded border p-2">
    <summary>Lignes de la facture ({lines.length})</summary>
    {lines.map((line, index) => {
      const match = matches[index]
      const article = options.find(option => option.id === match?.stock_item_id)
      function setMatch(value: LineMatch) {
        onMatches(matches.map((previous, position) => position === index ? value : previous))
      }
      return <fieldset key={index} className="my-2 grid grid-cols-2 gap-2 rounded border p-2">
        <legend>Ligne {index + 1}</legend>
        {lineFields.map(([field, label]) => {
          const problem = issue(`lines.${index}.${field}`)
          const numeric = numericLineFields.has(field)
          return <label key={field} className={problem ? 'text-amber-700' : ''} title={problem}>{label}
            <Input value={line[field] ?? ''} type={numeric ? 'number' : 'text'} step={numeric ? 'any' : undefined}
              aria-invalid={Boolean(problem)} onChange={event => {
                const raw = event.target.value
                const value = raw === '' ? null : numeric ? Number(raw) : raw
                const edited = { ...line, [field]: value }
                if (article && (field === 'unit' || field === 'packaging')) {
                  setMatch({ ...match, factor: unitFactor(edited, article.unit), confirmed: false })
                }
                onLines(lines.map((previous, position) => position === index ? edited : previous))
              }} />
          </label>
        })}
        <label>Article suggéré
          <Select value={match?.stock_item_id ?? ''} onChange={event => {
            const item = options.find(option => option.id === event.target.value)
            setMatch({ stock_item_id: item?.id ?? '', factor: item ? unitFactor(line, item.unit) : '' })
          }}>
            <option value="">Aucun article</option>
            {options.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}{item.plant_protection_product_id ? ' (référentiel phyto)' : ''}</option>)}
          </Select>
        </label>
        {article && <label>Conversion vers {article.unit || 'l’unité du stock'}
          <Input type="number" step="any" min="0" value={match.factor} onChange={event => setMatch({ ...match, factor: event.target.value, confirmed: false })} />
        </label>}
        {article && <label className="col-span-2 flex items-center gap-2">
          <input type="checkbox" checked={Boolean(match.confirmed)} onChange={event => setMatch({ ...match, confirmed: event.target.checked })} />
          Confirmer l’article et la conversion
        </label>}
      </fieldset>
    })}
  </details>
}

const detailGroups = [
  { section: 'supplier', label: 'Émetteur', fields: [
    ['name', 'Nom sur la facture'], ['ice', 'ICE fournisseur'], ['if_number', 'Identifiant fiscal'],
    ['rc', 'RC'], ['patente', 'Patente'], ['address', 'Adresse'], ['city', 'Ville'],
    ['phone', 'Téléphone'], ['email', 'Email'], ['rib', 'RIB'],
  ] },
  { section: 'customer', label: 'Destinataire', fields: [['name', 'Nom'], ['ice', 'ICE client']] },
  { section: 'invoice', label: 'Références', fields: [
    ['purchase_order_ref', 'Référence du bon d’achat'], ['delivery_note_ref', 'Référence du bon de livraison'],
    ['payment_terms', 'Conditions de paiement'], ['payment_method', 'Mode de paiement'],
  ] },
] as const

export function SupplierImportDetails({ data, issue, onChange }: {
  data: ImportData; issue: (path: string) => string | undefined; onChange: (data: ImportData) => void
}) {
  return <details className="rounded border p-2">
    <summary>Coordonnées et références de l’original</summary>
    {detailGroups.map(({ section, label, fields }) => <fieldset key={section} className="my-2 grid grid-cols-2 gap-2 rounded border p-2">
      <legend>{label}</legend>
      {fields.map(([key, fieldLabel]) => {
        const problem = issue(`${section}.${key}`)
        return <label key={key} className={problem ? 'text-amber-700' : ''} title={problem}>{fieldLabel}
          <Input value={data[section][key] ?? ''} aria-invalid={Boolean(problem)} onChange={event =>
            onChange({ ...data, [section]: { ...data[section], [key]: event.target.value || null } })} />
        </label>
      })}
    </fieldset>)}
  </details>
}
