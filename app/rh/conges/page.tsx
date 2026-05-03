'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

type LeaveRequest = {
  id: string; worker_id: string; type: string
  start_date: string; end_date: string; days: number
  reason: string | null; status: string
  approved_at: string | null; refused_reason: string | null
  notes: string | null; created_at: string
}
type Worker = { id: string; first_name: string; last_name: string; matricule: string | null; category: string | null }

const TYPES = [
  { code: 'annuel',     label: 'Congé annuel',     icon: '🏖️', color: '#10b981' },
  { code: 'maladie',    label: 'Arrêt maladie',    icon: '🤒', color: '#f59e0b' },
  { code: 'maternite',  label: 'Maternité',        icon: '🤰', color: '#ec4899' },
  { code: 'paternite',  label: 'Paternité',        icon: '👨‍🍼', color: '#3b82f6' },
  { code: 'sans_solde', label: 'Sans solde',       icon: '⏸️', color: '#6b7280' },
  { code: 'special',    label: 'Congé spécial',    icon: '⭐', color: '#a855f7' },
]

const STATUS = {
  demande:   { label: 'En attente',  color: '#f59e0b' },
  approuve:  { label: 'Approuvé',    color: '#10b981' },
  refuse:    { label: 'Refusé',      color: '#ef4444' },
  annule:    { label: 'Annulé',      color: '#6b7280' },
} as Record<string, { label: string; color: string }>

const computeDays = (start: string, end: string): number => {
  if (!start || !end) return 0
  const a = new Date(start), b = new Date(end)
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}

