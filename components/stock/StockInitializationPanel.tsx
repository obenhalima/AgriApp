'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { loadStockOpeningCatalog } from '@/lib/stockOpeningCatalog'
import { checkStockInitialization, type StockInput } from '@/lib/stockInitialization'
import { stockInitializationWorkbook, readStockInitializationWorkbook } from '@/lib/stockInitializationWorkbook'
import { stockInitializationRequest, type StockInitializationResult } from '@/lib/stockInitializationApi'
import { downloadInitFile } from '@/lib/initializationWorkbook'
import type { InitCatalog } from '@/lib/initialization'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export function StockInitializationPanel({ onBack }: { onBack?: () => void }) {
  const { activeDomain, hasPermission, isAdmin, isPlatformAdmin } = useAuth()
  const domain = activeDomain?.domain_id, name = activeDomain?.domain_name || ''
  const { t } = useLanguage()
  const [catalog, setCatalog] = useState<InitCatalog | null>(null)
  const [warehouse, setWarehouse] = useState(''), [date, setDate] = useState(today)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [checked, setChecked] = useState<ReturnType<typeof checkStockInitialization> | null>(null)
  const [server, setServer] = useState<StockInitializationResult | null>(null)
  const [fileName, setFileName] = useState('')
  const request = useRef(0), operation = useRef(''), source = useRef<StockInput[]>([]), snapshot = useRef<StockInput[]>([])
  const allowed = isAdmin || isPlatformAdmin || hasPermission('stocks', 'edit'), applied = server?.status === 'applied'
  const hasErrors = !!checked?.issues.some(issue => !issue.warning)
  const ready = !!checked?.rows.length && !hasErrors && server?.status === 'preview'
  useEffect(() => {
    const id = ++request.current
    setCatalog(null); setWarehouse(''); setChecked(null); setError(''); setServer(null); setFileName(''); setConfirmed(false); setBusy(false); source.current = []; snapshot.current = []; operation.current = ''
    if (domain && allowed) loadStockOpeningCatalog(domain).then(value => { if (request.current === id) setCatalog(value) }).catch(e => { if (request.current === id) setError(e.message) })
    return () => { request.current++ }
  }, [domain, allowed])
  async function exportFile() {
    if (!domain || !catalog || busy) return
    const id = request.current; setBusy(true); setError('')
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || date > today()) throw new Error('Date inventaire valide, non future, requise.')
      const fresh = await loadStockOpeningCatalog(domain)
      const blob = await stockInitializationWorkbook(domain, name, fresh, warehouse, date)
      if (request.current === id) { setCatalog(fresh); downloadInitFile(blob, `ItriX_Articles_Stock_Initial_${date}.xlsx`) }
    } catch (e: any) { if (request.current === id) setError(e.message) }
    finally { if (request.current === id) setBusy(false) }
  }
  async function validateSource(rows: StockInput[], id: number) {
    if (!domain) return
    const fresh = await loadStockOpeningCatalog(domain)
    if (request.current !== id) return
    const result = checkStockInitialization(rows, fresh, today())
    source.current = rows; snapshot.current = result.rows; setCatalog(fresh); setChecked(result)
    if (result.rows.length && !result.issues.some(issue => !issue.warning)) {
      const response = await stockInitializationRequest(domain, operation.current, result.rows)
      if (request.current === id) setServer(response)
    }
  }
  async function checkFile(file?: File) {
    if (!file || !domain || busy) return
    const id = request.current; setBusy(true); setError(''); setChecked(null); setServer(null); setConfirmed(false); setFileName(file.name)
    operation.current = crypto.randomUUID(); snapshot.current = []; source.current = []
    try { await validateSource(await readStockInitializationWorkbook(await file.arrayBuffer(), domain), id) }
    catch (e: any) { if (request.current === id) setError(e.message) }
    finally { if (request.current === id) setBusy(false) }
  }
  async function serverCheck() {
    if (!domain || !source.current.length || busy) return
    const id = request.current; setBusy(true); setError(''); setServer(null); setConfirmed(false)
    try { await validateSource(source.current, id) }
    catch (e: any) { if (request.current === id) setError(e.message) }
    finally { if (request.current === id) setBusy(false) }
  }
  async function apply() {
    if (!domain || busy || !confirmed || !ready || !snapshot.current.length) return
    const id = request.current; setBusy(true); setError('')
    try {
      const response = await stockInitializationRequest(domain, operation.current, snapshot.current, true)
      if (request.current === id) { setServer(response); setConfirmed(false) }
    } catch (e: any) { if (request.current === id) setError(e.message + ' Si la réponse a été perdue, réessayez cette même validation : elle ne sera pas appliquée deux fois.') }
    finally { if (request.current === id) setBusy(false) }
  }
  if (!domain || !allowed) return <p role="alert">{t('Sélectionnez un client et un compte autorisé à modifier les stocks.')}</p>
  return <div className="space-y-4">
    <Button asChild variant="secondary"><Link href="/stocks/historique">{t('Historique entrées / sorties — Excel')}</Link></Button>
    <div className="flex flex-wrap gap-3"><Button asChild variant="secondary"><Link href="/stocks">{t('Retour aux stocks')}</Link></Button>{onBack ? <Button variant="ghost" disabled={busy} onClick={onBack}>{t('Retour aux modules')}</Button> : <Button asChild variant="ghost"><Link href="/admin/initialisation">{t('Retour à l’initialisation')}</Link></Button>}</div>
    <h1 className="text-2xl font-semibold">{t('Articles et stock initial')} — {name}</h1>
    <Card><p>{t('Un seul fichier pour réutiliser les articles existants, créer les nouveaux et initialiser le stock à la date de votre inventaire.')}</p><p className="mt-2 text-sm text-fg-secondary">{t('Quantité vide : pas de stock initialisé. Zéro : stock nul confirmé. Coût vide : à valoriser. Les anciennes consommations ne doivent pas être déduites une seconde fois. Aucun stock existant ne sera écrasé.')}</p></Card>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <Card className="space-y-3"><h2 className="font-semibold">{t('1. Exporter le modèle ItriX Farm')}</h2>
      <Field label={t('Entrepôt / ferme')}><Select value={warehouse} disabled={busy} onChange={e => setWarehouse(e.target.value)}><option value="">{t('Choisir un entrepôt')}</option>{catalog?.warehouses.map(w => <option key={w.code} value={w.code}>{w.code} — {w.name} · {w.farm}</option>)}</Select></Field>
      <Field label={t('Date de l’inventaire à reprendre')}><Input type="date" value={date} max={today()} disabled={busy} onChange={e => setDate(e.target.value)} /></Field>
      <p>{catalog ? `${catalog.products.filter(p => p.is_active !== 'non').length} ${t('articles actifs préremplis. Les nouveaux articles peuvent être ajoutés dans le même fichier.')}` : t('Chargement des référentiels…')}</p>
      {catalog && !catalog.warehouses.length && <p role="alert">{t('Créez un entrepôt actif rattaché à une ferme du client avant de continuer.')}</p>}
      <Button onClick={exportFile} disabled={busy || !catalog || !warehouse || !date}>{t('Exporter le modèle articles et stock')}</Button>
    </Card>
    <Card className="space-y-3"><h2 className="font-semibold">{t('2. Charger le fichier rempli et contrôler')}</h2><p>{t('Enregistrez votre fichier Excel rempli, puis sélectionnez-le ci-dessous. Le remplissage du fichier sur votre ordinateur ne le recharge pas automatiquement dans ItriX Farm.')}</p><p>{t('Dans Articles_Stock, complétez code, désignation, catégorie et unité pour chaque nouvel article. Choisissez les codes des listes. Renseignez les quantités réellement disponibles, la date et l’entrepôt. Les prix renseignés nécessitent un justificatif.')}</p><Input type="file" aria-label={t('Fichier articles et stock')} accept=".xlsx" disabled={busy || !catalog} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void checkFile(file) }} />{fileName && <p>{t('Fichier sélectionné')} : <strong>{fileName}</strong></p>}</Card>
    {checked && <Card className="space-y-3"><h2 className="font-semibold">{t('3. Synthèse avant validation')}</h2><p>{checked.created} {t('articles à créer')} · {checked.reused} {t('articles réutilisés')} · {checked.positive} {t('stocks positifs')} · {checked.zero} {t('stocks nuls')} · {checked.unvalued} {t('stocks à valoriser')}</p>
      {!checked.rows.length && <p role="alert">{t('Aucune ligne à appliquer. Ajoutez un nouvel article ou renseignez les quantités des articles existants.')}</p>}
      {checked.unvalued > 0 && <div className="rounded-lg border border-border bg-surface-sunk p-3 space-y-2"><p>{checked.unvalued} {t('stocks sans coût unitaire : avertissement non bloquant. Les articles et les quantités peuvent être créés maintenant ; les coûts seront renseignés ensuite dans l’écran de valorisation. Un coût inconnu ne sera pas enregistré à zéro.')}</p><Link href={`/couts/pilotage?domain=${encodeURIComponent(domain)}&tab=stock`} className="underline">{t('Stock valorisé — à utiliser après la reprise')}</Link></div>}
      {checked.issues.filter(issue => !issue.warning).map((issue,i) => <p key={i} className="text-danger">{t('Ligne Excel')} {issue.line} · {issue.field} : {issue.message}</p>)}
      {checked.issues.some(issue => issue.warning) && <details><summary className="cursor-pointer text-sm">{t('Afficher le détail des avertissements non bloquants')} ({checked.issues.filter(issue => issue.warning).length})</summary><div className="max-h-48 overflow-auto mt-2">{checked.issues.filter(issue => issue.warning).map((issue,i) => <p key={i} className="text-sm text-fg-secondary">{t('Ligne Excel')} {issue.line} · {issue.field} : {issue.message}</p>)}</div></details>}
      <div className="max-h-80 overflow-auto"><FilterableTable className="w-full text-sm"><thead className="sticky top-0 bg-surface-raised"><tr>{['Ligne','Article','Action','Unité','Entrepôt','Date','Quantité','Coût unitaire'].map(label => <th key={label} className="p-2 text-start">{t(label)}</th>)}</tr></thead><tbody>{checked.rows.map((row,i) => <tr key={i}><td>{row.line}</td><td>{row.code} — {row.name}</td><td>{t(catalog?.products.some(p => p.code.toUpperCase() === row.code.toUpperCase()) ? 'Réutiliser' : 'Créer')}</td><td>{row.unit}</td><td>{row.warehouse}</td><td>{row.date}</td><td>{row.quantity === '' ? t('Non renseignée') : row.quantity}</td><td>{row.price === '' ? t('Non renseigné') : `${row.price} MAD`}</td></tr>)}</tbody></FilterableTable></div>
    </Card>}
    {!applied && <Card role="region" className="space-y-3 border-brand/40" aria-labelledby="stock-apply-title">
      <h2 id="stock-apply-title" className="font-semibold">{t('4. Valider la création des articles et du stock')}</h2>
      <div id="stock-apply-reason" role="status">
        {busy ? t('Traitement en cours…') : !checked ? t('Chargez votre fichier Excel rempli à l’étape 2 pour activer la validation.') : !checked.rows.length ? t('Le fichier ne contient aucune ligne à appliquer. Ajoutez les articles ou renseignez les quantités, puis rechargez-le.') : hasErrors ? t('Corrigez les erreurs indiquées dans la synthèse, puis rechargez le fichier. Les avertissements de coût manquant ne bloquent pas la création.') : !ready ? t('Le contrôle serveur doit réussir avant de créer les articles et le stock. Consultez le message ci-dessous puis relancez le contrôle.') : t('Contrôle serveur réussi. Cochez la confirmation puis validez. La création des articles et du stock sera effectuée en une seule transaction.')}
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {checked && checked.rows.length > 0 && !hasErrors && <Button variant="secondary" disabled={busy} onClick={serverCheck}>{t('Recontrôler les références et stocks en base')}</Button>}
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy || !ready} onChange={e => setConfirmed(e.target.checked)} /><span>{t('Je confirme le client, les entrepôts, les unités, les dates, les quantités et les coûts de cet inventaire. Les coûts manquants restent non valorisés.')}</span></label>
      <Button disabled={busy || !ready || !confirmed} aria-describedby="stock-apply-reason" onClick={apply}>{t('Valider la création des articles et du stock')}</Button>
      <p className="text-sm text-fg-secondary">{t('Aucune création avant ce clic. Un stock déjà utilisé ou initialisé ne peut pas être réinitialisé ici.')}</p>
    </Card>}
    {applied && <Card><h2 className="font-semibold" role="status">{t('Reprise enregistrée — ne pas réimporter')}</h2><p>{server.created} {t('articles créés')} · {server.reused} {t('articles réutilisés')} · {server.positive} {t('stocks positifs initialisés')} · {server.zero} {t('stocks nuls confirmés')} · {server.unvalued} {t('stocks à valoriser')}</p><p>{t('Référence de l’opération')} : {server.operation_id}</p><Button asChild variant="secondary"><Link href="/stocks">{t('Vérifier les stocks')}</Link></Button></Card>}
    {applied && server.unvalued > 0 && <Button asChild variant="secondary"><Link href={`/couts/pilotage?domain=${encodeURIComponent(domain)}&tab=stock`}>{t('Valoriser le stock maintenant ou plus tard')}</Link></Button>}
  </div>
}
