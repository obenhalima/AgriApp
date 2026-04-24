// Cible d'import : Récoltes (harvests) avec flux COMPLET :
//   Récolte → Dispatch (station_dispatch) → Confirmation prix
// Reproduit la validation de la saisie manuelle (app/recoltes/page.tsx).
//
// Structure : 1 ligne Excel = 1 dispatch (ou 1 récolte sans dispatch).
// Les lignes avec même (campagne + serre + variété + date) sont REGROUPÉES en 1 récolte.
// Les champs dispatch + confirmation sont optionnels par bloc.

import { supabase } from '@/lib/supabase'
import { ImportTarget, FieldDef, RowIssue, ResolutionContext, CommitReport } from '../types'
import { buildTemplate } from '../templateBuilder'

const FIELDS: FieldDef[] = [
  // ─── Identification de la récolte ─────────────────────
  { key: 'code_campagne', label: 'Campagne', type: 'string', required: true,
    aliases: ['campagne', 'campaign'], resolverKey: 'campaigns',
    help: 'Code de la campagne. La ferme est déduite automatiquement.' },
  { key: 'code_serre', label: 'Serre', type: 'string', required: true,
    aliases: ['serre', 'greenhouse'], resolverKey: 'greenhouses',
    help: 'Code de la serre (doit appartenir à la ferme de la campagne).' },
  { key: 'code_variete', label: 'Variété', type: 'string', required: true,
    aliases: ['variete', 'variety'], resolverKey: 'varieties',
    help: 'Code de la variété (planting campagne+serre+variété doit exister).' },
  { key: 'date_recolte', label: 'Date récolte', type: 'date', required: true,
    aliases: ['harvest_date', 'date_harvest', 'date'],
    help: 'Date de la récolte (AAAA-MM-JJ).' },
  { key: 'qty_recolte_kg', label: 'Qté récolte (kg)', type: 'number', required: true,
    aliases: ['total_qty', 'qty', 'quantite', 'qty_kg'], min: 0.01,
    help: 'Quantité totale récoltée (en kg). IDENTIQUE sur toutes les lignes d\'une même récolte.' },
  { key: 'lot_reference', label: 'Lot (référence)', type: 'string', required: false,
    aliases: ['lot_number', 'lot'],
    help: 'Votre référence de lot (optionnel). Sinon généré automatiquement.' },

  // ─── Dispatch vers un marché (optionnel) ───────────────
  { key: 'code_marche', label: 'Marché', type: 'string', required: false,
    aliases: ['marche', 'market', 'market_code'], resolverKey: 'markets',
    help: 'Laissez vide pour récolte sans dispatch.' },
  { key: 'qty_dispatch_kg', label: 'Qté dispatch (kg)', type: 'number', required: false,
    aliases: ['quantity_kg', 'qty_dispatched', 'qty_market'], min: 0.01,
    help: 'Quantité envoyée sur ce marché (requis si marché renseigné).' },

  // ─── Confirmation avec prix (optionnel) ────────────────
  { key: 'freinte_pct', label: 'Freinte (%)', type: 'number', required: false,
    aliases: ['freinte'], min: 0, max: 100, defaultValue: 0,
    help: 'Pourcentage de freinte (déchet au tri). Défaut : 0.' },
  { key: 'ecart_pct', label: 'Écart (%)', type: 'number', required: false,
    aliases: ['ecart'], min: 0, max: 100, defaultValue: 0,
    help: 'Pourcentage d\'écart supplémentaire. Défaut : 0.' },
  { key: 'qty_acceptee', label: 'Qté acceptée (kg)', type: 'number', required: false,
    aliases: ['qty_accepted', 'qty_acceptee_manuelle'], min: 0,
    help: 'Qté acceptée par la station (override du calcul auto). Laissez vide pour calcul automatique.' },
  { key: 'prix_kg', label: 'Prix (/kg)', type: 'number', required: false,
    aliases: ['price_per_kg', 'prix'], min: 0.01,
    help: 'Prix au kg. Si rempli → dispatch confirmé (tous les champs ci-dessous deviennent requis).' },
  { key: 'periode_debut', label: 'Période début', type: 'date', required: false,
    aliases: ['period_start'],
    help: 'Début de période de confirmation (requis si prix renseigné).' },
  { key: 'periode_fin', label: 'Période fin', type: 'date', required: false,
    aliases: ['period_end'],
    help: 'Fin de période de confirmation (requis si prix renseigné).' },
  { key: 'station_ref', label: 'Réf. station', type: 'string', required: false,
    aliases: ['station_reference'],
    help: 'Référence bordereau station (requis si prix renseigné).' },
  { key: 'receipt_date', label: 'Date réception', type: 'date', required: false,
    aliases: ['date_reception'],
    help: 'Date de réception à la station (optionnel).' },

  // ─── Notes ─────────────────────────────────────────────
  { key: 'notes_recolte', label: 'Notes', type: 'string', required: false,
    aliases: ['notes', 'commentaire'],
    help: 'Notes libres sur la récolte (optionnel).' },
]

