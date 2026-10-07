'use client'
import {useLanguage} from '@/lib/i18n'

import { useMemo, useState } from 'react'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter } from '@/components/ui/Modal'
import { AccountCategory, TYPE_LABELS } from '@/lib/accountCategories'
import { bulkUpdateCostEntries } from '@/lib/costEntries'

type Campaign = { id: string; name: string; code: string }
type Farm = { id: string; code: string; name: string }
type Greenhouse = { id: string; code: string; name: string; farm_id: string }

// ══════════════════════════════════════════════════════════════
// IMPORTANT : SectionBox DOIT être défini HORS du composant parent.
// Sinon React le recrée à chaque re-render et les inputs enfants
// perdent leur focus à chaque keystroke.
// ══════════════════════════════════════════════════════════════
function SectionBox({ active, onToggle, title, children }: {
  active: boolean
  onToggle: (v: boolean) => void
  title: string
  children?: React.ReactNode
}) {
  return (
    <div style={{ padding: 10, marginBottom: 8, border: '1px solid var(--bd-1)', borderRadius: 6, background: active ? 'color-mix(in srgb, var(--neon) 5%, transparent)' : 'transparent' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: active ? 8 : 0 }}>
        <input type="checkbox" checked={active} onChange={e => onToggle(e.target.checked)} />
        <span style={{ fontSize: 12, color: 'var(--tx-1)', fontWeight: 600 }}>{title}</span>
      </label>
      {active && children}
    </div>
  )
}

