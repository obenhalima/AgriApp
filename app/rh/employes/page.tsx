'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { computePayroll, fmtMAD, type PayFrequency } from '@/lib/payroll'

type Worker = {
  id: string
  matricule: string | null
  first_name: string
  last_name: string
  cin: string | null
  cnss_number: string | null
  date_birth: string | null
  date_hired?: string | null
  start_date: string | null
  category: string | null            // fermier | staff_admin | saisonnier | tacheron
  contract_type: string | null
  pay_frequency: string | null       // mensuel | quinzaine | journalier
  base_salary: number | null
  daily_rate: number | null
  function: string | null
  family_status: string | null
  dependents: number | null
  bank_iban: string | null
  payment_method: string | null
  farm_id: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
  // Mission (pour tâcherons)
  mission_label: string | null
  mission_days_planned: number | null
  mission_start_date: string | null
  mission_end_date: string | null
  mission_days_done: number | null
}

type Farm = { id: string; code: string; name: string }

const CATEGORIES = [
  { code: 'fermier',     label: 'Fermier',          icon: '🌾',  color: '#10b981', defaultFreq: 'quinzaine' as PayFrequency,
    description: 'Travailleur permanent ferme — paie quinzaine' },
  { code: 'staff_admin', label: 'Staff admin',      icon: '🧑‍💼', color: '#8b5cf6', defaultFreq: 'mensuel' as PayFrequency,
    description: 'Personnel administratif — paie mensuelle' },
  { code: 'saisonnier',  label: 'Saisonnier',       icon: '🌻',  color: '#f59e0b', defaultFreq: 'journalier' as PayFrequency,
    description: 'Travailleur saisonnier (récolte) — paie à la journée' },
  { code: 'tacheron',    label: 'Staff à la tâche', icon: '🛠️',  color: '#ec4899', defaultFreq: 'journalier' as PayFrequency,
    description: 'Mission ponctuelle de N jours pour dépannage — payé à la journée' },
]

const FAMILY_STATUS = [
  { code: 'celibataire', label: 'Célibataire' },
  { code: 'marie',       label: 'Marié(e)' },
  { code: 'divorce',     label: 'Divorcé(e)' },
  { code: 'veuf',        label: 'Veuf(ve)' },
]

const PAY_METHODS = ['virement', 'cash', 'cheque']
const CONTRACT_TYPES = ['CDI', 'CDD', 'saisonnier']

const empty: Partial<Worker> = {
  first_name: '', last_name: '', cin: '', cnss_number: '', matricule: '',
  category: 'fermier', contract_type: 'CDI', pay_frequency: 'quinzaine',
  base_salary: 0, daily_rate: 0, function: '',
  family_status: 'celibataire', dependents: 0,
  bank_iban: '', payment_method: 'virement',
  phone: '', email: '', address: '', is_active: true,
  mission_label: '', mission_days_planned: 0, mission_start_date: '', mission_end_date: '', mission_days_done: 0,
}

