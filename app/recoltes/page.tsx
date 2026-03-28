'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

type Tab = 'liste' | 'sans_prix' | 'alertes'

/* ── Helpers ── */
const parseMeta = (notes: string | null) => {
  try { return JSON.parse(notes || '{}') } catch { return {} }
}

const calcQty = (brute: number, freinte: number, ecart: number, manuelle?: number): number => {
  if (manuelle !== undefined && manuelle >= 0) return manuelle
  const nette = brute * (1 - freinte / 100)
  return Math.round(nette * (1 - ecart / 100) * 100) / 100
}

const calcCA = (qtyAcceptee: number, prix: number) =>
  Math.round(qtyAcceptee * prix * 100) / 100

const getCA   = (d: any) => parseMeta(d.notes).ca_amount   ?? 0
const getQtyA = (d: any) => parseMeta(d.notes).qty_acceptee ?? Number(d.certificate_number ?? 0)

const harvestStatut = (h: any, disps: any[]) => {
  const hd = disps.filter(d => d.harvest_id === h.id)
  if (hd.length === 0) return 'RÉCOLTÉE'
  const confirmed = hd.filter(d => d.certificate_number)
  if (confirmed.length === 0) return 'DISPATCHÉE'
  if (confirmed.length < hd.length) return 'PARTIELLEMENT CONFIRMÉE'
  return 'CLÔTURÉE'
}

const statutStyle = (s: string) => {
  const map: Record<string,[string,string]> = {
    'RÉCOLTÉE':                ['#3d6b52','#1a3526'],
    'DISPATCHÉE':              ['#00b4d8','#00b4d818'],
    'PARTIELLEMENT CONFIRMÉE': ['#f5a623','#f5a62318'],
    'CLÔTURÉE':                ['#00e87a','#00e87a18'],
  }
  const [color,bg] = map[s] || ['#3d6b52','#1a3526']
  return { color, background: bg, border: `1px solid ${color}40` }
}

