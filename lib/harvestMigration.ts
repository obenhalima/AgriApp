/** Historical collection only. Never writes operational data. */
export type MigrationPlanting = { id: string; label: string; farm: string; campaign: string; greenhouse: string; variety: string; start?: string; end?: string }
export type MigrationCatalog = {
  domainId: string; domainName: string; fetchedAt: string
  plantings: MigrationPlanting[]
  markets: { id: string; label: string; currency: string; client: string; type: string }[]
  trays: { code: string; label: string; weight: number }[]
  destinations: { code: string; label: string }[]
  existing: { planting: string; date: string; ref: string }[]
}
type Column = { key: string; label: string; required?: boolean; kind?: 'date' | 'number' | 'whole'; list?: string; help?: string }
const c = (key: string, label: string, options: Omit<Column, 'key' | 'label'> = {}): Column => ({ key, label, ...options })
export const MIGRATION_SHEETS = [
  { name: 'Recoltes', help: 'Une ligne par opération et plantation. Choisir une plantation existante : ferme, campagne, serre et variété sont liées.', columns: [
    c('tray', 'Type de caisse / plateau', { list: 'PlateauxRef' }), c('count', 'Nombre de caisses / plateaux', { kind: 'whole' }), c('unitKg', 'Poids unitaire historique (kg)', { kind: 'number' }),
    c('ref', 'Référence récolte', { required: true }), c('planting', 'Plantation', { required: true, list: 'Plantations' }), c('date', 'Date récolte', { required: true, kind: 'date' }), c('kg', 'Quantité au champ (kg)', { kind: 'number', help: 'Facultatif si les caisses sont renseignées dans Plateaux. Sinon saisir le poids connu.' }), c('weight', 'Poids mesuré ou estimé', { list: 'Mesuré,Estimé', help: 'Obligatoire avec un poids saisi. Sans kg saisis, les caisses donnent un poids estimé.' }), c('people', 'Nombre de personnes', { kind: 'whole' }), c('hours', 'Heures par personne', { kind: 'number' }), c('fullDay', 'Journée complète', { list: 'Oui,Non,Inconnu' }), c('document', 'Justificatif'), c('notes', 'Observations'),
  ] },
  { name: 'Plateaux', help: 'Facultatif. Plusieurs types de plateaux possibles par récolte. Poids unitaire historique, pas forcément le poids actuel du référentiel.', columns: [
    c('harvest', 'Référence récolte', { required: true, list: 'Recoltes' }), c('tray', 'Type de plateau', { required: true, list: 'PlateauxRef' }), c('count', 'Nombre de plateaux', { required: true, kind: 'whole' }), c('unitKg', 'Poids unitaire historique (kg)', { kind: 'number', help: 'Facultatif. Si absent, estimation avec le poids actuel du référentiel, signalée au contrôle.' }),
  ] },
  { name: 'Envois', help: 'Une ligne par envoi station ou local. Ne pas répéter un envoi par serre. Indiquer ses récoltes dans Sources.', columns: [
    c('ref', 'Référence envoi', { required: true }), c('market', 'Marché et client', { required: true, list: 'Marches' }), c('date', 'Date envoi', { required: true, kind: 'date' }), c('kg', 'Quantité départ (kg)', { required: true, kind: 'number' }), c('document', 'Bon de livraison'), c('notes', 'Observations'),
  ] },
  { name: 'Sources', help: 'Une ligne par lien envoi / récolte. Répartir les kg de départ, avant correction de pesée. Ne pas répéter la récolte dans Recoltes.', columns: [
    c('dispatch', 'Référence envoi', { required: true, list: 'Envois' }), c('harvest', 'Référence récolte', { required: true, list: 'Recoltes' }), c('kg', 'Contribution au départ (kg)', { required: true, kind: 'number' }),
  ] },
  { name: 'Pesees', help: 'Facultatif. Une pesée nette finale par envoi. Ne pas confondre poids brut du camion et poids net des tomates.', columns: [
    c('dispatch', 'Référence envoi', { required: true, list: 'Envois' }), c('date', 'Date pesée', { required: true, kind: 'date' }), c('kg', 'Poids net réel (kg)', { required: true, kind: 'number' }), c('document', 'Ticket de pesée', { required: true }), c('notes', 'Observations'),
  ] },
  { name: 'Tri', help: 'Facultatif. Une ligne par envoi. Saisir les kilos réellement constatés. Les pourcentages sont recalculés au contrôle, sans taux par défaut.', columns: [
    c('dispatch', 'Référence envoi', { required: true, list: 'Envois' }), c('date', 'Date tri', { required: true, kind: 'date' }), c('baseKg', 'Poids soumis au tri (kg)', { required: true, kind: 'number' }), c('lossKg', 'Freinte détruite (kg)', { required: true, kind: 'number' }), c('rejectKg', 'Écart (kg)', { required: true, kind: 'number' }), c('acceptedKg', 'Accepté (kg)', { required: true, kind: 'number' }), c('destination', 'Destination écart', { list: 'Destinations' }), c('document', 'Référence tri'), c('notes', 'Observations'),
  ] },
  { name: 'Prix', help: 'Facultatif. Une ligne par tarification et envoi. Plusieurs prix partiels possibles. Tarifé ne signifie pas encaissé.', columns: [
    c('ref', 'Référence ligne prix', { required: true }), c('dispatch', 'Référence envoi', { required: true, list: 'Envois' }), c('date', 'Date tarification', { required: true, kind: 'date' }), c('portion', 'Part tarifée', { required: true, list: 'Accepté,Écart' }), c('kg', 'Quantité tarifée (kg)', { required: true, kind: 'number' }), c('price', 'Prix par kg', { required: true, kind: 'number' }), c('currency', 'Devise', { required: true, list: 'Devises' }), c('document', 'Bordereau ou bon de prix', { required: true }), c('start', 'Début période', { kind: 'date' }), c('end', 'Fin période', { kind: 'date' }), c('notes', 'Observations'),
  ] },
] as const
export type MigrationRow = Record<string, string | number>
export type MigrationData = Record<string, MigrationRow[]>
export type MigrationIssue = { sheet: string; row: number; field: string; severity: 'error' | 'warning'; message: string }
export const text = (v: unknown) => String(v ?? '').trim()
export const number = (v: unknown) => text(v) === '' ? NaN : Number(text(v).replace(/\s/g, '').replace(',', '.'))
export function harvestCollectionKg(row: MigrationRow, data: MigrationData, catalog: MigrationCatalog): number {
  if (text(row.kg)) return number(row.kg)
  const crates = text(row.tray) || text(row.count) ? [row] : (data.Plateaux || []).filter(t => text(t.harvest) === text(row.ref))
  if (!crates.length) return NaN
  return crates.reduce((sum, t) => {
    const unit = text(t.unitKg) ? number(t.unitKg) : catalog.trays.find(v => v.code === text(t.tray))?.weight
    const count = number(t.count)
    return Number.isFinite(unit) && Number(unit) > 0 && Number.isInteger(count) && count > 0 ? sum + count * Number(unit) : NaN
  }, 0)
}
export function validDate(v: unknown): boolean { const s = text(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s }
export function checkHarvestMigration(data: MigrationData, catalog: MigrationCatalog, today = new Date().toISOString().slice(0,10)) {
  const issues: MigrationIssue[] = []
  const add = (sheet: string, row: number, field: string, message: string, severity: 'error' | 'warning' = 'error') => issues.push({ sheet, row, field, message, severity })
  const rows = (s: string) => data[s] || []
  const rowNo = (r: MigrationRow, i: number) => Number(r.__row || i + 2)
  const refs = (s: string, key: string) => new Map(rows(s).map(r => [text(r[key]), r]))
  const harvests = refs('Recoltes', 'ref'), dispatches = refs('Envois', 'ref')
  const plantings = new Map(catalog.plantings.map(p => [p.label, p])), markets = new Map(catalog.markets.map(m => [m.label, m]))
  const lists: Record<string, string[]> = { Plantations: [...plantings.keys()], Marches: [...markets.keys()], PlateauxRef: catalog.trays.map(t => t.code), Destinations: catalog.destinations.map(d => d.code), Devises: [...new Set(catalog.markets.map(m => m.currency).filter(Boolean))], Recoltes: [...harvests.keys()], Envois: [...dispatches.keys()] }
  for (const spec of MIGRATION_SHEETS) {
    const seen = new Set<string>()
    rows(spec.name).forEach((r, i) => {
      const n = rowNo(r, i)
      for (const col of spec.columns) {
        const v = text(r[col.key])
        if (!v) { if (col.required) add(spec.name,n,col.label,'Champ obligatoire.'); continue }
        if (col.kind === 'date' && (!validDate(v) || v > today)) add(spec.name,n,col.label,'Date invalide ou future. Utiliser AAAA-MM-JJ.')
        if (col.kind === 'number' || col.kind === 'whole') {
          const num = number(v), zeroAllowed = ['lossKg','rejectKg','acceptedKg','price'].includes(col.key)
          if (!Number.isFinite(num) || num < 0 || (!zeroAllowed && num === 0) || (col.kind === 'whole' && !Number.isInteger(num))) add(spec.name,n,col.label,'Nombre invalide : vérifier la valeur et les unités.')
        }
        if (col.list && !(lists[col.list] || col.list.split(',')).includes(v)) add(spec.name,n,col.label,'Valeur absente du référentiel actuel ou référence liée inconnue.')
      }
      const key = spec.name === 'Sources' ? `${r.dispatch}|${r.harvest}` : ['Pesees','Tri'].includes(spec.name) ? text(r.dispatch) : text(r.ref)
      if (key && seen.has(key)) add(spec.name,n,'Référence','Référence répétée dans cet onglet.')
      if (key) seen.add(key)
    })
  }
  if (!rows('Recoltes').length) add('Recoltes',2,'Référence récolte','Le fichier ne contient aucune récolte.')
  rows('Recoltes').forEach((r,i) => {
    const n=rowNo(r,i), p=plantings.get(text(r.planting))
    if (p && validDate(r.date)) {
      if ((p.start && text(r.date)<p.start) || (p.end && text(r.date)>p.end)) add('Recoltes',n,'Date récolte','Date hors fenêtre de récolte de la plantation.')
      if (catalog.existing.some(h => h.ref===text(r.ref) || (h.planting===p.id && h.date===r.date))) add('Recoltes',n,'Référence récolte','Récolte potentiellement déjà en base : rapprocher avant import.','warning')
      if (rows('Recoltes').some((other,j)=>j!==i && other.planting===r.planting && other.date===r.date && (!text(r.tray) || !text(other.tray) || text(other.tray)===text(r.tray)))) add('Recoltes',n,'Date récolte','Plusieurs lignes pour la même plantation, date et type de caisse (ou type absent) : vérifier qu’il ne s’agit pas de la même récolte.','warning')
    }
    if ((text(r.hours) && (!text(r.people) || number(r.hours)>24)) || (r.fullDay==='Oui' && !text(r.people))) add('Recoltes',n,'Effectif / heures','Renseigner l’effectif ; les heures par personne doivent être ≤ 24.')
    const used=rows('Sources').filter(s=>s.harvest===r.ref).reduce((a,s)=>a+number(s.kg),0)
    const collectedKg = harvestCollectionKg(r, data, catalog)
    const directCrates = !!(text(r.tray) || text(r.count) || text(r.unitKg))
    if (directCrates && (!text(r.tray) || !text(r.count))) add('Recoltes',n,'Caisses / plateaux','Renseigner ensemble le type et le nombre de caisses.')
    if (directCrates && rows('Plateaux').some(t => text(t.harvest) === text(r.ref))) add('Recoltes',n,'Caisses / plateaux','Utiliser soit les colonnes caisses dans Recoltes, soit l’onglet Plateaux pour cette récolte, pas les deux.')
    if (!Number.isFinite(collectedKg) || collectedKg <= 0) add('Recoltes',n,'Quantité au champ','Renseigner un poids connu ou des caisses avec un type, un nombre et un poids unitaire disponible.')
    if (text(r.kg) && !text(r.weight)) add('Recoltes',n,'Poids mesuré ou estimé','Préciser si le poids saisi est mesuré ou estimé.')
    if (!text(r.kg) && r.weight === 'Mesuré') add('Recoltes',n,'Poids mesuré ou estimé','Le poids calculé depuis les caisses est estimé, pas mesuré.')
    if (used>collectedKg+0.01) add('Recoltes',n,'Quantité au champ','Les contributions aux envois dépassent la récolte.')
    const trays=directCrates ? [r] : rows('Plateaux').filter(t=>t.harvest===r.ref)
    if (text(r.kg) && trays.length && Math.abs(harvestCollectionKg({...r, kg:''}, data, catalog)-number(r.kg))>0.01) add('Recoltes',n,'Quantité au champ','Écart entre poids récolté et somme des plateaux : documenter.','warning')
  })
  rows('Envois').forEach((r,i)=> {
    const n=rowNo(r,i), src=rows('Sources').filter(s=>s.dispatch===r.ref)
    if (!src.length || Math.abs(src.reduce((a,s)=>a+number(s.kg),0)-number(r.kg))>0.01) add('Envois',n,'Quantité départ','La somme des Sources doit correspondre aux kg de départ.')
    const ps=src.map(s=>plantings.get(text(harvests.get(text(s.harvest))?.planting))).filter(Boolean)
    if (new Set(ps.map(p=>p!.farm)).size>1 || new Set(ps.map(p=>p!.variety)).size>1) add('Envois',n,'Sources','Séparer les envois par ferme et variété pour la reprise.')
    for (const s of src) if (text(harvests.get(text(s.harvest))?.date)>text(r.date)) add('Envois',n,'Date envoi','Envoi antérieur à une récolte source.')
  })
  for (const name of ['Pesees','Tri','Prix']) rows(name).forEach((r,i)=>{
    const d=dispatches.get(text(r.dispatch)); if (d && text(r.date)<text(d.date)) add(name,rowNo(r,i),'Date','Date antérieure à l’envoi.')
  })
  rows('Tri').forEach((r,i)=> {
    const n=rowNo(r,i), weighing=rows('Pesees').find(p=>p.dispatch===r.dispatch), d=dispatches.get(text(r.dispatch))
    const base=weighing?.kg ?? d?.kg
    if (base!=null && Math.abs(number(r.baseKg)-number(base))>0.01) add('Tri',n,'Poids soumis au tri','Le poids doit correspondre à la pesée, sinon aux kg de départ.')
    if (Math.abs(number(r.baseKg)-number(r.lossKg)-number(r.rejectKg)-number(r.acceptedKg))>0.01) add('Tri',n,'Quantités','Accepté + écart + freinte doivent égaler le poids soumis au tri.')
    if (number(r.rejectKg)>0 && !text(r.destination)) add('Tri',n,'Destination écart','Préciser la destination des écarts.')
    if (weighing && text(r.date)<text(weighing.date)) add('Tri',n,'Date tri','Tri antérieur à la pesée.')
  })
  rows('Prix').forEach((r,i)=> {
    const n=rowNo(r,i), d=dispatches.get(text(r.dispatch)), tri=rows('Tri').find(t=>t.dispatch===r.dispatch)
    if (!tri) add('Prix',n,'Référence envoi','Tri manquant : renseigner le bilan (même sans perte) avant tarification.')
    if (tri && text(r.date)<text(tri.date)) add('Prix',n,'Date tarification','Tarification antérieure au tri.')
    if (d && markets.get(text(d.market))?.currency!==r.currency) add('Prix',n,'Devise','Devise différente du marché de l’envoi.')
    if (!!text(r.start)!==!!text(r.end) || (text(r.start) && text(r.start)>text(r.end))) add('Prix',n,'Période','Renseigner les deux dates dans l’ordre, ou laisser les deux vides.')
    if (tri) {
      const max=number(r.portion==='Écart'?tri.rejectKg:tri.acceptedKg)
      const priced=rows('Prix').filter(p=>p.dispatch===r.dispatch&&p.portion===r.portion).reduce((a,p)=>a+number(p.kg),0)
      if (priced>max+0.01) add('Prix',n,'Quantité tarifée','Le cumul tarifé dépasse la quantité de cette part au tri.')
    }
    if (number(r.price)===0) add('Prix',n,'Prix par kg','Prix nul : confirmer qu’il est réel et non manquant.','warning')
  })
  const referenceEstimates = rows('Recoltes').filter(r => !text(r.kg) && (text(r.tray) ? !text(r.unitKg) : rows('Plateaux').some(t => text(t.harvest)===text(r.ref) && !text(t.unitKg))))
  const weightTypes = [...new Set(referenceEstimates.flatMap(r => text(r.tray) ? [text(r.tray)] : rows('Plateaux').filter(t=>text(t.harvest)===text(r.ref)&&!text(t.unitKg)).map(t=>text(t.tray))))].map(code=>{const t=catalog.trays.find(t=>t.code===code);return `${t?.label || code} : ${t?.weight ?? 'inconnu'} kg`})
  const notes = referenceEstimates.length ? [`${referenceEstimates.length} récolte(s) : poids estimé automatiquement depuis le nombre de caisses et le référentiel (${weightTypes.join(' ; ')}). Ce n’est pas une pesée réelle. Vérifiez ces poids pour la période historique.`] : []
  if(rows('Recoltes').some((r,i)=>rows('Recoltes').some((other,j)=>j!==i&&other.planting===r.planting&&other.date===r.date&&text(r.tray)&&text(other.tray)&&r.tray!==other.tray))) notes.push('Certaines plantations ont plusieurs types de caisses le même jour. Les lignes restent séparées ; un type de caisse ne prouve pas à lui seul la destination ou l’absence de doublon.')
  return { issues, notes, counts: Object.fromEntries(MIGRATION_SHEETS.map(s=>[s.name,rows(s.name).length])), harvestKg: rows('Recoltes').reduce((a,r)=>{ const kg=harvestCollectionKg(r,data,catalog); return a+(Number.isFinite(kg)?kg:0) },0) }
}