export default function CongesPage() {
  const [items, setItems] = useState<LeaveRequest[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<Partial<LeaveRequest>>({ type: 'annuel', status: 'demande' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [lr, w] = await Promise.all([
        supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('workers').select('id, first_name, last_name, matricule, category').eq('is_active', true).order('last_name'),
      ])
      if (lr.error) throw lr.error
      setItems((lr.data ?? []) as any)
      setWorkers((w.data ?? []) as any)
    } catch (e: any) { setError(e.message || String(e)) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => filterStatus === 'all' ? items : items.filter(i => i.status === filterStatus), [items, filterStatus])

  const counts = useMemo(() => ({
    demande: items.filter(i => i.status === 'demande').length,
    approuve: items.filter(i => i.status === 'approuve').length,
    refuse: items.filter(i => i.status === 'refuse').length,
    total_days_taken: items.filter(i => i.status === 'approuve' && i.type === 'annuel').reduce((s, i) => s + (Number(i.days) || 0), 0),
  }), [items])

  const f = (k: keyof LeaveRequest) => (e: any) => setForm(s => ({ ...s, [k]: e.target.value }))

  const save = async () => {
    if (!form.worker_id || !form.start_date || !form.end_date || !form.type) {
      setError('Employé, dates et type sont requis'); return
    }
    setSaving(true); setError('')
    try {
      const days = computeDays(form.start_date, form.end_date)
      const { error } = await supabase.from('leave_requests').insert({
        worker_id: form.worker_id, type: form.type,
        start_date: form.start_date, end_date: form.end_date, days,
        reason: form.reason || null, status: 'demande',
      })
      if (error) throw error
      setDone(true)
      setTimeout(() => { setModalOpen(false); setDone(false); setForm({ type: 'annuel', status: 'demande' }); load() }, 800)
    } catch (e: any) { setError(e.message || String(e)) }
    setSaving(false)
  }

  const updateStatus = async (id: string, status: 'approuve' | 'refuse', refused_reason?: string) => {
    const patch: any = { status, approved_at: new Date().toISOString() }
    if (status === 'refuse') patch.refused_reason = refused_reason ?? null
    const { error } = await supabase.from('leave_requests').update(patch).eq('id', id)
    if (error) alert('Erreur : ' + error.message); else load()
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1500 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-main)' }}>
            🏖️ Congés
          </h1>
          <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 4 }}>
            Acquisition standard Maroc : 1,5 jour / mois travaillé soit 18 j/an
          </div>
        </div>
        <button onClick={() => { setModalOpen(true); setDone(false); setError('') }} className="btn-primary" style={{ marginLeft: 'auto', fontSize: 12, padding: '7px 14px' }}>
          + Nouvelle demande
        </button>
      </header>

      {error && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12.5 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
        <KPI label="En attente"  value={counts.demande}        color="#f59e0b" />
        <KPI label="Approuvés"   value={counts.approuve}       color="#10b981" />
        <KPI label="Refusés"     value={counts.refuse}         color="#ef4444" />
        <KPI label="Jours pris"  value={`${counts.total_days_taken}j`} sub="congés annuels approuvés" color="#0ea5e9" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['all', 'demande', 'approuve', 'refuse'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{
              padding: '5px 12px', fontSize: 11.5, borderRadius: 5,
              border: '1px solid var(--bd-1)',
              background: filterStatus === s ? 'var(--neon-dim)' : 'var(--bg-2)',
              color: filterStatus === s ? 'var(--neon)' : 'var(--text-sub)',
              cursor: 'pointer',
            }}>
            {s === 'all' ? 'Tous' : STATUS[s].label}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid var(--bd-1)', borderRadius: 8, overflow: 'auto', background: 'var(--bg-1)' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-2)' }}>
            <tr>
              {['Employé', 'Type', 'Du', 'Au', 'Jours', 'Motif', 'Statut', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: 'var(--text-sub)' }}>Chargement…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Aucune demande.</td></tr>}
            {filtered.map(lr => {
              const w = workers.find(x => x.id === lr.worker_id)
              const t = TYPES.find(x => x.code === lr.type)
              const st = STATUS[lr.status] ?? { label: lr.status, color: 'var(--text-sub)' }
              return (
                <tr key={lr.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{w ? `${w.last_name} ${w.first_name}` : '—'}<div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{w?.matricule}</div></td>
                  <td style={td}>{t ? <span style={{ padding: '2px 8px', borderRadius: 4, background: t.color + '20', color: t.color, fontSize: 11 }}>{t.icon} {t.label}</span> : lr.type}</td>
                  <td style={td}>{lr.start_date}</td>
                  <td style={td}>{lr.end_date}</td>
                  <td style={tdNum}>{lr.days}j</td>
                  <td style={{ ...td, color: 'var(--text-sub)', fontSize: 11 }}>{lr.reason ?? '—'}</td>
                  <td style={td}><span style={{ padding: '2px 8px', borderRadius: 4, background: st.color + '20', color: st.color, fontSize: 11, fontWeight: 600 }}>{st.label}</span></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {lr.status === 'demande' && (
                      <>
                        <button onClick={() => updateStatus(lr.id, 'approuve')} className="btn-primary" style={{ fontSize: 10, padding: '3px 8px', marginRight: 4 }}>✓</button>
                        <button onClick={() => updateStatus(lr.id, 'refuse', prompt('Motif du refus ?') ?? undefined)} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>✗</button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title="Nouvelle demande de congé" onClose={() => setModalOpen(false)}>
          {done ? <SuccessMessage message="Demande créée" /> : (
            <>
              <FormGroup label="Employé *">
                <Select value={form.worker_id ?? ''} onChange={f('worker_id')}>
                  <option value="">— sélectionner —</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.last_name} {w.first_name} {w.matricule ? `(${w.matricule})` : ''}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Type *">
                <Select value={form.type ?? 'annuel'} onChange={f('type')}>
                  {TYPES.map(t => <option key={t.code} value={t.code}>{t.icon} {t.label}</option>)}
                </Select>
              </FormGroup>
              <FormRow>
                <FormGroup label="Date début *"><Input type="date" value={form.start_date ?? ''} onChange={f('start_date')} /></FormGroup>
                <FormGroup label="Date fin *"><Input type="date" value={form.end_date ?? ''} onChange={f('end_date')} /></FormGroup>
              </FormRow>
              {form.start_date && form.end_date && (
                <div style={{ marginBottom: 10, padding: 8, background: 'var(--bg-2)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-sub)' }}>
                  Durée calculée : <strong style={{ color: 'var(--text-main)' }}>{computeDays(form.start_date, form.end_date)} jour(s)</strong>
                </div>
              )}
              <FormGroup label="Motif">
                <Textarea value={form.reason ?? ''} onChange={f('reason')} placeholder="Optionnel" />
              </FormGroup>
              <ModalFooter
                onCancel={() => setModalOpen(false)}
                onSave={save}
                loading={saving}
                saveLabel="SOUMETTRE"
              />
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

function KPI({ label, value, sub, color }: { label: string; value: any; sub?: string; color: string }) {
  return (
    <div style={{ padding: 14, background: 'var(--bg-1)', border: '1px solid var(--bd-1)', borderRadius: 10, borderTop: `2px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--font-display)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: .5, borderBottom: '1px solid var(--bd-1)' }
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-main)' }
const tdNum: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', textAlign: 'right' }