/* ══════════════════════════════════════════════════════════════ */
export default function RecoltesPage() {
  const [tab, setTab]           = useState<Tab>('liste')
  const [harvests, setHarvests] = useState<any[]>([])
  const [dispatches, setDispatches] = useState<any[]>([])
  const [plantings, setPlantings]   = useState<any[]>([])
  const [markets, setMarkets]       = useState<any[]>([])
  const [alertes, setAlertes]       = useState<any[]>([])
  const [loading, setLoading]       = useState(true)

  /* Modales */
  const [modalNew,      setModalNew]      = useState(false)
  const [modalEdit,     setModalEdit]     = useState<any>(null)
  const [modalDispatch, setModalDispatch] = useState<any>(null)
  const [modalConfirm,  setModalConfirm]  = useState<any>(null)
  const [modalPeriode,  setModalPeriode]  = useState(false)
  const [modalAlerte,   setModalAlerte]   = useState(false)

  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)

  /* Form récolte */
  const [formNew,  setFormNew]  = useState({ campaign_planting_id:'', harvest_date:'', total_qty:'', notes:'' })
  const [formEdit, setFormEdit] = useState<Record<string,any>>({})

  /* Form dispatch */
  const [dispLines, setDispLines] = useState<{market_id:string; qty:string}[]>([{market_id:'',qty:''}])

  /* Form confirmation individuelle */
  const [formC, setFormC] = useState({ freinte_pct:'0', ecart_pct:'0', qty_acceptee:'', price_per_kg:'', periode_debut:'', periode_fin:'', station_ref:'', receipt_date:'' })
  const [qtyAccepteeManuelle, setQtyAccepteeManuelle] = useState(false)

  /* Form période */
  const [periodeDebut,   setPeriodeDebut]   = useState('')
  const [periodeFin,     setPeriodeFin]     = useState('')
  const [periodeRef,     setPeriodeRef]     = useState('')
  const [periodeDate,    setPeriodeDate]    = useState('')
  // Prix par marché pour la période
  const [marchePrix,     setMarchePrix]     = useState<Record<string,string>>({})
  // Rows du tableau période : dispatchId → {freinte, ecart, qty_acceptee_manuelle, qty_acceptee_calc}
  const [periodeRows,    setPeriodeRows]    = useState<Record<string,{freinte:string; ecart:string; qty_man:string; qty_calc:number}>>({})
  const [periodeSelIds,  setPeriodeSelIds]  = useState<Set<string>>(new Set())

  /* Form alerte */
  const [formAlerte, setFormAlerte] = useState({ date:'', reason:'panne', notes:'' })

  /* ─── CHARGEMENT ─── */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [h, d, p, m, al] = await Promise.all([
        supabase.from('harvests')
          .select('id,lot_number,harvest_date,total_qty,notes,campaign_planting_id,campaign_plantings(*, greenhouses(code,name), varieties(commercial_name), campaigns(name))')
          .order('harvest_date', { ascending: false }).limit(300),
        supabase.from('harvest_lots')
          .select('id,lot_number,harvest_id,harvest_date,quantity_kg,certificate_number,storage_temp,notes,market_id,markets(name,currency)')
          .eq('category','station_dispatch')
          .order('created_at', { ascending: false }),
        supabase.from('campaign_plantings')
          .select('id,variety_id,greenhouse_id,greenhouses(code,name),varieties(commercial_name),campaigns(name)'),
        supabase.from('markets').select('id,name,currency,type').eq('is_active',true).order('name'),
        supabase.from('alerts').select('*').eq('type','no_harvest').order('created_at',{ascending:false}).limit(100),
      ])
      setHarvests(h.data||[])
      setDispatches((d.data||[]) as any)
      setPlantings(p.data||[])
      setMarkets(m.data||[])
      setAlertes(al.data||[])
    } catch(e){ console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* ─── CRÉER RÉCOLTE ─── */
  const saveNew = async () => {
    if (!formNew.campaign_planting_id||!formNew.harvest_date||!formNew.total_qty) return
    setSaving(true)
    try {
      const lot = `LOT-${formNew.harvest_date.replace(/-/g,'')}-${String(Date.now()).slice(-4)}`
      const { data, error } = await supabase.from('harvests').insert({
        campaign_planting_id: formNew.campaign_planting_id,
        harvest_date: formNew.harvest_date,
        total_qty:    Number(formNew.total_qty),
        lot_number:   lot,
        notes:        formNew.notes||null,
        qty_category_1:0, qty_category_2:0, qty_category_3:0, qty_waste:0,
      }).select('id,lot_number,harvest_date,total_qty,notes,campaign_planting_id,campaign_plantings(*,greenhouses(code,name),varieties(commercial_name),campaigns(name))').single()
      if (error) throw error
      setHarvests(p => [data as any, ...p])
      setDone(true)
      setTimeout(() => { setModalNew(false); setDone(false); setFormNew({campaign_planting_id:'',harvest_date:'',total_qty:'',notes:''}) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─── MODIFIER RÉCOLTE ─── */
  const openEdit = (h: any) => {
    setFormEdit({ campaign_planting_id:h.campaign_planting_id, harvest_date:h.harvest_date, total_qty:String(h.total_qty||''), notes:h.notes||'' })
    setModalEdit(h)
  }
  const saveEdit = async () => {
    if (!modalEdit) return
    setSaving(true)
    try {
      const { error } = await supabase.from('harvests').update({
        campaign_planting_id: formEdit.campaign_planting_id,
        harvest_date: formEdit.harvest_date,
        total_qty:    Number(formEdit.total_qty)||0,
        notes:        formEdit.notes||null,
      }).eq('id', modalEdit.id)
      if (error) throw error
      setHarvests(p => p.map(h => h.id===modalEdit.id ? {...h,...formEdit,total_qty:Number(formEdit.total_qty)} : h))
      setDone(true)
      setTimeout(() => { setModalEdit(null); setDone(false) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const deleteRecolte = async (id:string, lot:string) => {
    if (!confirm(`Supprimer la récolte ${lot} ?`)) return
    await supabase.from('harvest_lots').delete().eq('harvest_id',id)
    await supabase.from('harvests').delete().eq('id',id)
    setHarvests(p => p.filter(h=>h.id!==id))
    setDispatches(p => p.filter(d=>d.harvest_id!==id))
  }

  /* ─── DISPATCHER (ÉTAPE 2) ─── */
  const openDispatch = (h: any) => { setDispLines([{market_id:'',qty:''}]); setModalDispatch(h); setDone(false) }
  const addDispLine  = () => setDispLines(p=>[...p,{market_id:'',qty:''}])
  const rmDispLine   = (i:number) => setDispLines(p=>p.filter((_,j)=>j!==i))
  const upDispLine   = (i:number, k:string, v:string) => setDispLines(p=>p.map((l,j)=>j===i?{...l,[k]:v}:l))

  const saveDispatch = async () => {
    if (!modalDispatch) return
    const validLines = dispLines.filter(l=>l.market_id&&l.qty&&Number(l.qty)>0)
    if (validLines.length===0) return
    setSaving(true)
    try {
      const cp = plantings.find(p=>p.id===modalDispatch.campaign_planting_id)
      const newDisps: any[] = []
      const ts = String(Date.now())
      for (let idx=0; idx<validLines.length; idx++) {
        const line = validLines[idx]
        const dispLot = `D${idx}-${ts.slice(-8)}`.slice(0,50)
        const { data, error } = await supabase.from('harvest_lots').insert({
          lot_number:           dispLot,
          harvest_id:           modalDispatch.id,
          campaign_planting_id: modalDispatch.campaign_planting_id,
          harvest_date:         modalDispatch.harvest_date,
          quantity_kg:          Number(line.qty),
          category:             'station_dispatch',
          variety_id:           cp?.variety_id||null,
          greenhouse_id:        cp?.greenhouse_id||null,
          market_id:            line.market_id,
          certificate_number:   null,
          storage_temp:         null,
          notes:                null,
        }).select('id,lot_number,harvest_id,harvest_date,quantity_kg,certificate_number,storage_temp,notes,market_id,markets(name,currency)').single()
        if (error) throw new Error(`Marché ${idx+1}: ${error.message}`)
        newDisps.push(data)
      }
      setDispatches((p:any) => [...newDisps,...p])
      setDone(true)
      setTimeout(() => { setModalDispatch(null); setDone(false); setDispLines([{market_id:'',qty:''}]) }, 1400)
    } catch(e:any){ alert('Erreur dispatch: '+e.message) }
    setSaving(false)
  }

  /* ─── CONFIRMATION INDIVIDUELLE (ÉTAPE 3) ─── */
  const openConfirm = (d: any) => {
    const meta = parseMeta(d.notes)
    const fc = {
      freinte_pct:   String(meta.freinte_pct ?? 0),
      ecart_pct:     String(meta.ecart_pct   ?? 0),
      qty_acceptee:  meta.qty_acceptee ? String(meta.qty_acceptee) : '',
      price_per_kg:  meta.price_per_kg ? String(meta.price_per_kg) : '',
      periode_debut: meta.periode_debut || '',
      periode_fin:   meta.periode_fin   || '',
      station_ref:   meta.station_ref   || '',
      receipt_date:  meta.receipt_date  || '',
    }
    setFormC(fc)
    setQtyAccepteeManuelle(!!meta.qty_acceptee)
    setModalConfirm(d)
    setDone(false)
  }

  // Quantité acceptée calculée (confirmation individuelle)
  const qtyAccCalc = useMemo(() => {
    if (!modalConfirm) return 0
    const brute   = modalConfirm.quantity_kg || 0
    const freinte = Number(formC.freinte_pct)||0
    const ecart   = Number(formC.ecart_pct)||0
    return calcQty(brute, freinte, ecart)
  }, [modalConfirm, formC.freinte_pct, formC.ecart_pct])

  const qtyAccEffective = qtyAccepteeManuelle && formC.qty_acceptee !== ''
    ? Number(formC.qty_acceptee)
    : qtyAccCalc

  const caConfirm = formC.price_per_kg ? calcCA(qtyAccEffective, Number(formC.price_per_kg)) : 0

  const saveConfirm = async () => {
    if (!modalConfirm||!formC.price_per_kg) return
    setSaving(true)
    try {
      const prix   = Number(formC.price_per_kg)
      const freinte = Number(formC.freinte_pct)||0
      const ecart   = Number(formC.ecart_pct)||0
      const qtyB    = modalConfirm.quantity_kg
      const qtyN    = Math.round(qtyB*(1-freinte/100)*100)/100
      const qtyA    = qtyAccEffective
      const ca      = calcCA(qtyA, prix)
      const meta    = JSON.stringify({
        price_per_kg:  prix,
        freinte_pct:   freinte,
        ecart_pct:     ecart,
        qty_brute:     qtyB,
        qty_nette:     qtyN,
        qty_acceptee:  qtyA,
        ca_amount:     ca,
        periode_debut: formC.periode_debut||null,
        periode_fin:   formC.periode_fin||null,
        station_ref:   formC.station_ref||null,
        receipt_date:  formC.receipt_date||null,
        price_set_at:  new Date().toISOString(),
      })
      const { error } = await supabase.from('harvest_lots').update({
        certificate_number: String(qtyA),
        notes: meta,
      }).eq('id', modalConfirm.id)
      if (error) throw error
      setDispatches(p => p.map(d => d.id===modalConfirm.id ? {...d,certificate_number:String(qtyA),notes:meta} : d))
      setDone(true)
      setTimeout(() => { setModalConfirm(null); setDone(false) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─── SAISIE PAR PÉRIODE ─── */
  const openPeriode = () => {
    setPeriodeDebut(''); setPeriodeFin(''); setPeriodeRef(''); setPeriodeDate('')
    setMarchePrix({}); setPeriodeRows({}); setPeriodeSelIds(new Set())
    setModalPeriode(true); setDone(false)
  }

  // Variables stables avec useMemo pour éviter les boucles infinies
  const sansPrix  = useMemo(() => dispatches.filter((d:any) => !d.certificate_number), [dispatches])
  const avecPrix  = useMemo(() => dispatches.filter((d:any) =>  d.certificate_number), [dispatches])

  const dispatchesPeriode = useMemo(() => {
    const sp = dispatches.filter((d:any) => !d.certificate_number)
    if (!periodeDebut||!periodeFin) return sp
    return sp.filter((d:any) => {
      const dt = d.harvest_date
      return dt >= periodeDebut && dt <= periodeFin
    })
  }, [periodeDebut, periodeFin, dispatches])

  // Marchés distincts dans la période
  const marchesInPeriode = useMemo(() => {
    const seen = new Set<string>()
    const result: any[] = []
    ;(dispatchesPeriode||[]).forEach((d:any) => {
      if (!seen.has(d.market_id)) { seen.add(d.market_id); result.push(d.markets) }
    })
    return result.filter(Boolean)
  }, [dispatchesPeriode])

  // Init periodeRows quand les dispatches changent
  useEffect(() => {
    if (!modalPeriode || !dispatchesPeriode) return
    const rows: Record<string,any> = {}
    ;(dispatchesPeriode||[]).forEach((d:any) => {
      if (!rows[d.id]) {
        const meta = parseMeta(d.notes)
        const freinte = String(meta.freinte_pct ?? 0)
        const ecart   = String(meta.ecart_pct   ?? 0)
        const qtyC    = calcQty(d.quantity_kg, Number(freinte), Number(ecart))
        rows[d.id] = { freinte, ecart, qty_man:'', qty_calc: qtyC }
      }
    })
    setPeriodeRows(rows)
    setPeriodeSelIds(new Set(dispatchesPeriode.map((d:any)=>d.id)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalPeriode, periodeDebut, periodeFin])

  // Recalculer qty_calc quand freinte/ecart changent
  const updatePeriodeRow = (id:string, key:'freinte'|'ecart'|'qty_man', val:string) => {
    setPeriodeRows(prev => {
      const row = { ...prev[id] }
      row[key] = val
      const d   = dispatchesPeriode.find((x:any)=>x.id===id)
      if (!d) return prev
      // Si on modifie qty_man, on ne recalcule pas
      if (key !== 'qty_man') {
        row.qty_calc = calcQty(d.quantity_kg, Number(row.freinte)||0, Number(row.ecart)||0)
      }
      return { ...prev, [id]: row }
    })
  }

  const qtyEffForRow = (id:string, d:any) => {
    const row = periodeRows[id]
    if (!row) return 0
    return row.qty_man !== '' ? Number(row.qty_man) : row.qty_calc
  }

  // CA estimé total période par marché
  const caParMarchePeriode = useMemo(() => {
    const res: Record<string,{nom:string;ca:number;currency:string}> = {}
    ;(dispatchesPeriode||[]).filter((d:any)=>periodeSelIds.has(d.id)).forEach((d:any) => {
      const prix = Number(marchePrix[d.market_id]||0)
      const qtyA = qtyEffForRow(d.id, d)
      const ca   = calcCA(qtyA, prix)
      const mid  = d.market_id
      if (!res[mid]) res[mid] = { nom: d.markets?.name||'—', ca:0, currency: d.markets?.currency||'MAD' }
      res[mid].ca += ca
    })
    return res
  }, [dispatchesPeriode, periodeSelIds, marchePrix, periodeRows])

  const savePeriode = async () => {
    const selDisps = dispatchesPeriode.filter((d:any) => periodeSelIds.has(d.id))
    if (selDisps.length===0 || !periodeDebut || !periodeFin) return
    // Vérifier qu'au moins un prix est saisi
    const hasPrix = selDisps.some((d:any) => marchePrix[d.market_id] && Number(marchePrix[d.market_id])>0)
    if (!hasPrix) { alert('Saisissez au moins un prix marché'); return }
    setSaving(true)
    try {
      const updated: any[] = []
      for (const d of selDisps) {
        const prix = Number(marchePrix[d.market_id]||0)
        if (!prix) continue // Pas de prix pour ce marché → on skippe
        const row    = periodeRows[d.id] || { freinte:'0', ecart:'0', qty_man:'' }
        const freinte = Number(row.freinte)||0
        const ecart   = Number(row.ecart)||0
        const qtyB    = d.quantity_kg
        const qtyN    = Math.round(qtyB*(1-freinte/100)*100)/100
        const qtyA    = qtyEffForRow(d.id, d)
        const ca      = calcCA(qtyA, prix)
        const meta    = JSON.stringify({
          price_per_kg:  prix,
          freinte_pct:   freinte,
          ecart_pct:     ecart,
          qty_brute:     qtyB,
          qty_nette:     qtyN,
          qty_acceptee:  qtyA,
          ca_amount:     ca,
          periode_debut: periodeDebut,
          periode_fin:   periodeFin,
          station_ref:   periodeRef||null,
          receipt_date:  periodeDate||null,
          price_set_at:  new Date().toISOString(),
        })
        const { error } = await supabase.from('harvest_lots').update({
          certificate_number: String(qtyA),
          notes: meta,
        }).eq('id', d.id)
        if (!error) updated.push({...d, certificate_number:String(qtyA), notes:meta})
      }
      setDispatches(p => p.map(d => { const u=updated.find(x=>x.id===d.id); return u||d }))
      setDone(true)
      setTimeout(() => { setModalPeriode(false); setDone(false) }, 1800)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  /* ─── ALERTE ─── */
  const saveAlerte = async () => {
    if (!formAlerte.date) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('alerts').insert({
        type:'no_harvest', severity:'warning',
        title:`Journée sans récolte — ${formAlerte.date}`,
        message:`Motif: ${formAlerte.reason}${formAlerte.notes?' — '+formAlerte.notes:''}`,
        entity_type:'harvest', is_read:false, is_resolved:false,
      }).select().single()
      if (error) throw error
      setAlertes(p=>[data,...p])
      setDone(true)
      setTimeout(() => { setModalAlerte(false); setDone(false); setFormAlerte({date:'',reason:'panne',notes:''}) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }
  const resolveAlerte = async (id:string) => {
    await supabase.from('alerts').update({is_resolved:true,resolved_at:new Date().toISOString()}).eq('id',id)
    setAlertes(p=>p.map(a=>a.id===id?{...a,is_resolved:true}:a))
  }

  /* ─── COMPUTED ─── */
  // sansPrix et avecPrix définis plus haut avant les useMemo
  const totalCA      = useMemo(() => avecPrix.reduce((s,d) => s+getCA(d), 0), [avecPrix])
  const totalKg      = useMemo(() => harvests.reduce((s,h) => s+(h.total_qty||0), 0), [harvests])
  const activAlertes = useMemo(() => alertes.filter(a=>!a.is_resolved), [alertes])

  const caParMarche = useMemo(() => {
    const res: Record<string,{nom:string;qtyEnv:number;qtyAcc:number;ca:number;currency:string;sansPrix:number}> = {}
    for (const d of dispatches) {
      const mid = d.market_id||'unknown'
      if (!res[mid]) res[mid]={nom:d.markets?.name||'—',qtyEnv:0,qtyAcc:0,ca:0,currency:d.markets?.currency||'MAD',sansPrix:0}
      res[mid].qtyEnv += d.quantity_kg||0
      res[mid].qtyAcc += getQtyA(d)
      res[mid].ca     += getCA(d)
      if (!d.certificate_number) res[mid].sansPrix++
    }
    return res
  }, [dispatches])

  const invendus = (h:any) => {
    const disp = dispatches.filter(d=>d.harvest_id===h.id).reduce((s,d)=>s+(d.quantity_kg||0),0)
    return Math.max(0,(h.total_qty||0)-disp)
  }

  const togglePer = (id:string) => setPeriodeSelIds(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})

  const REASONS = [
    {value:'panne',label:'Panne équipement'},{value:'meteo',label:'Conditions météo'},
    {value:'main_oeuvre',label:"Manque main d'œuvre"},{value:'stade_culture',label:'Stade cultural'},
    {value:'jour_repos',label:'Jour de repos'},{value:'autre',label:'Autre'},
  ]

  const TH = (s:string) => (
    <th key={s} style={{padding:'9px 12px',fontFamily:'DM Mono,monospace',fontSize:9.5,fontWeight:500,color:'#3d6b52',textTransform:'uppercase',letterSpacing:1,borderBottom:'1px solid #1a3526',textAlign:'left',background:'#050d09',whiteSpace:'nowrap'}}>{s}</th>
  )

  /* ═══════════════════════════════ RENDU ═══════════════════════════════ */
  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>

      {/* ══ MODALE NOUVELLE RÉCOLTE ══ */}
      {modalNew && (
        <Modal title="SAISIR UNE RÉCOLTE" onClose={()=>{setModalNew(false);setDone(false)}}>
          {done ? <SuccessMessage message="Récolte enregistrée !" /> : (<>
            <FormGroup label="Plantation *">
              {plantings.length===0
                ? <div style={{padding:'10px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,color:'#ff4d6d',fontFamily:'DM Mono,monospace',fontSize:11}}>⚠ Aucune plantation disponible</div>
                : <Select value={formNew.campaign_planting_id} onChange={e=>setFormNew(f=>({...f,campaign_planting_id:e.target.value}))}>
                    <option value="">-- Sélectionner --</option>
                    {plantings.map((p:any)=><option key={p.id} value={p.id}>{p.greenhouses?.name} · {p.varieties?.commercial_name} [{p.campaigns?.name}]</option>)}
                  </Select>
              }
            </FormGroup>
            <FormRow>
              <FormGroup label="Date de récolte *">
                <Input type="date" value={formNew.harvest_date} onChange={e=>setFormNew(f=>({...f,harvest_date:e.target.value}))} />
              </FormGroup>
              <FormGroup label="Quantité récoltée (kg) *">
                <Input type="number" value={formNew.total_qty} onChange={e=>setFormNew(f=>({...f,total_qty:e.target.value}))} placeholder="ex: 500" autoFocus />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes qualité">
              <Textarea rows={2} value={formNew.notes} onChange={e=>setFormNew(f=>({...f,notes:e.target.value}))} placeholder="Observations..." />
            </FormGroup>
            <div style={{padding:'9px 12px',background:'#00b4d818',border:'1px solid #00b4d840',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:10,color:'#00b4d8',marginTop:6}}>
              ℹ Le dispatch par marché se fait à l'étape suivante
            </div>
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={saveNew} loading={saving}
              disabled={!formNew.campaign_planting_id||!formNew.harvest_date||!formNew.total_qty} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE MODIFIER RÉCOLTE ══ */}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.lot_number}`} onClose={()=>{setModalEdit(null);setDone(false)}}>
          {done ? <SuccessMessage message="Récolte modifiée !" /> : (<>
            <FormGroup label="Plantation">
              <Select value={formEdit.campaign_planting_id} onChange={e=>setFormEdit(f=>({...f,campaign_planting_id:e.target.value}))}>
                {plantings.map((p:any)=><option key={p.id} value={p.id}>{p.greenhouses?.name} · {p.varieties?.commercial_name} [{p.campaigns?.name}]</option>)}
              </Select>
            </FormGroup>
            <FormRow>
              <FormGroup label="Date de récolte">
                <Input type="date" value={formEdit.harvest_date} onChange={e=>setFormEdit(f=>({...f,harvest_date:e.target.value}))} />
              </FormGroup>
              <FormGroup label="Quantité récoltée (kg)">
                <Input type="number" value={formEdit.total_qty} onChange={e=>setFormEdit(f=>({...f,total_qty:e.target.value}))} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes">
              <Textarea rows={2} value={formEdit.notes} onChange={e=>setFormEdit(f=>({...f,notes:e.target.value}))} />
            </FormGroup>
            <ModalFooter onCancel={()=>setModalEdit(null)} onSave={saveEdit} loading={saving} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE DISPATCH (ÉTAPE 2) ══ */}
      {modalDispatch && (
        <Modal title={`DISPATCHER — ${modalDispatch.lot_number}`} onClose={()=>{setModalDispatch(null);setDone(false)}}>
          {done ? <SuccessMessage message="Dispatches créés !" /> : (<>
            <div style={{padding:'12px 14px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,marginBottom:16}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:4}}>RÉCOLTE</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee'}}>
                {modalDispatch.campaign_plantings?.greenhouses?.name} · {modalDispatch.campaign_plantings?.varieties?.commercial_name}
              </div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginTop:3}}>
                {modalDispatch.harvest_date} · <strong style={{color:'#00e87a'}}>{modalDispatch.total_qty} kg disponibles</strong>
                {dispatches.filter(d=>d.harvest_id===modalDispatch.id).length>0 && (
                  <span style={{color:'#f5a623',marginLeft:10}}>
                    · Déjà dispatché : {dispatches.filter(d=>d.harvest_id===modalDispatch.id).reduce((s,d)=>s+d.quantity_kg,0)} kg
                  </span>
                )}
              </div>
            </div>
            <div className="section-label">ENVOI PAR MARCHÉ</div>
            {dispLines.map((line,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 120px 32px',gap:8,marginBottom:8,alignItems:'end'}}>
                <div>
                  {i===0&&<label className="form-label">Marché</label>}
                  <Select value={line.market_id} onChange={e=>upDispLine(i,'market_id',e.target.value)}>
                    <option value="">-- Sélectionner --</option>
                    {markets.map(m=><option key={m.id} value={m.id}>{m.name} ({m.currency})</option>)}
                  </Select>
                </div>
                <div>
                  {i===0&&<label className="form-label">Qté (kg)</label>}
                  <Input type="number" value={line.qty} onChange={e=>upDispLine(i,'qty',e.target.value)} placeholder="0" />
                </div>
                <div style={{paddingBottom:1}}>
                  {dispLines.length>1
                    ? <button onClick={()=>rmDispLine(i)} className="btn-danger" style={{padding:'9px 8px',fontSize:11}}>✕</button>
                    : <div style={{height:36}}/>}
                </div>
              </div>
            ))}
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
              <button onClick={addDispLine} className="btn-ghost" style={{fontSize:10,padding:'5px 10px'}}>+ Ajouter marché</button>
              {dispLines.reduce((s,l)=>s+Number(l.qty||0),0)>0 && (
                <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>
                  Total : {dispLines.reduce((s,l)=>s+Number(l.qty||0),0).toLocaleString('fr')} kg
                </span>
              )}
            </div>
            <ModalFooter onCancel={()=>setModalDispatch(null)} onSave={saveDispatch} loading={saving}
              disabled={dispLines.every(l=>!l.market_id||!l.qty)} saveLabel="CRÉER LES DISPATCHES" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE CONFIRMATION INDIVIDUELLE (ÉTAPE 3) ══ */}
      {modalConfirm && (
        <Modal title={modalConfirm.certificate_number ? "MODIFIER LA CONFIRMATION" : "CONFIRMER PRIX & QUANTITÉ"} onClose={()=>{setModalConfirm(null);setDone(false)}}>
          {done ? <SuccessMessage message="Dispatch confirmé !" /> : (<>
            {/* Résumé */}
            <div style={{padding:'12px 14px',background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,marginBottom:16}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:4}}>DISPATCH</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee'}}>
                {modalConfirm.markets?.name} — {modalConfirm.harvest_date}
              </div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginTop:3}}>
                Qté brute envoyée : <strong style={{color:'#f5a623'}}>{modalConfirm.quantity_kg} kg</strong>
              </div>
            </div>

            {/* Freinte + Écart */}
            <div className="section-label">AJUSTEMENTS QUALITÉ</div>
            <FormRow>
              <FormGroup label="Freinte (% sur qté brute)">
                <Input type="number" step="0.1" value={formC.freinte_pct}
                  onChange={e=>{ setFormC(f=>({...f,freinte_pct:e.target.value})); setQtyAccepteeManuelle(false) }}
                  placeholder="0" />
              </FormGroup>
              <FormGroup label="Écart de pesée (%)">
                <Input type="number" step="0.1" value={formC.ecart_pct}
                  onChange={e=>{ setFormC(f=>({...f,ecart_pct:e.target.value})); setQtyAccepteeManuelle(false) }}
                  placeholder="0" />
              </FormGroup>
            </FormRow>

            {/* Calcul intermédiaire */}
            {(Number(formC.freinte_pct)>0 || Number(formC.ecart_pct)>0) && (
              <div style={{padding:'10px 14px',background:'#0a1810',border:'1px solid #1a3526',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginBottom:14,display:'flex',gap:20}}>
                <span>Brute : <strong style={{color:'#f5a623'}}>{modalConfirm.quantity_kg} kg</strong></span>
                <span>→ Freinte {formC.freinte_pct}% : <strong style={{color:'#f5a623'}}>{(modalConfirm.quantity_kg*(1-Number(formC.freinte_pct)/100)).toFixed(1)} kg</strong></span>
                <span>→ Écart {formC.ecart_pct}% : <strong style={{color:'#00e87a'}}>{qtyAccCalc} kg</strong></span>
              </div>
            )}

            {/* Quantité acceptée (calculée + modifiable) */}
            <FormGroup label="Quantité acceptée par l'acheteur (kg)">
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input className="form-input" type="number" style={{flex:1}}
                  value={qtyAccepteeManuelle && formC.qty_acceptee!=='' ? formC.qty_acceptee : String(qtyAccCalc)}
                  onChange={e=>{ setFormC(f=>({...f,qty_acceptee:e.target.value})); setQtyAccepteeManuelle(true) }}
                  placeholder={String(qtyAccCalc)} />
                {qtyAccepteeManuelle && (
                  <button onClick={()=>{ setQtyAccepteeManuelle(false); setFormC(f=>({...f,qty_acceptee:''})) }}
                    className="btn-ghost" style={{padding:'7px 10px',fontSize:10,whiteSpace:'nowrap'}}>
                    ↺ Auto
                  </button>
                )}
              </div>
              {qtyAccEffective !== modalConfirm.quantity_kg && (
                <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#f5a623',marginTop:4}}>
                  ⚠ Rejet total : {(modalConfirm.quantity_kg - qtyAccEffective).toFixed(1)} kg
                </div>
              )}
            </FormGroup>

            {/* Prix */}
            <div className="section-label" style={{marginTop:8}}>PRIX STATION</div>
            <FormRow>
              <FormGroup label="Prix / kg *">
                <Input type="number" step="0.001" value={formC.price_per_kg}
                  onChange={e=>setFormC(f=>({...f,price_per_kg:e.target.value}))} placeholder="ex: 1.850" autoFocus />
              </FormGroup>
              <FormGroup label="">
                {formC.price_per_kg && Number(formC.price_per_kg)>0 && (
                  <div style={{padding:'9px 12px',background:'#00e87a18',border:'1px solid #00e87a40',borderRadius:7,fontFamily:'Rajdhani,sans-serif',fontSize:16,fontWeight:700,color:'#00e87a',height:36,display:'flex',alignItems:'center'}}>
                    CA : {caConfirm.toLocaleString('fr',{maximumFractionDigits:2})} {modalConfirm.markets?.currency||'MAD'}
                  </div>
                )}
              </FormGroup>
            </FormRow>

            {/* Période */}
            <div className="section-label" style={{marginTop:4}}>PÉRIODE</div>
            <FormRow>
              <FormGroup label="Début période"><Input type="date" value={formC.periode_debut} onChange={e=>setFormC(f=>({...f,periode_debut:e.target.value}))} /></FormGroup>
              <FormGroup label="Fin période"><Input type="date" value={formC.periode_fin} onChange={e=>setFormC(f=>({...f,periode_fin:e.target.value}))} /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Réf. station"><Input value={formC.station_ref} onChange={e=>setFormC(f=>({...f,station_ref:e.target.value}))} placeholder="ex: STAT-2026-W12" /></FormGroup>
              <FormGroup label="Date réception"><Input type="date" value={formC.receipt_date} onChange={e=>setFormC(f=>({...f,receipt_date:e.target.value}))} /></FormGroup>
            </FormRow>
            <ModalFooter onCancel={()=>setModalConfirm(null)} onSave={saveConfirm} loading={saving}
              disabled={!formC.price_per_kg||Number(formC.price_per_kg)<=0} saveLabel="CONFIRMER LE DISPATCH" />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE SAISIE PAR PÉRIODE ══ */}
      {modalPeriode && (
        <Modal title="SAISIE PAR PÉRIODE — PRIX STATION" onClose={()=>{setModalPeriode(false);setDone(false)}} size="lg">
          {done ? <SuccessMessage message={`${periodeSelIds.size} dispatch(s) confirmés sur la période !`} /> : (<>

            {/* Période + Réf */}
            <div className="section-label">DÉFINIR LA PÉRIODE</div>
            <FormRow>
              <FormGroup label="Début période *"><Input type="date" value={periodeDebut} onChange={e=>setPeriodeDebut(e.target.value)} /></FormGroup>
              <FormGroup label="Fin période *"><Input type="date" value={periodeFin} onChange={e=>setPeriodeFin(e.target.value)} /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Réf. station"><Input value={periodeRef} onChange={e=>setPeriodeRef(e.target.value)} placeholder="ex: STAT-2026-W12" /></FormGroup>
              <FormGroup label="Date réception"><Input type="date" value={periodeDate} onChange={e=>setPeriodeDate(e.target.value)} /></FormGroup>
            </FormRow>

            {/* Prix par marché */}
            {periodeDebut && periodeFin && marchesInPeriode.length>0 && (
              <>
                <div className="section-label" style={{marginTop:12}}>PRIX PAR MARCHÉ</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10,marginBottom:14}}>
                  {marchesInPeriode.map((m:any)=>(
                    <div key={m?.id||m?.name} style={{background:'#0d1f14',border:'1px solid #1a3526',borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:6}}>{(m?.name||'—').toUpperCase()} · {m?.currency}</div>
                      <input className="form-input" type="number" step="0.001"
                        value={marchePrix[m?.id||'']||''}
                        onChange={e=>setMarchePrix(p=>({...p,[m?.id||'']:e.target.value}))}
                        placeholder={`Prix en ${m?.currency}`}
                        style={{fontSize:13}} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Tableau dispatches */}
            {periodeDebut && periodeFin && (
              <>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <div className="section-label" style={{marginBottom:0}}>DISPATCHES DE LA PÉRIODE ({dispatchesPeriode.length})</div>
                  <button onClick={()=>setPeriodeSelIds(new Set(dispatchesPeriode.map((d:any)=>d.id)))} className="btn-secondary" style={{fontSize:9,padding:'4px 8px',marginLeft:'auto'}}>TOUT</button>
                  <button onClick={()=>setPeriodeSelIds(new Set())} className="btn-ghost" style={{fontSize:9,padding:'4px 8px'}}>AUCUN</button>
                  <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52'}}>{periodeSelIds.size}/{dispatchesPeriode.length}</span>
                </div>

                {dispatchesPeriode.length===0 ? (
                  <div style={{padding:'20px',textAlign:'center',fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',border:'1px dashed #1a3526',borderRadius:8}}>
                    Aucun dispatch sans prix dans cette période
                  </div>
                ) : (
                  <div style={{border:'1px solid #1a3526',borderRadius:8,overflow:'hidden',marginBottom:14}}>
                    {/* Header */}
                    <div style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 80px 80px 80px 90px 90px',gap:6,padding:'8px 12px',background:'#050d09',borderBottom:'1px solid #1a3526'}}>
                      {['','Dispatch / Marché','Date','Brut (kg)','Freinte%','Écart%','Accepté (kg)','CA estimé'].map((h,i)=>(
                        <div key={i} style={{fontFamily:'DM Mono,monospace',fontSize:8.5,color:'#3d6b52',letterSpacing:.8}}>{h}</div>
                      ))}
                    </div>
                    <div style={{maxHeight:340,overflowY:'auto'}}>
                      {dispatchesPeriode.map((d:any)=>{
                        const sel  = periodeSelIds.has(d.id)
                        const row  = periodeRows[d.id]||{freinte:'0',ecart:'0',qty_man:'',qty_calc:d.quantity_kg}
                        const qtyA = qtyEffForRow(d.id, d)
                        const prix = Number(marchePrix[d.market_id]||0)
                        const ca   = prix ? calcCA(qtyA, prix) : null
                        return (
                          <div key={d.id} style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 80px 80px 80px 90px 90px',gap:6,padding:'9px 12px',borderBottom:'1px solid #1a3526',alignItems:'center',background:sel?'#00e87a08':'transparent'}}>
                            {/* Checkbox */}
                            <div onClick={()=>togglePer(d.id)} style={{width:16,height:16,borderRadius:4,border:`1px solid ${sel?'#00e87a':'#1f4030'}`,background:sel?'#00e87a':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#030a07',fontWeight:700,cursor:'pointer',flexShrink:0}}>
                              {sel?'✓':''}
                            </div>
                            {/* Info */}
                            <div onClick={()=>togglePer(d.id)} style={{cursor:'pointer'}}>
                              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,fontWeight:600,color:'#e8f5ee'}}>{d.markets?.name||'—'}</div>
                              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',marginTop:1}}>{d.lot_number}</div>
                            </div>
                            {/* Date */}
                            <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{d.harvest_date}</div>
                            {/* Brut */}
                            <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#f5a623'}}>{d.quantity_kg}</div>
                            {/* Freinte% */}
                            <input className="form-input" type="number" step="0.1"
                              value={row.freinte} placeholder="0"
                              onChange={e=>updatePeriodeRow(d.id,'freinte',e.target.value)}
                              style={{padding:'4px 7px',fontSize:11}} />
                            {/* Écart% */}
                            <input className="form-input" type="number" step="0.1"
                              value={row.ecart} placeholder="0"
                              onChange={e=>updatePeriodeRow(d.id,'ecart',e.target.value)}
                              style={{padding:'4px 7px',fontSize:11}} />
                            {/* Accepté */}
                            <input className="form-input" type="number" step="0.01"
                              value={row.qty_man!=='' ? row.qty_man : String(row.qty_calc)}
                              onChange={e=>updatePeriodeRow(d.id,'qty_man',e.target.value)}
                              style={{padding:'4px 7px',fontSize:11,color:row.qty_man!==''?'#f5a623':'#7aab90'}} />
                            {/* CA */}
                            <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,fontWeight:600,color:ca?'#00e87a':'#1f4030'}}>
                              {ca ? ca.toLocaleString('fr',{maximumFractionDigits:2})+' '+d.markets?.currency : '—'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Totaux par marché */}
                    {Object.values(caParMarchePeriode).length>0 && (
                      <div style={{padding:'10px 14px',borderTop:'1px solid #1a3526',display:'flex',gap:20,flexWrap:'wrap'}}>
                        {Object.values(caParMarchePeriode).map((m:any,i:number)=>(
                          <div key={i} style={{fontFamily:'DM Mono,monospace',fontSize:10}}>
                            <span style={{color:'#3d6b52'}}>{m.nom} : </span>
                            <strong style={{color:'#00e87a'}}>{m.ca.toLocaleString('fr',{maximumFractionDigits:2})} {m.currency}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <ModalFooter onCancel={()=>setModalPeriode(false)} onSave={savePeriode} loading={saving}
              disabled={!periodeDebut||!periodeFin||periodeSelIds.size===0}
              saveLabel={`CONFIRMER ${periodeSelIds.size} DISPATCH(S)`} />
          </>)}
        </Modal>
      )}

      {/* ══ MODALE ALERTE ══ */}
      {modalAlerte && (
        <Modal title="JOURNÉE SANS RÉCOLTE" onClose={()=>{setModalAlerte(false);setDone(false)}}>
          {done ? <SuccessMessage message="Alerte enregistrée !" /> : (<>
            <div style={{padding:'10px 14px',background:'#ff4d6d18',border:'1px solid #ff4d6d40',borderRadius:7,fontFamily:'DM Mono,monospace',fontSize:11,color:'#ff4d6d',marginBottom:16}}>⚠ Cette journée sera marquée sans récolte.</div>
            <FormGroup label="Date *"><Input type="date" value={formAlerte.date} onChange={e=>setFormAlerte(f=>({...f,date:e.target.value}))} autoFocus /></FormGroup>
            <FormGroup label="Motif">
              <Select value={formAlerte.reason} onChange={e=>setFormAlerte(f=>({...f,reason:e.target.value}))}>
                {REASONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Notes"><Textarea rows={2} value={formAlerte.notes} onChange={e=>setFormAlerte(f=>({...f,notes:e.target.value}))} /></FormGroup>
            <ModalFooter onCancel={()=>setModalAlerte(false)} onSave={saveAlerte} loading={saving} disabled={!formAlerte.date} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}

      {/* ══ HEADER ══ */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div className="page-title">RÉCOLTES</div>
          <div className="page-sub">
            {harvests.length} lot(s) · {(totalKg/1000).toFixed(2)} t récoltées
            {totalCA>0 && <> · CA confirmé : <strong style={{color:'#00e87a'}}>{totalCA.toLocaleString('fr',{maximumFractionDigits:0})} MAD</strong></>}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-ghost" onClick={()=>setModalAlerte(true)} style={{fontSize:11,color:'#ff4d6d',borderColor:'#ff4d6d40'}}>⚠ SANS RÉCOLTE</button>
          <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>
        </div>
      </div>

      {/* ══ KPIs ══ */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:16}}>
        {[
          {l:'Lots',       v:String(harvests.length),              c:'#00e87a'},
          {l:'Récoltés',   v:(totalKg/1000).toFixed(1)+' t',      c:'#00ffc8'},
          {l:'Dispatches', v:String(dispatches.length),            c:'#00b4d8'},
          {l:'Sans prix',  v:String(sansPrix.length),              c:'#f5a623'},
          {l:'CA confirmé',v:(totalCA/1000).toFixed(1)+' k MAD',  c:'#9b5de5'},
          {l:'Alertes',    v:String(activAlertes.length),          c:'#ff4d6d'},
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c,fontSize:20,textShadow:`0 0 12px ${k.c}50`}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* CA par marché */}
      {Object.keys(caParMarche).length>0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10,marginBottom:16}}>
          {Object.values(caParMarche).map((m,i)=>(
            <div key={i} style={{background:'#0a1810',border:`1px solid ${m.sansPrix>0?'#f5a62340':'#1a3526'}`,borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:8.5,color:'#3d6b52',letterSpacing:1,marginBottom:5}}>{m.nom.toUpperCase()}</div>
              <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:20,fontWeight:700,color:m.ca>0?'#00e87a':'#3d6b52',marginBottom:2}}>
                {m.ca>0 ? m.ca.toLocaleString('fr',{maximumFractionDigits:0})+' '+m.currency : '—'}
              </div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#7aab90'}}>
                {m.qtyEnv.toLocaleString('fr')} kg env · {m.qtyAcc.toLocaleString('fr',{maximumFractionDigits:0})} kg acc
              </div>
              {m.sansPrix>0&&<div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#f5a623',marginTop:2}}>⚠ {m.sansPrix} sans prix</div>}
            </div>
          ))}
        </div>
      )}

      {/* ══ TABS ══ */}
      <div style={{display:'flex',gap:4,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
        {([['liste','RÉCOLTES',harvests.length],['sans_prix','SANS PRIX',sansPrix.length],['alertes','ALERTES',activAlertes.length]] as any[]).map(([t,l,c])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:'7px 14px',borderRadius:6,border:'1px solid',fontFamily:'DM Mono,monospace',fontSize:10,letterSpacing:.8,cursor:'pointer',transition:'all .15s',
              borderColor:tab===t?'#00e87a':'#1a3526',background:tab===t?'#00e87a18':'transparent',color:tab===t?'#00e87a':'#3d6b52'}}>
            {l}
            {c>0&&<span style={{marginLeft:6,background:t==='alertes'?'#ff4d6d':t==='sans_prix'?'#f5a623':'#00e87a',color:'#030a07',borderRadius:10,padding:'1px 6px',fontSize:8,fontWeight:700}}>{c}</span>}
          </button>
        ))}
        {tab==='sans_prix' && sansPrix.length>0 && (
          <div style={{marginLeft:'auto',display:'flex',gap:8}}>
            <button className="btn-ghost" style={{fontSize:10,padding:'7px 12px',color:'#00ffc8',borderColor:'#00ffc840'}} onClick={openPeriode}>
              📅 SAISIE PAR PÉRIODE
            </button>
          </div>
        )}
      </div>

      {/* ══ CONTENU ══ */}
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>

      ) : tab==='liste' ? (
        harvests.length===0 ? (
          <div className="empty-state">
            <div className="empty-icon">◉</div>
            <div className="empty-title">Aucune récolte saisie</div>
            <button className="btn-primary" onClick={()=>setModalNew(true)}>+ SAISIR RÉCOLTE</button>
          </div>
        ) : (
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table className="tbl">
                <thead><tr>
                  {['N° Lot','Date','Serre','Variété','Quantité','Invendus','Marchés','Freinte/Écart','CA confirmé','Statut','Actions'].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {harvests.map(h=>{
                    const hDisps   = dispatches.filter(d=>d.harvest_id===h.id)
                    const hCA      = hDisps.reduce((s,d)=>s+getCA(d),0)
                    const hMarchés = [...new Set(hDisps.map(d=>d.markets?.name).filter(Boolean))]
                    const hSansP   = hDisps.filter(d=>!d.certificate_number).length
                    const statut   = harvestStatut(h, dispatches)
                    const st       = statutStyle(statut)
                    const inv      = invendus(h)
                    // Freinte/écart moyens affichés
                    const confDisps = hDisps.filter(d=>d.certificate_number)
                    const avgFreinte = confDisps.length ? confDisps.reduce((s,d)=>s+(parseMeta(d.notes).freinte_pct||0),0)/confDisps.length : null
                    const avgEcart   = confDisps.length ? confDisps.reduce((s,d)=>s+(parseMeta(d.notes).ecart_pct||0),0)/confDisps.length : null
                    return (
                      <tr key={h.id}>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{h.lot_number}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{h.harvest_date}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{h.campaign_plantings?.greenhouses?.name||'—'}</span></td>
                        <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{h.campaign_plantings?.varieties?.commercial_name||'—'}</span></td>
                        <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#00e87a'}}>{(h.total_qty||0).toLocaleString('fr')} kg</span></td>
                        <td>{inv>0 ? <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623'}}>{inv.toLocaleString('fr')} kg</span> : <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#00e87a'}}>—</span>}</td>
                        <td style={{minWidth:90}}>
                          {hMarchés.length>0
                            ? <div style={{display:'flex',flexWrap:'wrap',gap:3}}>{hMarchés.map(m=><span key={m} className="tag tag-blue" style={{fontSize:8}}>{m}</span>)}</div>
                            : <span style={{color:'#1f4030',fontFamily:'DM Mono,monospace',fontSize:9}}>—</span>}
                        </td>
                        <td>
                          {avgFreinte!==null
                            ? <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#7aab90'}}>
                                F:{avgFreinte.toFixed(1)}% E:{(avgEcart||0).toFixed(1)}%
                              </span>
                            : <span style={{color:'#1f4030',fontFamily:'DM Mono,monospace',fontSize:9}}>—</span>}
                        </td>
                        <td>
                          {hCA>0
                            ? <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#9b5de5'}}>{hCA.toLocaleString('fr',{maximumFractionDigits:0})} MAD</span>
                            : hSansP>0
                              ? <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#f5a623'}}>⏳ {hSansP} att.</span>
                              : <span style={{color:'#1f4030',fontFamily:'DM Mono,monospace',fontSize:9}}>—</span>}
                        </td>
                        <td><span className="tag" style={{...st,fontSize:8}}>{statut}</span></td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={()=>openDispatch(h)} className="btn-secondary" style={{padding:'4px 7px',fontSize:9}} title="Dispatcher">📦</button>
                            <button onClick={()=>openEdit(h)} className="btn-ghost" style={{padding:'4px 7px',fontSize:10}} title="Modifier">✏️</button>
                            <button onClick={()=>deleteRecolte(h.id,h.lot_number)} className="btn-danger" style={{padding:'4px 7px',fontSize:10}} title="Supprimer">🗑</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )

      ) : tab==='sans_prix' ? (
        sansPrix.length===0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-title">Tous les dispatches sont confirmés !</div>
          </div>
        ) : (
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'10px 16px',borderBottom:'1px solid #1a3526',display:'flex',alignItems:'center',gap:12,background:'#f5a62308'}}>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#f5a623'}}>⚠ {sansPrix.length} DISPATCH(S) EN ATTENTE</span>
              <div style={{marginLeft:'auto',display:'flex',gap:8}}>
                <button className="btn-ghost" style={{fontSize:10,padding:'6px 12px',color:'#00ffc8',borderColor:'#00ffc840'}} onClick={openPeriode}>📅 PAR PÉRIODE</button>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="tbl">
                <thead><tr>
                  {['Dispatch','Marché','Date récolte','Qté envoyée','Action'].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {sansPrix.map(d=>(
                    <tr key={d.id}>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e87a'}}>{d.lot_number}</span></td>
                      <td>
                        <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{d.markets?.name||'—'}</span>
                        <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',marginLeft:5}}>{d.markets?.currency}</span>
                      </td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{d.harvest_date}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#f5a623'}}>{d.quantity_kg?.toLocaleString('fr')} kg</span></td>
                      <td>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={()=>openConfirm(d)} className="btn-primary" style={{fontSize:10,padding:'5px 10px'}}>⚡ CONFIRMER</button>
                          <button onClick={async()=>{if(!confirm('Supprimer ?'))return;await supabase.from('harvest_lots').delete().eq('id',d.id);setDispatches(p=>p.filter(x=>x.id!==d.id))}} className="btn-danger" style={{padding:'5px 8px',fontSize:10}}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )

      ) : (
        <div>
          {activAlertes.length>0 && (
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
              {activAlertes.map(a=>(
                <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'#ff4d6d12',border:'1px solid #ff4d6d30',borderRadius:8}}>
                  <span style={{fontSize:18,flexShrink:0}}>⚠</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#ff4d6d'}}>{a.title}</div>
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90',marginTop:2}}>{a.message}</div>
                  </div>
                  <button onClick={()=>resolveAlerte(a.id)} className="btn-ghost" style={{fontSize:10,padding:'5px 10px',color:'#00e87a',borderColor:'#00e87a40',flexShrink:0}}>✓ RÉSOUDRE</button>
                </div>
              ))}
            </div>
          )}
          {alertes.filter(a=>a.is_resolved).length>0 && (
            <div style={{display:'flex',flexDirection:'column',gap:5}}>
              {alertes.filter(a=>a.is_resolved).map(a=>(
                <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 16px',background:'#0a1810',border:'1px solid #1a3526',borderRadius:8,opacity:.6}}>
                  <span style={{fontSize:12,color:'#00e87a'}}>✓</span>
                  <div style={{flex:1}}><div style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#7aab90'}}>{a.title}</div><div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52'}}>{a.message}</div></div>
                  <span className="tag tag-green" style={{fontSize:8}}>RÉSOLU</span>
                </div>
              ))}
            </div>
          )}
          {alertes.length===0 && (
            <div className="empty-state">
              <div className="empty-icon">✅</div>
              <div className="empty-title">Aucune alerte</div>
              <button className="btn-ghost" onClick={()=>setModalAlerte(true)} style={{color:'#ff4d6d',borderColor:'#ff4d6d40',fontSize:11}}>⚠ SIGNALER UNE JOURNÉE SANS RÉCOLTE</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