export const harvestsTarget: ImportTarget = {
  key: 'harvests',
  label: 'Récoltes',
  icon: '🌿',
  description: 'Importer des récoltes avec dispatches et confirmations de prix (flux complet).',
  instructions: [
    "Chaque ligne = 1 dispatch (ou 1 récolte sans dispatch si marché vide).",
    "Les lignes avec même (campagne + serre + variété + date) sont REGROUPÉES en 1 récolte.",
    "Qté récolte doit être IDENTIQUE sur toutes les lignes d'une même récolte.",
    "Somme des qty_dispatch_kg ≤ qty_recolte_kg (un reste non dispatché est autorisé).",
    "Si 'prix_kg' est renseigné : le dispatch est confirmé (champs période + station requis).",
  ],
  sheetName: 'Recoltes',
  fields: FIELDS,
  resolvers: [
    {
      key: 'campaigns', label: 'Campagne',
      load: async () => {
        const { data } = await supabase.from('campaigns').select('id, code, name, farm_id')
        const m = new Map<string, any>()
        ;(data ?? []).forEach((c: any) => m.set(String(c.code).toUpperCase(), c))
        return m
      },
    },
    {
      key: 'farms', label: 'Ferme',
      load: async () => {
        const { data } = await supabase.from('farms').select('id, code, name').eq('is_active', true)
        const m = new Map<string, any>()
        ;(data ?? []).forEach((f: any) => m.set(String(f.code).toUpperCase(), f))
        return m
      },
    },
    {
      key: 'greenhouses', label: 'Serre',
      load: async () => {
        const { data } = await supabase.from('greenhouses').select('id, code, name, farm_id')
        const m = new Map<string, any>()
        ;(data ?? []).forEach((g: any) => m.set(String(g.code).toUpperCase(), g))
        return m
      },
    },
    {
      key: 'varieties', label: 'Variété',
      load: async () => {
        const { data, error } = await supabase.from('varieties').select('id, code, commercial_name')
        if (error) { console.error('[varieties] error:', error); throw new Error(`varieties: ${error.message}`) }
        const m = new Map<string, any>()
        ;(data ?? []).forEach((v: any) => m.set(String(v.code).toUpperCase(), v))
        return m
      },
    },
    {
      key: 'markets', label: 'Marché',
      load: async () => {
        const { data, error } = await supabase.from('markets').select('id, code, name, currency, type').eq('is_active', true)
        if (error) { console.error('[markets] error:', error); throw new Error(`markets: ${error.message}`) }
        const m = new Map<string, any>()
        ;(data ?? []).forEach((mk: any) => m.set(String(mk.code).toUpperCase(), mk))
        return m
      },
    },
    {
      key: 'plantings', label: 'Plantation',
      load: async () => {
        const { data, error } = await supabase.from('campaign_plantings')
          .select('id, campaign_id, greenhouse_id, variety_id, planted_area')
        if (error) { console.error('[campaign_plantings] error:', error); throw new Error(`campaign_plantings: ${error.message}`) }
        const m = new Map<string, any>()
        ;(data ?? []).forEach((p: any) =>
          m.set(`${p.campaign_id}|${p.greenhouse_id}|${p.variety_id}`, p))
        return m
      },
    },
  ],

  validateRow: (raw: Record<string, any>, ctx: ResolutionContext) => {
    const issues: RowIssue[] = []

    // ─── Résolution des FK ───────────────────────────────
    const campCode = String(raw.code_campagne ?? '').toUpperCase()
    const campaign = ctx.resolvers.campaigns.get(campCode)
    if (!campaign) issues.push({ rowIndex: 0, field: 'code_campagne', severity: 'error', message: `Campagne inconnue : "${raw.code_campagne}"` })

    const ghCode = String(raw.code_serre ?? '').toUpperCase()
    const greenhouse = ctx.resolvers.greenhouses.get(ghCode)
    if (!greenhouse) issues.push({ rowIndex: 0, field: 'code_serre', severity: 'error', message: `Serre inconnue : "${raw.code_serre}"` })

    const varCode = String(raw.code_variete ?? '').toUpperCase()
    const variety = ctx.resolvers.varieties.get(varCode)
    if (!variety) issues.push({ rowIndex: 0, field: 'code_variete', severity: 'error', message: `Variété inconnue : "${raw.code_variete}"` })

    // Pas de contrôle ferme/campagne : une campagne peut couvrir plusieurs fermes.
    // La vraie contrainte est l'existence de la plantation (check plus bas).

    // Résolution plantation via clé composite
    let planting: any = null
    if (campaign && greenhouse && variety) {
      const key = `${campaign.id}|${greenhouse.id}|${variety.id}`
      planting = ctx.resolvers.plantings.get(key)
      if (!planting) {
        issues.push({ rowIndex: 0, field: 'code_variete', severity: 'error',
          message: `Aucune plantation existante pour (${raw.code_campagne} + ${raw.code_serre} + ${raw.code_variete})` })
      }
    }

    // ─── Dispatch (optionnel mais cohérent) ─────────────
    let market: any = null
    const hasDispatch = !!raw.code_marche
    if (hasDispatch) {
      const mkCode = String(raw.code_marche).toUpperCase()
      market = ctx.resolvers.markets.get(mkCode)
      if (!market) {
        issues.push({ rowIndex: 0, field: 'code_marche', severity: 'error', message: `Marché inconnu : "${raw.code_marche}"` })
      }
      const qd = Number(raw.qty_dispatch_kg) || 0
      if (qd <= 0) {
        issues.push({ rowIndex: 0, field: 'qty_dispatch_kg', severity: 'error',
          message: `Qté dispatch requise (> 0) quand un marché est renseigné` })
      }
    } else if (raw.qty_dispatch_kg) {
      issues.push({ rowIndex: 0, field: 'qty_dispatch_kg', severity: 'warning',
        message: `Qté dispatch renseignée sans marché — sera ignorée` })
    }

    // ─── Confirmation prix (optionnel mais cohérent) ────
    const hasPrice = raw.prix_kg !== null && raw.prix_kg !== undefined && raw.prix_kg !== ''
    if (hasPrice) {
      if (!hasDispatch) {
        issues.push({ rowIndex: 0, field: 'prix_kg', severity: 'error',
          message: `Prix renseigné sans marché — ajoutez code_marche + qty_dispatch_kg` })
      }
      const price = Number(raw.prix_kg) || 0
      if (price <= 0) {
        issues.push({ rowIndex: 0, field: 'prix_kg', severity: 'error', message: `Prix doit être > 0` })
      }
      if (!raw.periode_debut) issues.push({ rowIndex: 0, field: 'periode_debut', severity: 'error', message: `Période début requise si prix renseigné` })
      if (!raw.periode_fin)   issues.push({ rowIndex: 0, field: 'periode_fin',   severity: 'error', message: `Période fin requise si prix renseigné` })
      if (!raw.station_ref)   issues.push({ rowIndex: 0, field: 'station_ref',   severity: 'error', message: `Réf. station requise si prix renseigné` })
      if (raw.periode_debut && raw.periode_fin && String(raw.periode_debut) > String(raw.periode_fin)) {
        issues.push({ rowIndex: 0, field: 'periode_fin', severity: 'error', message: `Période fin < début` })
      }
    }

    // Qty récolte
    const qtyR = Number(raw.qty_recolte_kg) || 0
    if (qtyR <= 0) {
      issues.push({ rowIndex: 0, field: 'qty_recolte_kg', severity: 'error', message: `Quantité récoltée doit être > 0` })
    }

    // freinte + ecart doivent être ≤ 100
    const fr = Number(raw.freinte_pct) || 0
    const ec = Number(raw.ecart_pct) || 0
    if (fr + ec >= 100) {
      issues.push({ rowIndex: 0, field: 'freinte_pct', severity: 'error', message: `Freinte + écart ≥ 100% (laisserait 0 kg accepté)` })
    }

    const hasErr = issues.some(i => i.severity === 'error')
    return {
      resolved: hasErr ? null : {
        _row: 0,
        // Regroupement
        group_key: `${campaign.id}|${greenhouse.id}|${variety.id}|${raw.date_recolte}`,
        // Récolte
        campaign_planting_id: planting.id,
        harvest_date: raw.date_recolte,
        qty_recolte_kg: qtyR,
        lot_reference: raw.lot_reference ?? null,
        notes_recolte: raw.notes_recolte ?? null,
        planting_variety_id: variety.id,
        planting_greenhouse_id: greenhouse.id,
        // Dispatch
        has_dispatch: hasDispatch,
        market_id: market?.id ?? null,
        qty_dispatch_kg: hasDispatch ? Number(raw.qty_dispatch_kg) : 0,
        // Confirmation
        has_price: hasPrice,
        freinte_pct: fr,
        ecart_pct: ec,
        qty_acceptee_manuelle: raw.qty_acceptee !== null && raw.qty_acceptee !== undefined && raw.qty_acceptee !== ''
          ? Number(raw.qty_acceptee) : null,
        prix_kg: hasPrice ? Number(raw.prix_kg) : null,
        periode_debut: raw.periode_debut ?? null,
        periode_fin: raw.periode_fin ?? null,
        station_ref: raw.station_ref ?? null,
        receipt_date: raw.receipt_date ?? null,
      },
      issues,
    }
  },

  // Groupage : les lignes avec même group_key vont créer 1 seule récolte
  // + N dispatches. Validation de cohérence inter-lignes.
  groupBeforeCommit: (rows: any[]) => {
    const groups = new Map<string, any[]>()
    for (const r of rows) {
      const arr = groups.get(r.group_key) ?? []
      arr.push(r); groups.set(r.group_key, arr)
    }
    // Retourne un tableau de "groupes" — chaque groupe sera traité comme 1 harvest
    return Array.from(groups.values())
  },

  commit: async (groups: any[][]): Promise<CommitReport> => {
    let harvestsCreated = 0
    let dispatchesCreated = 0
    let confirmedCount = 0
    const errors: { rowIndex: number; message: string }[] = []

    for (const group of groups) {
      const first = group[0]

      // Vérifier cohérence intra-groupe : qty_recolte doit être identique
      const qtyR0 = first.qty_recolte_kg
      const inconsistent = group.find(r => Math.abs(r.qty_recolte_kg - qtyR0) > 0.01)
      if (inconsistent) {
        errors.push({ rowIndex: inconsistent._row ?? 0,
          message: `Qté récolte incohérente dans le groupe (${inconsistent.qty_recolte_kg} vs ${qtyR0})` })
        continue
      }
      // Somme dispatch ≤ qté récolte
      const totalDispatch = group.filter(r => r.has_dispatch).reduce((s, r) => s + r.qty_dispatch_kg, 0)
      if (totalDispatch > qtyR0 + 0.01) {
        errors.push({ rowIndex: first._row ?? 0,
          message: `Somme dispatches (${totalDispatch} kg) > qté récolte (${qtyR0} kg)` })
        continue
      }

      try {
        // 1. Créer la récolte
        const lotHeader = first.lot_reference
          || `LOT-${String(first.harvest_date).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
        const { data: harvest, error: hErr } = await supabase.from('harvests').insert({
          campaign_planting_id: first.campaign_planting_id,
          harvest_date: first.harvest_date,
          qty_category_1: qtyR0,
          qty_category_2: 0,
          qty_category_3: 0,
          qty_waste: 0,
          lot_number: lotHeader,
          notes: first.notes_recolte ?? null,
        }).select('id').single()
        if (hErr) throw hErr
        harvestsCreated++

        // 2. Créer les dispatches (lignes avec has_dispatch)
        const dispatchRows = group.filter(r => r.has_dispatch)
        const ts = String(Date.now())
        for (let i = 0; i < dispatchRows.length; i++) {
          const d = dispatchRows[i]
          const dispLot = `D${i}-${ts.slice(-8)}`.slice(0, 50)
          const { data: lot, error: dErr } = await supabase.from('harvest_lots').insert({
            lot_number: dispLot,
            harvest_id: harvest!.id,
            campaign_planting_id: d.campaign_planting_id,
            harvest_date: d.harvest_date,
            quantity_kg: d.qty_dispatch_kg,
            category: 'station_dispatch',
            variety_id: d.planting_variety_id,
            greenhouse_id: d.planting_greenhouse_id,
            market_id: d.market_id,
            certificate_number: null,
            storage_temp: null,
            notes: null,
          }).select('id').single()
          if (dErr) throw dErr
          dispatchesCreated++

          // 3. Confirmation prix le cas échéant
          if (d.has_price) {
            const qtyB = d.qty_dispatch_kg
            const qtyN = Math.round(qtyB * (1 - d.freinte_pct / 100) * 100) / 100
            const qtyA_calc = Math.round(qtyN * (1 - d.ecart_pct / 100) * 100) / 100
            const qtyA = (d.qty_acceptee_manuelle !== null && d.qty_acceptee_manuelle >= 0)
              ? d.qty_acceptee_manuelle : qtyA_calc
            const ca = Math.round(qtyA * d.prix_kg * 100) / 100
            const meta = JSON.stringify({
              price_per_kg: d.prix_kg,
              freinte_pct: d.freinte_pct,
              ecart_pct: d.ecart_pct,
              qty_brute: qtyB,
              qty_nette: qtyN,
              qty_acceptee: qtyA,
              ca_amount: ca,
              periode_debut: d.periode_debut,
              periode_fin: d.periode_fin,
              station_ref: d.station_ref,
              receipt_date: d.receipt_date ?? null,
              price_set_at: new Date().toISOString(),
            })
            const { error: cErr } = await supabase.from('harvest_lots').update({
              certificate_number: String(qtyA),
              notes: meta,
            }).eq('id', lot!.id)
            if (cErr) throw cErr
            confirmedCount++
          }
        }
      } catch (e: any) {
        errors.push({ rowIndex: first._row ?? 0, message: e.message })
      }
    }

    return {
      inserted: harvestsCreated,
      extra: {
        harvests: harvestsCreated,
        dispatches: dispatchesCreated,
        confirmed_with_price: confirmedCount,
      },
      errors,
    }
  },

  buildTemplate: async (): Promise<Blob> => {
    const [campsRes, farmsRes, ghsRes, varsRes, marketsRes, plantingsRes] = await Promise.all([
      supabase.from('campaigns').select('code, name, planting_start, harvest_end, farms(code, name)').order('planting_start', { ascending: false }),
      supabase.from('farms').select('code, name').eq('is_active', true).order('name'),
      supabase.from('greenhouses').select('code, name, farms(code, name)').order('code'),
      supabase.from('varieties').select('code, commercial_name, type').order('commercial_name'),
      supabase.from('markets').select('code, name, type, currency').eq('is_active', true).order('name'),
      supabase.from('campaign_plantings')
        .select('planting_date, planted_area, campaigns(code, name), greenhouses(code, name, farms(code)), varieties(code, commercial_name)')
        .order('planting_date', { ascending: false })
        .limit(500),
    ])
    const camps = campsRes.data ?? []
    const farms = farmsRes.data ?? []
    const ghs = ghsRes.data ?? []
    const vars_ = varsRes.data ?? []
    const markets = marketsRes.data ?? []
    const plantings = plantingsRes.data ?? []

    const campRows = camps.map((c: any) => [c.code, c.name, c.planting_start, c.harvest_end, c.farms?.code ?? ''])
    const farmRows = farms.map((f: any) => [f.code, f.name])
    const ghRows = ghs.map((g: any) => [g.code, g.name, g.farms?.code ?? '', g.farms?.name ?? ''])
    const varRows = vars_.map((v: any) => [v.code, v.commercial_name, v.type])
    const marketRows = markets.map((m: any) => [m.code, m.name, m.type ?? '', m.currency ?? 'MAD'])
    const plantingRows = plantings.map((p: any) => [
      p.campaigns?.code ?? '', p.greenhouses?.farms?.code ?? '', p.greenhouses?.code ?? '',
      p.varieties?.code ?? '', p.varieties?.commercial_name ?? '',
      p.planting_date ?? '', p.planted_area ?? 0,
    ])

    const nb = {
      camp: Math.max(campRows.length, 1),
      farm: Math.max(farmRows.length, 1),
      gh: Math.max(ghRows.length, 1),
      var: Math.max(varRows.length, 1),
      mk: Math.max(marketRows.length, 1),
    }

    // Exemple : une ligne sur la 1re plantation disponible
    const p0: any = plantings[0] ?? {}
    const example = plantings.length > 0 && markets.length > 0 ? [[
      p0.campaigns?.code ?? '',
      p0.greenhouses?.code ?? '',
      p0.varieties?.code ?? '',
      new Date().toISOString().slice(0, 10), 1500, '', markets[0].code, 1500,
      0, 0, '', '', '', '', '', '', 'Exemple — à supprimer',
    ]] : []

    return await buildTemplate({
      title: 'Template Import Récoltes — FramPilot',
      author: 'FramPilot',
      instructions: {
        title: '🌿 Import des récoltes — Guide',
        lines: [
          "Ce template permet d'importer des récoltes avec flux complet : Récolte → Dispatch → Confirmation prix.",
          '',
          '📋 Structure : 1 ligne = 1 dispatch (ou 1 récolte seule si marché vide).',
          '     Les lignes avec même (campagne + serre + variété + date) sont regroupées en 1 récolte.',
          '',
          '🔹 Colonnes OBLIGATOIRES (toujours) :',
          '     code_campagne, code_serre, code_variete, date_recolte, qty_recolte_kg',
          '     (la ferme est déduite automatiquement de la campagne)',
          '',
          '🔹 Colonnes DISPATCH (optionnelles mais groupées) :',
          '     code_marche + qty_dispatch_kg — remplir les deux ou aucun.',
          '     Si vide → récolte créée sans dispatch (reste à dispatcher plus tard).',
          '',
          '🔹 Colonnes CONFIRMATION PRIX (optionnelles mais groupées) :',
          '     prix_kg + periode_debut + periode_fin + station_ref — tous requis si l\'un est rempli.',
          '     freinte_pct et ecart_pct : défaut 0.',
          '     qty_acceptee : override du calcul automatique (qty_dispatch × (1-freinte%) × (1-ecart%)).',
          '',
          '✅ Contrôles Excel (bloquants à la saisie) :',
          '     • dropdowns pour tous les codes (campagne, ferme, serre, variété, marché)',
          '     • dates au format valide',
          "     • quantités > 0, pourcentages entre 0 et 100",
          '',
          '✅ Contrôles serveur (à l\'import) :',
          "     • Plantation existe (campagne + serre + variété)",
          "     • Cohérence campagne/ferme et serre/ferme",
          "     • Qté récolte IDENTIQUE sur toutes les lignes d'une même récolte",
          "     • Somme(qty_dispatch_kg) ≤ qty_recolte_kg",
          "     • Freinte + écart < 100%",
          "     • Si prix renseigné : période début + fin + station_ref requis",
          '',
          '💡 Consultez l\'onglet "Plantations" pour voir les combinaisons valides (campagne + ferme + serre + variété).',
        ],
      },
      referenceSheets: [
        { name: 'Campagnes', headers: ['code_campagne', 'nom', 'debut_plantation', 'fin_recolte', 'code_ferme'], rows: campRows, protected: true },
        { name: 'Fermes', headers: ['code_ferme', 'nom'], rows: farmRows, protected: true },
        { name: 'Serres', headers: ['code_serre', 'nom', 'code_ferme', 'nom_ferme'], rows: ghRows, protected: true },
        { name: 'Varietes', headers: ['code_variete', 'nom_commercial', 'type'], rows: varRows, protected: true },
        { name: 'Marches', headers: ['code_marche', 'nom', 'type', 'devise'], rows: marketRows, protected: true },
        { name: 'Plantations', headers: ['code_campagne', 'code_ferme', 'code_serre', 'code_variete', 'nom_variete', 'date_plantation', 'surface_m2'], rows: plantingRows, protected: true },
      ],
      targetSheet: {
        name: 'Recoltes',
        dataRowsCount: 1000,
        examples: example,
        columns: [
          // Identification
          { header: 'code_campagne', width: 18, required: true,
            note: 'Code campagne. La ferme est déduite automatiquement.',
            validation: { type: 'list', rangeRef: `Campagnes!$A$2:$A$${nb.camp + 1}`, prompt: 'Choisir une campagne', error: 'Campagne inconnue.' } },
          { header: 'code_serre', width: 14, required: true,
            note: 'Code serre. Doit appartenir à la ferme de la campagne.',
            validation: { type: 'list', rangeRef: `Serres!$A$2:$A$${nb.gh + 1}`, prompt: 'Choisir une serre', error: 'Serre inconnue.' } },
          { header: 'code_variete', width: 14, required: true,
            note: 'Code variété. Une plantation doit exister pour (campagne + serre + variété).',
            validation: { type: 'list', rangeRef: `Varietes!$A$2:$A$${nb.var + 1}`, prompt: 'Choisir une variété', error: 'Variété inconnue.' } },
          { header: 'date_recolte', width: 14, required: true, numFmt: 'yyyy-mm-dd',
            note: 'Date de la récolte.',
            validation: { type: 'date', min: '2020-01-01', max: '2100-12-31', error: 'Date invalide.' } },
          { header: 'qty_recolte_kg', width: 14, required: true, numFmt: '#,##0.00',
            note: 'Quantité totale récoltée (kg). IDENTIQUE sur toutes les lignes d\'une même récolte.',
            validation: { type: 'decimal', min: 0.01, error: 'Quantité > 0.' } },
          { header: 'lot_reference', width: 16, required: false,
            note: 'Votre référence lot (optionnel). Sinon auto-généré.' },
          // Dispatch
          { header: 'code_marche', width: 14, required: false, headerBg: '7C3AED',
            note: 'Code marché. Laissez vide pour récolte sans dispatch.',
            validation: { type: 'list', rangeRef: `Marches!$A$2:$A$${nb.mk + 1}`, allowBlank: true, prompt: 'Optionnel', error: 'Marché inconnu.' } },
          { header: 'qty_dispatch_kg', width: 14, required: false, numFmt: '#,##0.00', headerBg: '7C3AED',
            note: 'Qté envoyée au marché. Requis si code_marche rempli.',
            validation: { type: 'decimal', min: 0.01, allowBlank: true, error: 'Quantité > 0.' } },
          // Confirmation
          { header: 'freinte_pct', width: 11, required: false, numFmt: '0.0', headerBg: '059669',
            note: 'Pourcentage de freinte (0 à 100). Défaut : 0.',
            validation: { type: 'decimal', min: 0, max: 100, allowBlank: true, error: 'Entre 0 et 100.' } },
          { header: 'ecart_pct', width: 11, required: false, numFmt: '0.0', headerBg: '059669',
            note: 'Pourcentage d\'écart (0 à 100). Défaut : 0.',
            validation: { type: 'decimal', min: 0, max: 100, allowBlank: true, error: 'Entre 0 et 100.' } },
          { header: 'qty_acceptee', width: 13, required: false, numFmt: '#,##0.00', headerBg: '059669',
            note: 'Qté acceptée station (override calcul auto). Optionnel.',
            validation: { type: 'decimal', min: 0, allowBlank: true, error: '≥ 0.' } },
          { header: 'prix_kg', width: 11, required: false, numFmt: '#,##0.0000', headerBg: 'DC2626',
            note: 'Prix par kg. Si rempli : les champs periode + station deviennent requis.',
            validation: { type: 'decimal', min: 0.0001, allowBlank: true, error: '> 0.' } },
          { header: 'periode_debut', width: 14, required: false, numFmt: 'yyyy-mm-dd', headerBg: 'DC2626',
            note: 'Début période. Requis si prix_kg renseigné.',
            validation: { type: 'date', min: '2020-01-01', max: '2100-12-31', allowBlank: true, error: 'Date invalide.' } },
          { header: 'periode_fin', width: 14, required: false, numFmt: 'yyyy-mm-dd', headerBg: 'DC2626',
            note: 'Fin période. Requis si prix_kg renseigné.',
            validation: { type: 'date', min: '2020-01-01', max: '2100-12-31', allowBlank: true, error: 'Date invalide.' } },
          { header: 'station_ref', width: 16, required: false, headerBg: 'DC2626',
            note: 'Référence bordereau station. Requis si prix_kg renseigné.' },
          { header: 'receipt_date', width: 14, required: false, numFmt: 'yyyy-mm-dd', headerBg: 'DC2626',
            note: 'Date réception station (optionnel).',
            validation: { type: 'date', min: '2020-01-01', max: '2100-12-31', allowBlank: true, error: 'Date invalide.' } },
          // Notes
          { header: 'notes_recolte', width: 32, required: false,
            note: 'Notes libres sur la récolte.' },
        ],
      },
    })
  },
}