export default function EmployesPage() {
  const [items, setItems] = useState<Worker[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active')
  const [search, setSearch] = useState('')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Worker | null>(null)
  const [form, setForm] = useState<Partial<Worker>>(empty)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [modalError, setModalError] = useState('')  // erreur visible DANS la modale

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [w, f] = await Promise.all([
        supabase.from('workers').select('*').order('last_name'),
        supabase.from('farms').select('id, code, name').eq('is_active', true).order('name'),
      ])
      if (w.error) throw w.error
      setItems((w.data ?? []) as any)
      setFarms((f.data ?? []) as any)
    } catch (e: any) { setError(e.message || String(e)) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    return items.filter(w => {
      if (filterCategory && w.category !== filterCategory) return false
      if (filterStatus === 'active' && !w.is_active) return false
      if (filterStatus === 'inactive' && w.is_active) return false
      if (search) {
        const s = search.toLowerCase()
        const hay = `${w.first_name} ${w.last_name} ${w.matricule ?? ''} ${w.cin ?? ''} ${w.cnss_number ?? ''} ${w.function ?? ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [items, filterCategory, filterStatus, search])

  const openCreate = () => {
    setEditing(null); setForm(empty); setModalOpen(true); setDone(false); setModalError('')
  }
  const openEdit = (w: Worker) => {
    setEditing(w); setForm({ ...w }); setModalOpen(true); setDone(false); setModalError('')
  }
  const f = (k: keyof Worker) => (e: any) => setForm(s => ({ ...s, [k]: e.target.value }))

  // Auto-set pay_frequency selon catégorie quand l'utilisateur change la catégorie
  const onChangeCategory = (e: any) => {
    const cat = e.target.value
    const def = CATEGORIES.find(c => c.code === cat)
    setForm(s => ({ ...s, category: cat, pay_frequency: def?.defaultFreq ?? s.pay_frequency }))
  }

  const save = async () => {
    setModalError(''); setError('')
    if (!form.first_name || !form.last_name) {
      setModalError('Nom et prénom sont requis')
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        first_name: form.first_name,
        last_name: form.last_name,
        cin: form.cin || null,
        cnss_number: form.cnss_number || null,
        // matricule : ne pas envoyer en création (le trigger SQL le génère).
        // En modification, on garde la valeur existante.
        ...(editing ? { matricule: form.matricule || null } : {}),
        category: form.category,
        contract_type: form.contract_type,
        pay_frequency: form.pay_frequency,
        base_salary: Number(form.base_salary) || 0,
        daily_rate: Number(form.daily_rate) || 0,
        function: form.function || null,
        family_status: form.family_status,
        dependents: Number(form.dependents) || 0,
        bank_iban: form.bank_iban || null,
        payment_method: form.payment_method,
        farm_id: form.farm_id || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        date_birth: form.date_birth || null,
        start_date: form.start_date || null,
        is_active: form.is_active ?? true,
        // Mission (uniquement pertinent pour tâcherons)
        mission_label: form.mission_label || null,
        mission_days_planned: Number(form.mission_days_planned) || null,
        mission_start_date: form.mission_start_date || null,
        mission_end_date: form.mission_end_date || null,
        mission_days_done: Number(form.mission_days_done) || 0,
      }
      console.log('[employes] save payload:', payload)
      if (editing) {
        const { error } = await supabase.from('workers').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error, data } = await supabase.from('workers').insert(payload).select()
        if (error) throw error
        console.log('[employes] inserted:', data)
      }
      setDone(true)
      setTimeout(() => { setModalOpen(false); setDone(false); load() }, 1000)
    } catch (e: any) {
      console.error('[employes] save error:', e)
      setModalError(`Erreur : ${e?.message || e?.toString() || 'inconnue (voir console F12)'}${e?.details ? ' — ' + e.details : ''}${e?.hint ? ' — ' + e.hint : ''}`)
    }
    setSaving(false)
  }

  const toggleActive = async (w: Worker) => {
    if (!confirm(`${w.is_active ? 'Désactiver' : 'Réactiver'} ${w.first_name} ${w.last_name} ?`)) return
    const { error } = await supabase.from('workers').update({ is_active: !w.is_active }).eq('id', w.id)
    if (error) alert('Erreur : ' + error.message)
    else load()
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1500 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-main)' }}>
            🪪 Employés
          </h1>
          <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 4 }}>
            {filtered.length} / {items.length} affichés
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary" style={{ marginLeft: 'auto', fontSize: 12, padding: '7px 14px' }}>
          + Nouvel employé
        </button>
      </header>

      {error && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12.5 }}>
          ⚠ {error}
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Recherche (nom, matricule, CIN, fonction…)"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: '7px 12px', background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }} />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          style={{ padding: '7px 12px', background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }}>
          <option value="">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.icon} {c.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          style={{ padding: '7px 12px', background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }}>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
          <option value="all">Tous</option>
        </select>
      </div>

      {/* Tableau */}
      <div style={{ border: '1px solid var(--bd-1)', borderRadius: 8, overflow: 'auto', background: 'var(--bg-1)' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-2)' }}>
            <tr>
              {['Matricule', 'Nom complet', 'Catégorie', 'Fonction', 'Contrat', 'Fréq.', 'Brut mensuel', 'CNSS', 'Net estimé', 'Statut', 'Actions'].map(h =>
                <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} style={{ padding: 16, textAlign: 'center', color: 'var(--text-sub)' }}>Chargement…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Aucun employé.</td></tr>}
            {filtered.map(w => {
              const cat = CATEGORIES.find(c => c.code === w.category)
              // Calcul net estimé pour aperçu rapide
              const calc = (w.base_salary && Number(w.base_salary) > 0) ? computePayroll({
                baseSalaryMonthly: Number(w.base_salary),
                payFrequency: (w.pay_frequency as PayFrequency) ?? 'mensuel',
                dependents: Number(w.dependents) || 0,
                familyStatus: (w.family_status as any) ?? 'celibataire',
              }) : null
              return (
                <tr key={w.id} style={{ borderBottom: '1px solid var(--bd-1)', opacity: w.is_active ? 1 : 0.5 }}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{w.matricule ?? '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{w.last_name} {w.first_name}</td>
                  <td style={td}>
                    {cat ? (
                      <span style={{ padding: '2px 8px', borderRadius: 4, background: cat.color + '20', color: cat.color, fontSize: 10.5, fontWeight: 600 }}>
                        {cat.icon} {cat.label}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ ...td, color: 'var(--text-sub)' }}>{w.function ?? '—'}</td>
                  <td style={{ ...td, fontSize: 11 }}>{w.contract_type ?? '—'}</td>
                  <td style={{ ...td, fontSize: 11 }}>{w.pay_frequency ?? '—'}</td>
                  <td style={tdNum}>{w.base_salary ? Number(w.base_salary).toLocaleString('fr-FR') : '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-sub)' }}>{w.cnss_number ?? '—'}</td>
                  <td style={{ ...tdNum, color: 'var(--neon)', fontWeight: 600 }}>
                    {calc ? Math.round(calc.net_salary).toLocaleString('fr-FR') : '—'}
                  </td>
                  <td style={td}>
                    {w.is_active
                      ? <span style={{ color: 'var(--neon)', fontSize: 11 }}>● Actif</span>
                      : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>○ Inactif</span>}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(w)} className="btn-ghost" style={{ fontSize: 10.5, padding: '3px 8px', marginRight: 4 }}>Éditer</button>
                    <button onClick={() => toggleActive(w)} className="btn-ghost" style={{ fontSize: 10.5, padding: '3px 8px' }}>
                      {w.is_active ? 'Désactiver' : 'Activer'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modale create/edit */}
      {modalOpen && (
        <Modal title={editing ? `Éditer — ${editing.first_name} ${editing.last_name}` : 'Nouvel employé'}
          onClose={() => setModalOpen(false)} size="lg">
          {done ? (
            <SuccessMessage message={editing ? 'Employé modifié' : 'Employé créé'} />
          ) : (
            <>
              <FormRow>
                <FormGroup label={editing ? 'Matricule' : 'Matricule (auto-généré)'}>
                  <input
                    type="text"
                    value={editing ? (form.matricule ?? '') : '— auto à la création —'}
                    readOnly
                    style={{
                      width: '100%', padding: 8,
                      background: 'var(--bg-2)',
                      color: editing ? 'var(--text-main)' : 'var(--text-muted)',
                      border: '1px solid var(--bd-1)',
                      borderRadius: 6, fontSize: 13,
                      fontStyle: editing ? 'normal' : 'italic',
                      cursor: 'not-allowed',
                    }}
                  />
                </FormGroup>
                <FormGroup label="CIN"><Input value={form.cin ?? ''} onChange={f('cin')} placeholder="XX123456" /></FormGroup>
                <FormGroup label="N° CNSS"><Input value={form.cnss_number ?? ''} onChange={f('cnss_number')} placeholder="123456789" /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Prénom *"><Input value={form.first_name ?? ''} onChange={f('first_name')} /></FormGroup>
                <FormGroup label="Nom *"><Input value={form.last_name ?? ''} onChange={f('last_name')} /></FormGroup>
                <FormGroup label="Date naissance"><Input type="date" value={form.date_birth ?? ''} onChange={f('date_birth')} /></FormGroup>
              </FormRow>

              <FormRow>
                <FormGroup label="Catégorie *">
                  <Select value={form.category ?? 'fermier'} onChange={onChangeCategory}>
                    {CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.icon} {c.label}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Fonction"><Input value={form.function ?? ''} onChange={f('function')} placeholder="Ouvrier, Responsable serres…" /></FormGroup>
                <FormGroup label="Ferme">
                  <Select value={form.farm_id ?? ''} onChange={f('farm_id')}>
                    <option value="">— aucune —</option>
                    {farms.map(fm => <option key={fm.id} value={fm.id}>{fm.code} — {fm.name}</option>)}
                  </Select>
                </FormGroup>
              </FormRow>

              <FormRow>
                <FormGroup label="Type de contrat">
                  <Select value={form.contract_type ?? 'CDI'} onChange={f('contract_type')}>
                    {CONTRACT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Date d'embauche"><Input type="date" value={form.start_date ?? ''} onChange={f('start_date')} /></FormGroup>
                <FormGroup label="Fréquence paie *">
                  <Select value={form.pay_frequency ?? 'mensuel'} onChange={f('pay_frequency')}>
                    <option value="mensuel">Mensuel (fin de mois)</option>
                    <option value="quinzaine">Quinzaine (15 et fin de mois)</option>
                    <option value="journalier">Journalier (saisonniers)</option>
                  </Select>
                </FormGroup>
              </FormRow>

              <div style={{ padding: 8, marginTop: 4, marginBottom: 4, background: 'var(--bg-2)', border: '1px dashed var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--text-sub)' }}>
                💵 <strong style={{ color: 'var(--text-main)' }}>Rémunération</strong>
              </div>
              <FormRow>
                <FormGroup label="Salaire brut mensuel (MAD)">
                  <Input type="number" value={String(form.base_salary ?? 0)} onChange={f('base_salary')} />
                </FormGroup>
                <FormGroup label="Tarif journalier (MAD)">
                  <Input type="number" value={String(form.daily_rate ?? 0)} onChange={f('daily_rate')} />
                </FormGroup>
                <FormGroup label="Méthode paiement">
                  <Select value={form.payment_method ?? 'virement'} onChange={f('payment_method')}>
                    {PAY_METHODS.map(p => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Statut familial">
                  <Select value={form.family_status ?? 'celibataire'} onChange={f('family_status')}>
                    {FAMILY_STATUS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Personnes à charge (max 6)">
                  <Input type="number" value={String(form.dependents ?? 0)} onChange={f('dependents')} />
                </FormGroup>
                <FormGroup label="IBAN">
                  <Input value={form.bank_iban ?? ''} onChange={f('bank_iban')} placeholder="MA64 011 …" />
                </FormGroup>
              </FormRow>

              <FormRow>
                <FormGroup label="Téléphone"><Input value={form.phone ?? ''} onChange={f('phone')} placeholder="+212 6 XX XX XX XX" /></FormGroup>
                <FormGroup label="Email"><Input type="email" value={form.email ?? ''} onChange={f('email')} /></FormGroup>
              </FormRow>
              <FormGroup label="Adresse">
                <Textarea value={form.address ?? ''} onChange={f('address')} />
              </FormGroup>

              {/* Bloc MISSION — visible uniquement pour tâcherons */}
              {form.category === 'tacheron' && (
                <>
                  <div style={{ padding: 8, marginTop: 8, marginBottom: 4, background: 'rgba(236,72,153,.10)', border: '1px dashed #ec4899', borderRadius: 6, fontSize: 11, color: '#ec4899', fontWeight: 600 }}>
                    🛠️ Mission de dépannage — détails de l'intervention
                  </div>
                  <FormGroup label="Libellé mission *">
                    <Input value={form.mission_label ?? ''} onChange={f('mission_label')} placeholder="Ex: Dépannage récolte serre 3, renfort plantation, etc." />
                  </FormGroup>
                  <FormRow>
                    <FormGroup label="Jours planifiés *">
                      <Input type="number" value={String(form.mission_days_planned ?? 0)} onChange={f('mission_days_planned')} placeholder="Ex: 7" />
                    </FormGroup>
                    <FormGroup label="Jours réalisés">
                      <Input type="number" value={String(form.mission_days_done ?? 0)} onChange={f('mission_days_done')} />
                    </FormGroup>
                    <FormGroup label="Date début">
                      <Input type="date" value={form.mission_start_date ?? ''} onChange={f('mission_start_date')} />
                    </FormGroup>
                    <FormGroup label="Date fin prévue">
                      <Input type="date" value={form.mission_end_date ?? ''} onChange={f('mission_end_date')} />
                    </FormGroup>
                  </FormRow>
                  {Number(form.daily_rate) > 0 && Number(form.mission_days_planned) > 0 && (
                    <div style={{ marginTop: 4, marginBottom: 8, padding: 8, background: 'var(--bg-2)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-sub)' }}>
                      💰 Coût total prévu mission : <strong style={{ color: 'var(--text-main)' }}>{(Number(form.daily_rate) * Number(form.mission_days_planned)).toLocaleString('fr-FR')} MAD</strong>
                      ({Number(form.daily_rate)} MAD × {Number(form.mission_days_planned)} jours)
                    </div>
                  )}
                </>
              )}

              {/* Aperçu calcul paie */}
              {Number(form.base_salary) > 0 && (() => {
                const r = computePayroll({
                  baseSalaryMonthly: Number(form.base_salary),
                  payFrequency: (form.pay_frequency as PayFrequency) ?? 'mensuel',
                  dependents: Number(form.dependents) || 0,
                  familyStatus: form.family_status as any,
                })
                return (
                  <div style={{ marginTop: 12, padding: 12, background: 'var(--neon-dim)', border: '1px solid var(--neon)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--neon)', marginBottom: 8 }}>
                      📊 Simulation bulletin (1 période)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, fontSize: 11.5 }}>
                      <Stat label="Brut période" value={fmtMAD(r.gross_salary)} />
                      <Stat label="CNSS + AMO + IR" value={fmtMAD(r.cnss_employee + r.amo_employee + r.ir_amount)} />
                      <Stat label="Net à payer" value={fmtMAD(r.net_salary)} highlight />
                      <Stat label="Coût employeur" value={fmtMAD(r.total_employer_cost)} />
                    </div>
                  </div>
                )
              })()}

              {modalError && (
                <div style={{
                  marginTop: 12, padding: 10,
                  background: 'rgba(239,68,68,.1)',
                  border: '1px solid #ef4444',
                  borderRadius: 6, color: '#fca5a5',
                  fontSize: 12, lineHeight: 1.5,
                }}>
                  ⚠ {modalError}
                  {modalError.includes('column') && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#fbbf24' }}>
                      💡 Si l'erreur mentionne une colonne manquante, exécute les migrations <strong>018_hr_module.sql</strong> et <strong>019_hr_task_workers.sql</strong> dans Supabase SQL Editor.
                    </div>
                  )}
                </div>
              )}
              <ModalFooter
                onCancel={() => setModalOpen(false)}
                onSave={save}
                loading={saving}
                saveLabel={editing ? 'ENREGISTRER' : 'CRÉER'}
              />
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: .5 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--neon)' : 'var(--text-main)', marginTop: 2 }}>{value}</div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: .5, borderBottom: '1px solid var(--bd-1)' }
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-main)' }
const tdNum: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', textAlign: 'right' }
