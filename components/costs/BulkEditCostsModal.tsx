'use client'
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
      alert(`${n} entrée(s) modifiée(s).`)
      await onSaved()
      onClose()
    } catch (e: any) {
      setErr(e.message ?? 'Erreur')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`MODIFIER ${selectedIds.length} ENTRÉE(S) EN MASSE`} onClose={onClose} size="lg">
      {err && <div style={{ padding: 8, marginBottom: 10, background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 6, color: 'var(--red)', fontSize: 11 }}>⚠ {err}</div>}

      <div style={{ padding: 8, marginBottom: 12, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)' }}>
        Coche les champs que tu veux modifier. Seuls ceux cochés sont appliqués aux {selectedIds.length} entrée(s).
      </div>

      {/* Campagne */}
      <SectionBox active={changeCampaign} onToggle={setChangeCampaign} title="Campagne">
        <Select value={campaignId} onChange={e => setCampaignId(e.target.value)}>
          <option value="">-- Sélectionner --</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </SectionBox>

      {/* Catégorie */}
      <SectionBox active={changeCategory} onToggle={setChangeCategory} title="Catégorie comptable">
        <FormRow>
          <FormGroup label="Type">
            <Select value={chargeType} onChange={e => { setChargeType(e.target.value as any); setParentCatId(''); setLeafCatId('') }}>
              <option value="">-- Sélectionner --</option>
              <option value="charge_variable">Charge variable</option>
              <option value="charge_fixe">Charge fixe</option>
              <option value="amortissement">Amortissement</option>
            </Select>
          </FormGroup>
          <FormGroup label="Catégorie">
            <Select value={parentCatId} onChange={e => { setParentCatId(e.target.value); setLeafCatId('') }} disabled={!chargeType}>
              <option value="">{chargeType ? '-- Choisir --' : 'Type d\'abord'}</option>
              {parentCategories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Sous-catégorie">
            {parentIsLeaf ? (
              <div style={{ padding: '8px 10px', background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)' }}>
                (pas de sous-niveau)
              </div>
            ) : (
              <Select value={leafCatId} onChange={e => setLeafCatId(e.target.value)} disabled={!parentCatId}>
                <option value="">{parentCatId ? '-- Choisir --' : 'Catégorie d\'abord'}</option>
                {subCategories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            )}
          </FormGroup>
        </FormRow>
      </SectionBox>

      {/* Serre */}
      <SectionBox active={changeGreenhouse} onToggle={setChangeGreenhouse} title="Serre (affectation)">
        <FormRow>
          <FormGroup label="Mode">
            <Select value={greenhouseMode} onChange={e => setGreenhouseMode(e.target.value as any)}>
              <option value="set">Affecter à une serre</option>
              <option value="farm_level">Passer au niveau ferme (aucune serre)</option>
            </Select>
          </FormGroup>
          {greenhouseMode === 'set' && (
            <>
              <FormGroup label="Ferme">
                <Select value={farmFilter} onChange={e => { setFarmFilter(e.target.value); setGreenhouseId('') }}>
                  <option value="">-- Toutes --</option>
                  {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Serre">
                <Select value={greenhouseId} onChange={e => setGreenhouseId(e.target.value)}>
                  <option value="">-- Sélectionner --</option>
                  {ghsForFarm.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                </Select>
              </FormGroup>
            </>
          )}
        </FormRow>
      </SectionBox>

      {/* Date */}
      <SectionBox active={changeDate} onToggle={setChangeDate} title="Date">
        <FormGroup label="Nouvelle date pour toutes les entrées">
          <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
        </FormGroup>
      </SectionBox>

      {/* Montant */}
      <SectionBox active={changeAmount} onToggle={setChangeAmount} title="Montant">
        <FormRow>
          <FormGroup label="Mode">
            <Select value={amountMode} onChange={e => setAmountMode(e.target.value as any)}>
              <option value="set">Remplacer par (MAD)</option>
              <option value="multiply">Multiplier par (ex: 1.1 = +10%)</option>
              <option value="percent">Ajuster de ± (%)</option>
            </Select>
          </FormGroup>
          <FormGroup label={amountMode === 'set' ? 'Valeur (MAD)' : amountMode === 'multiply' ? 'Facteur' : 'Pourcentage (ex: 10 = +10%, -5 = -5%)'}>
            <Input type="number" value={amountValue} onChange={e => setAmountValue(e.target.value)} step={0.01}
              placeholder={amountMode === 'set' ? '12500.00' : amountMode === 'multiply' ? '1.10' : '10'} />
          </FormGroup>
        </FormRow>
        <div style={{ fontSize: 10, color: 'var(--tx-3)', marginTop: 4, fontStyle: 'italic' }}>
          {amountMode === 'set' && 'Remplace le montant de chaque entrée par cette valeur (identique pour toutes).'}
          {amountMode === 'multiply' && 'Multiplie chaque montant par ce facteur. Ex: 1.10 = +10%, 0.90 = -10%.'}
          {amountMode === 'percent' && 'Ajoute ce pourcentage à chaque montant. Ex: 10 = augmente de 10%, -5 = diminue de 5%.'}
        </div>
      </SectionBox>

      {/* Type réel / prévu */}
      <SectionBox active={changePlanned} onToggle={setChangePlanned} title="Type (réel / prévisionnel)">
        <Select value={isPlanned} onChange={e => setIsPlanned(e.target.value)}>
          <option value="false">Réel (décaissement)</option>
          <option value="true">Prévisionnel (budget)</option>
        </Select>
      </SectionBox>

      {/* Description */}
      <SectionBox active={changeDesc} onToggle={setChangeDesc} title="Description">
        <FormRow>
          <FormGroup label="Mode">
            <Select value={descMode} onChange={e => setDescMode(e.target.value as any)}>
              <option value="replace">Remplacer</option>
              <option value="prepend">Ajouter au début</option>
              <option value="append">Ajouter à la fin</option>
            </Select>
          </FormGroup>
          <FormGroup label="Texte">
            <Input value={descText} onChange={e => setDescText(e.target.value)} placeholder="ex: révisé T2" />
          </FormGroup>
        </FormRow>
      </SectionBox>

      <ModalFooter
        onCancel={onClose}
        onSave={submit}
        loading={saving}
        saveLabel="APPLIQUER"
        disabled={saving || (!changeCampaign && !changeCategory && !changePlanned && !changeGreenhouse && !changeDate && !changeAmount && !changeDesc)}
      />
    </Modal>
  )
}
