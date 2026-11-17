'use client'
import {useEffect, useRef, useState} from 'react'
import Link from 'next/link'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {getInventoryCostSettings, changeInventoryCostMethod, type InventoryCostMethod, type InventoryMethodPreview} from '@/lib/inventoryCosting'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'

export function InventoryCostSettings() {
  const {domains, activeDomain, isAdmin, isPlatformAdmin} = useAuth()
  const {t, intlLocale} = useLanguage()
  const [domain, setDomain] = useState('')
  const [method, setMethod] = useState<InventoryCostMethod>('cump')
  const [activeMethod, setActiveMethod] = useState<InventoryCostMethod>('cump')
  const [effectiveAt, setEffectiveAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [preview, setPreview] = useState<InventoryMethodPreview | null>(null)
  const request = useRef('')
  const working = useRef(false)
  const scope = useRef(0)
  const money = (value: number | null) => value === null ? t('Non valorisé') : new Intl.NumberFormat(intlLocale, {style: 'currency', currency: 'MAD'}).format(value)
  const date = (value: string) => new Intl.DateTimeFormat(intlLocale, {dateStyle: 'medium', timeZone: 'Africa/Casablanca'}).format(new Date(value))

  useEffect(() => setDomain(activeDomain?.domain_id ?? ''), [activeDomain?.domain_id])
  useEffect(() => {
    const current = ++scope.current
    setError(''); setSaved(false); setConfirmed(false); setConfirmation(''); setPreview(null); setEffectiveAt(null); setLoading(true)
    if (!domain) {setLoading(false); return}
    getInventoryCostSettings(domain).then(value => {
      if (current === scope.current) {
        setMethod(value.method)
        setActiveMethod(value.method)
        setEffectiveAt(value.effective_at ?? null)
      }
    }).catch(() => {
      if (current === scope.current) setError(t('Paramétrage de valorisation indisponible. Appliquez la migration inventory_cost_method.'))
    }).finally(() => {if (current === scope.current) setLoading(false)})
    return () => {scope.current++}
  }, [domain, t])

  async function save(apply: boolean) {
    if (working.current || loading || !domain || method === activeMethod ||
      (apply && (!preview || preview.status !== 'preview' || preview.blockers.length > 0 || !confirmed || confirmation !== preview.domain_code))) return
    const current = scope.current
    working.current = true
    setSaving(true); setSaved(false); setError('')
    try {
      if (!apply) {request.current = crypto.randomUUID(); setPreview(null); setConfirmed(false); setConfirmation('')}
      const result = await changeInventoryCostMethod(domain, method, request.current, apply ? preview! : undefined, apply ? confirmation : undefined)
      if (current === scope.current) {
        setPreview(result)
        setSaved(result.status === 'applied')
        setConfirmed(false)
        if (result.status === 'applied') {setActiveMethod(result.method); setEffectiveAt(result.effective_at)}
      }
    } catch (failure) {
      if (current === scope.current) {
        setError(t(failure instanceof Error ? failure.message : String((failure as {message?: string}).message ?? failure)))
        // Any failure requires a fresh server preview before a new confirmation.
        setPreview(null); setConfirmed(false); setConfirmation('')
      }
    } finally {working.current = false; setSaving(false)}
  }

  if (!isAdmin && !isPlatformAdmin) return null
  return <Card className="space-y-4">
    <h2 className="font-semibold">{t('Valorisation des stocks par client')}</h2>
    <label className="block space-y-2"><span>{t('Client')}</span><select aria-label={t('Client')} className="form-input" value={domain} disabled={saving} onChange={event => setDomain(event.target.value)}>
      <option value="">{t('Choisir un client')}</option>
      {domains.map(item => <option key={item.domain_id} value={item.domain_id}>{item.domain_code} — {item.domain_name}</option>)}
    </select></label>
    {!loading && domain && <p>{t('Méthode active')} · {activeMethod.toUpperCase()}{effectiveAt && <> · {date(effectiveAt)}</>}</p>}
    <label className="block space-y-2"><span>{t('Méthode de valorisation')}</span><select aria-label={t('Méthode de valorisation')} className="form-input" value={method} disabled={loading || saving || !domain} onChange={event => {
      setMethod(event.target.value as InventoryCostMethod); setSaved(false); setConfirmed(false); setConfirmation(''); setPreview(null); setError('')
    }}>
      <option value="cump">{t('CUMP — coût moyen pondéré')}</option>
      <option value="fifo">{t('FIFO — premières entrées consommées en premier')}</option>
    </select></label>
    <p>{t(method === 'fifo' ? 'FIFO exige un prix sur chaque entrée. Une sortie utilise les prix des entrées les plus anciennes.' : 'Le CUMP est recalculé à chaque entrée et utilisé pour les sorties suivantes.')}</p>
    <p>{t('La bascule conserve la valorisation des mouvements et les coûts déjà enregistrés. Le stock restant constitue le lot d’ouverture pour les nouvelles sorties.')}</p>
    <Button disabled={loading || saving || !domain || method === activeMethod} onClick={() => void save(false)}>{t('Contrôler avant activation')}</Button>
    {preview && preview.status === 'blocked' && <div role="alert" className="space-y-3 rounded-lg border border-danger p-4">
      <h3 className="font-semibold">{t('Activation bloquée : données à compléter')}</h3>
      <ul className="max-h-80 space-y-3 overflow-auto">
        {preview.blockers.map((issue, index) => <li key={`${issue.code}-${index}`}>
          <p className="font-medium">{[issue.item_code, issue.item_name, issue.warehouse, issue.reference].filter(Boolean).join(' · ')}</p>
          <p>{t(issue.message)}</p>
        </li>)}
      </ul>
      <div className="flex flex-wrap gap-4">
        <Link href="/stocks">{t('Ouvrir les stocks')}</Link>
        <Link href="/stocks/mouvements">{t('Mouvements de stock')}</Link>
        <Link href="/couts/pilotage">{t('Coûts/kg et valorisation')}</Link>
      </div>
      <p>{t('Complétez les éléments signalés puis relancez le contrôle.')}</p>
    </div>}
    {preview && preview.status === 'preview' && <div className="space-y-3 rounded-lg border border-border p-4">
      <p>{t('Date de bascule')} · {date(preview.effective_at)}</p>
      <p>{t('Lots d’ouverture')} · {preview.opening_lots}</p>
      <p>{t('Valeur du stock à la bascule')} · {money(preview.stock_after)}</p>
      <p>{t('Coûts historiques conservés')} · {money(preview.cost_before)}</p>
      {preview.historical_unpriced_receipts > 0 && <p>{t('Les anciennes entrées sans prix restent dans l’historique. La bascule utilise la valeur confirmée du stock restant.')}</p>}
      <label className="block space-y-2"><span>{t('Recopiez le code du client pour confirmer')} · {preview.domain_code}</span><input className="form-input" value={confirmation} disabled={saving} onChange={event => setConfirmation(event.target.value)}/></label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={saving} onChange={event => setConfirmed(event.target.checked)}/><span>{t('Je confirme la bascule pour les nouveaux mouvements et la valeur du stock d’ouverture affichée.')}</span></label>
      <Button disabled={saving || !confirmed || confirmation !== preview.domain_code} onClick={() => void save(true)}>{t('Activer la méthode pour les nouveaux mouvements')}</Button>
    </div>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {saved && <p role="status">{t('Méthode activée. La valorisation de l’historique est conservée.')}</p>}
  </Card>
}
