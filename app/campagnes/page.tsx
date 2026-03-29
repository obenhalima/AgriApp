'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getFarms } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCampagneCode } from '@/lib/utils'

export default function CampagnesPage() {
  const [items, setItems] = useState<any[]>([])
  const [farms, setFarms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    code:'', name:'', farm_id:'',
    preparation_start:'', planting_start:'', harvest_start:'',
    harvest_end:'', campaign_end:'',
    budget_total:'', production_target_kg:'',
    notes:''
  })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  const load = async () => {
    try {
      const [c, f] = await Promise.all([
        supabase.from('campaigns').select('*, farms(name)').order('created_at',{ascending:false}),
        getFarms()
      ])
      setItems(c.data||[])
      setFarms(f)
    } catch(e) {}
    setLoading(false)
  }

  useEffect(()=>{ load() },[])

  const openModal = () => {
    const codes = items.map(i=>i.code)
    const year = new Date().getFullYear()
    const autoCode = genCampagneCode(codes)
    const autoName = `Campagne ${year}-${year+1}`
    const farmId = farms.length === 1 ? farms[0].id : ''
    setForm(f=>({...f, code:autoCode, name:autoName, farm_id:farmId}))
    setModal(true)
  }

  const save = async () => {
    if (!form.farm_id || !form.name) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('campaigns').insert({
        code: form.code,
        name: form.name,
        farm_id: form.farm_id,
        status: 'planification',
        preparation_start: form.preparation_start || null,
        planting_start: form.planting_start || null,
        harvest_start: form.harvest_start || null,
        harvest_end: form.harvest_end || null,
        campaign_end: form.campaign_end || null,
        budget_total: form.budget_total ? Number(form.budget_total) : null,
        production_target_kg: form.production_target_kg ? Number(form.production_target_kg)*1000 : null,
        notes: form.notes,
      }).select('*, farms(name)').single()
      if (error) throw error
      setItems(p=>[data,...p])
      setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const STATUS_COLORS: Record<string,string> = {
    planification:'var(--blue)', en_cours:'var(--neon)', terminee:'var(--tx-3)', annulee:'var(--red)'
  }

  return (
    <div style={{background:'var(--bg-deep)',minHeight:'100vh'}}>
      {modal && (
        <Modal title="NOUVELLE CAMPAGNE" onClose={()=>{setModal(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message="Campagne créée !" /> : (<>

            <div className="section-label" style={{marginBottom:14}}>IDENTIFICATION</div>
            <FormRow>
              <FormGroup label="Code (auto-généré)">
                <Input value={form.code} onChange={s('code')} />
              </FormGroup>
              <FormGroup label="Nom de la campagne *">
                <Input value={form.name} onChange={s('name')} placeholder="ex: Campagne 2026-2027" autoFocus />
              </FormGroup>
            </FormRow>
            <FormGroup label="Ferme *">
              {farms.length === 0 ? (
                <div style={{padding:'10px 13px',background:'var(--red-dim)',border:'1px solid var(--red)40',borderRadius:7,color:'var(--red)',fontFamily:'var(--font-mono)',fontSize:11}}>
                  ⚠ Aucune ferme trouvée — créez d'abord une ferme dans le menu Fermes
                </div>
              ) : (
                <Select value={form.farm_id} onChange={s('farm_id')}>
                  <option value="">-- Sélectionner une ferme --</option>
                  {farms.map(f=><option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
                </Select>
              )}
            </FormGroup>

            <div className="section-label" style={{marginBottom:14,marginTop:20}}>CALENDRIER</div>
            <FormRow>
              <FormGroup label="Début préparation">
                <Input type="date" value={form.preparation_start} onChange={s('preparation_start')} />
              </FormGroup>
              <FormGroup label="Début plantation">
                <Input type="date" value={form.planting_start} onChange={s('planting_start')} />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Début récolte">
                <Input type="date" value={form.harvest_start} onChange={s('harvest_start')} />
              </FormGroup>
              <FormGroup label="Fin récolte">
                <Input type="date" value={form.harvest_end} onChange={s('harvest_end')} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Fin de campagne">
              <Input type="date" value={form.campaign_end} onChange={s('campaign_end')} />
            </FormGroup>

            <div className="section-label" style={{marginBottom:14,marginTop:20}}>OBJECTIFS</div>
            <FormRow>
              <FormGroup label="Budget prévisionnel (MAD)">
                <Input type="number" value={form.budget_total} onChange={s('budget_total')} placeholder="ex: 4200000" />
              </FormGroup>
              <FormGroup label="Objectif production (tonnes)">
                <Input type="number" value={form.production_target_kg} onChange={s('production_target_kg')} placeholder="ex: 1850" />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes">
              <Textarea rows={2} value={form.notes} onChange={s('notes')} placeholder="Remarques sur la campagne..." />
            </FormGroup>

            <ModalFooter
              onCancel={()=>setModal(false)}
              onSave={save}
              loading={saving}
              disabled={!form.farm_id || !form.name}
              saveLabel="CRÉER LA CAMPAGNE"
            />
          </>)}
        </Modal>
      )}

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <div className="page-title">CAMPAGNES</div>
          <div className="page-sub">{items.length} campagne(s) · {farms.length} ferme(s) disponible(s)</div>
        </div>
        <button className="btn-primary" onClick={openModal}>+ NEW CAMPAGNE</button>
      </div>

      {farms.length === 0 && !loading && (
        <div style={{padding:'12px 16px',background:'var(--amber-dim)',border:'1px solid var(--amber)40',borderRadius:8,marginBottom:16,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--amber)',letterSpacing:.5}}>
          ⚠ Créez d'abord une ferme dans <strong>Fermes &amp; Sites</strong> avant de créer une campagne.
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <div className="empty-title">Aucune campagne</div>
          <div className="empty-sub">Créez votre première campagne de production.</div>
          <button className="btn-primary" onClick={openModal} disabled={farms.length===0}>+ NEW CAMPAGNE</button>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {items.map((c:any)=>{
            const color = STATUS_COLORS[c.status] || 'var(--tx-3)'
            return (
              <div key={c.id} className="card" style={{borderLeft:`3px solid ${color}`}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
                  <div>
                    <div style={{fontFamily:'var(--font-display)',fontSize:17,fontWeight:700,color:'var(--tx-1)',textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>{c.name}</div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)',letterSpacing:1}}>{c.code} · {c.farms?.name}</div>
                  </div>
                  <span className="tag" style={{background:`${color}18`,color:color,border:`1px solid ${color}40`}}>
                    {c.status?.replace('_',' ').toUpperCase()}
                  </span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
                  {[
                    ['Plantation', c.planting_start||'—'],
                    ['Début récolte', c.harvest_start||'—'],
                    ['Fin récolte', c.harvest_end||'—'],
                    ['Budget', c.budget_total ? (c.budget_total/1000000).toFixed(2)+' M MAD' : '—'],
                    ['Objectif', c.production_target_kg ? (c.production_target_kg/1000).toFixed(0)+' t' : '—'],
                  ].map(([l,v])=>(
                    <div key={l} style={{background:'var(--bg-card2)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 10px'}}>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--tx-3)',letterSpacing:1,marginBottom:3}}>{l}</div>
                      <div style={{fontFamily:'var(--font-display)',fontSize:13,fontWeight:600,color:'var(--tx-1)'}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