export function BulkEditCostsModal(props: {
  selectedIds: string[]
  campaigns: Campaign[]
  categories: AccountCategory[]
  farms?: Farm[]
  greenhouses?: Greenhouse[]
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { selectedIds, campaigns, categories, farms = [], greenhouses = [], onClose, onSaved } = props

  // Options activables
  const [changeCampaign, setChangeCampaign] = useState(false)
  const [campaignId, setCampaignId] = useState('')

  const [changeCategory, setChangeCategory] = useState(false)
  const [chargeType, setChargeType] = useState<'' | 'charge_variable' | 'charge_fixe' | 'amortissement'>('')
  const [parentCatId, setParentCatId] = useState('')
  const [leafCatId, setLeafCatId] = useState('')

  const [changePlanned, setChangePlanned] = useState(false)
  const [isPlanned, setIsPlanned] = useState('false')

  const [changeGreenhouse, setChangeGreenhouse] = useState(false)
  const [greenhouseMode, setGreenhouseMode] = useState<'set' | 'farm_level'>('set')
  const [farmFilter, setFarmFilter] = useState('')
  const [greenhouseId, setGreenhouseId] = useState('')

  const [changeDate, setChangeDate] = useState(false)
  const [entryDate, setEntryDate] = useState('')

  const [changeAmount, setChangeAmount] = useState(false)
  const [amountMode, setAmountMode] = useState<'set' | 'multiply' | 'percent'>('percent')
  const [amountValue, setAmountValue] = useState('')

  const [changeDesc, setChangeDesc] = useState(false)
  const [descMode, setDescMode] = useState<'replace' | 'prepend' | 'append'>('append')
  const [descText, setDescText] = useState('')

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const parentCategories = useMemo(() => {
    if (!chargeType) return []
    return categories
      .filter(c => c.is_active && c.level === 2 && c.type === chargeType)
      .sort((a, b) => a.display_order - b.display_order)
  }, [categories, chargeType])

  const subCategories = useMemo(() => {
    if (!parentCatId) return []
    return categories
      .filter(c => c.is_active && c.parent_id === parentCatId)
      .sort((a, b) => a.display_order - b.display_order)
  }, [categories, parentCatId])

  const parentIsLeaf = parentCatId && subCategories.length === 0
  const resolvedCategoryId = parentIsLeaf ? parentCatId : leafCatId

  const ghsForFarm = useMemo(() =>
    farmFilter ? greenhouses.filter(g => g.farm_id === farmFilter) : greenhouses,
    [greenhouses, farmFilter])

  const submit = async () => {
    setErr('')
    const patch: any = {}
    if (changeCampaign && campaignId) patch.campaign_id = campaignId
    if (changeCategory && resolvedCategoryId) patch.account_category_id = resolvedCategoryId
    if (changePlanned) patch.is_planned = isPlanned === 'true'
    if (changeGreenhouse) {
      if (greenhouseMode === 'farm_level') patch.greenhouse_id = null
      else if (greenhouseId) patch.greenhouse_id = greenhouseId
    }
    if (changeDate && entryDate) patch.entry_date = entryDate
    if (changeAmount && amountValue) {
      const v = Number(amountValue)
      if (!Number.isFinite(v)) { setErr('Valeur montant invalide'); return }
      if (amountMode === 'set')      patch.amount = { kind: 'set', value: v }
      if (amountMode === 'multiply') patch.amount = { kind: 'multiply', factor: v }
      if (amountMode === 'percent')  patch.amount = { kind: 'percent', delta: v }
    }
    if (changeDesc && descText) {
      patch.description = { mode: descMode, text: descText }
    }

    if (Object.keys(patch).length === 0) {
      setErr('Coche au moins une modification et remplis les champs correspondants'); return
    }
    setSaving(true)
    try {
      const n = await bulkUpdateCostEntries(selectedIds, patch)
      alert(_ui("{v0} entrée(s) modifiée(s).",{v0:String(n)}))
      await onSaved()
      onClose()
    } catch (e: any) {
      setErr(e.message ?? 'Erreur')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={_ui("MODIFIER {v0} ENTRÉE(S) EN MASSE",{v0:String(selectedIds.length)})} onClose={onClose} size="lg">
      {err && <div style={{ padding: 8, marginBottom: 10, background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 6, color: 'var(--red)', fontSize: 11 }}>⚠ {err}</div>}

      <div style={{ padding: 8, marginBottom: 12, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)' }}>
        {" "}{_ui("Coche les champs que tu veux modifier. Seuls ceux cochés sont appliqués aux")}{" "}{selectedIds.length} {" "}{_ui("entrée(s).")}{" "}</div>

      {/* Campagne */}
      <SectionBox active={changeCampaign} onToggle={setChangeCampaign} title={_ui("Campagne")}>
        <Select value={campaignId} onChange={e => setCampaignId(e.target.value)}>
          <option value="">{_ui("-- Sélectionner --")}</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </SectionBox>

      {/* Catégorie */}
      <SectionBox active={changeCategory} onToggle={setChangeCategory} title={_ui("Catégorie comptable")}>
        <FormRow>
          <FormGroup label={_ui("Type")}>
            <Select value={chargeType} onChange={e => { setChargeType(e.target.value as any); setParentCatId(''); setLeafCatId('') }}>
              <option value="">{_ui("-- Sélectionner --")}</option>
              <option value="charge_variable">{_ui("Charge variable")}</option>
              <option value="charge_fixe">{_ui("Charge fixe")}</option>
              <option value="amortissement">{_ui("Amortissement")}</option>
            </Select>
          </FormGroup>
          <FormGroup label={_ui("Catégorie")}>
            <Select value={parentCatId} onChange={e => { setParentCatId(e.target.value); setLeafCatId('') }} disabled={!chargeType}>
              <option value="">{chargeType ? _ui("-- Choisir --") : _ui("Type d'abord")}</option>
              {parentCategories.map(c => <option key={c.id} value={c.id}>{_uiNode(c.label)}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label={_ui("Sous-catégorie")}>
            {parentIsLeaf ? (
              <div style={{ padding: '8px 10px', background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)' }}>
                {" "}{_ui("(pas de sous-niveau)")}{" "}</div>
            ) : (
              <Select value={leafCatId} onChange={e => setLeafCatId(e.target.value)} disabled={!parentCatId}>
                <option value="">{parentCatId ? _ui("-- Choisir --") : _ui("Catégorie d'abord")}</option>
                {subCategories.map(c => <option key={c.id} value={c.id}>{_uiNode(c.label)}</option>)}
              </Select>
            )}
          </FormGroup>
        </FormRow>
      </SectionBox>

      {/* Serre */}
      <SectionBox active={changeGreenhouse} onToggle={setChangeGreenhouse} title={_ui("Serre (affectation)")}>
        <FormRow>
          <FormGroup label={_ui("Mode")}>
            <Select value={greenhouseMode} onChange={e => setGreenhouseMode(e.target.value as any)}>
              <option value="set">{_ui("Affecter à une serre")}</option>
              <option value="farm_level">{_ui("Passer au niveau ferme (aucune serre)")}</option>
            </Select>
          </FormGroup>
          {greenhouseMode === 'set' && (
            <>
              <FormGroup label={_ui("Ferme")}>
                <Select value={farmFilter} onChange={e => { setFarmFilter(e.target.value); setGreenhouseId('') }}>
                  <option value="">{_ui("-- Toutes --")}</option>
                  {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label={_ui("Serre")}>
                <Select value={greenhouseId} onChange={e => setGreenhouseId(e.target.value)}>
                  <option value="">{_ui("-- Sélectionner --")}</option>
                  {ghsForFarm.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                </Select>
              </FormGroup>
            </>
          )}
        </FormRow>
      </SectionBox>

      {/* Date */}
      <SectionBox active={changeDate} onToggle={setChangeDate} title={_ui("Date")}>
        <FormGroup label={_ui("Nouvelle date pour toutes les entrées")}>
          <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
        </FormGroup>
      </SectionBox>

      {/* Montant */}
      <SectionBox active={changeAmount} onToggle={setChangeAmount} title={_ui("Montant")}>
        <FormRow>
          <FormGroup label={_ui("Mode")}>
            <Select value={amountMode} onChange={e => setAmountMode(e.target.value as any)}>
              <option value="set">{_ui("Remplacer par (MAD)")}</option>
              <option value="multiply">{_ui("Multiplier par (ex: 1.1 = +10%)")}</option>
              <option value="percent">{_ui("Ajuster de ± (%)")}</option>
            </Select>
          </FormGroup>
          <FormGroup label={amountMode === 'set' ? _ui("Valeur (MAD)") : amountMode === 'multiply' ? _ui("Facteur") : _ui("Pourcentage (ex: 10 = +10%, -5 = -5%)")}>
            <Input type="number" value={amountValue} onChange={e => setAmountValue(e.target.value)} step={0.01}
              placeholder={amountMode === 'set' ? '12500.00' : amountMode === 'multiply' ? '1.10' : '10'} />
          </FormGroup>
        </FormRow>
        <div style={{ fontSize: 10, color: 'var(--tx-3)', marginTop: 4, fontStyle: 'italic' }}>
          {amountMode === 'set' && _ui("Remplace le montant de chaque entrée par cette valeur (identique pour toutes).")}
          {amountMode === 'multiply' && _ui("Multiplie chaque montant par ce facteur. Ex: 1.10 = +10%, 0.90 = -10%.")}
          {amountMode === 'percent' && _ui("Ajoute ce pourcentage à chaque montant. Ex: 10 = augmente de 10%, -5 = diminue de 5%.")}
        </div>
      </SectionBox>

      {/* Type réel / prévu */}
      <SectionBox active={changePlanned} onToggle={setChangePlanned} title={_ui("Type (réel / prévisionnel)")}>
        <Select value={isPlanned} onChange={e => setIsPlanned(e.target.value)}>
          <option value="false">{_ui("Réel (décaissement)")}</option>
          <option value="true">{_ui("Prévisionnel (budget)")}</option>
        </Select>
      </SectionBox>

      {/* Description */}
      <SectionBox active={changeDesc} onToggle={setChangeDesc} title={_ui("Description")}>
        <FormRow>
          <FormGroup label={_ui("Mode")}>
            <Select value={descMode} onChange={e => setDescMode(e.target.value as any)}>
              <option value="replace">{_ui("Remplacer")}</option>
              <option value="prepend">{_ui("Ajouter au début")}</option>
              <option value="append">{_ui("Ajouter à la fin")}</option>
            </Select>
          </FormGroup>
          <FormGroup label={_ui("Texte")}>
            <Input value={descText} onChange={e => setDescText(e.target.value)} placeholder={_ui("ex: révisé T2")} />
          </FormGroup>
        </FormRow>
      </SectionBox>

      <ModalFooter
        onCancel={onClose}
        onSave={submit}
        loading={saving}
        saveLabel={_ui("APPLIQUER")}
        disabled={saving || (!changeCampaign && !changeCategory && !changePlanned && !changeGreenhouse && !changeDate && !changeAmount && !changeDesc)}
      />
    </Modal>
  )
}
