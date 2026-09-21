/** Preparation only: this model never writes operational records. */
export type InitField = { key: string; label: string; required?: boolean; type?: 'number' | 'date' | 'month'; min?: number; options?: string[]; ref?: string; example?: string }
export type InitSection = { key: string; title: string; help: string; fields: InitField[]; optional?: boolean }
export type InitRow = Record<string, string>
export type InitCatalog = { crops: InitRow[]; varieties: InitRow[]; [key: string]: InitRow[] }
export function initReferenceRows(draft: InitDraft, key: string, catalog?: InitCatalog): InitRow[] {
  const existing = catalog?.[key] || []
  return [...existing, ...(draft.rows[key] || []).filter(r => !existing.some(e => e.code.trim().toUpperCase() === r.code?.trim().toUpperCase()))]
}
export type InitDraft = { schema: 1; rows: Record<string, InitRow[]>; reviewed: string[]; skipped: string[] }
const f = (key: string, label: string, extra: Partial<InitField> = {}): InitField => ({ key, label, required: true, ...extra })
const code = f('code', 'Code métier (proposé automatiquement)', { required: false, example: 'F01' })
const name = f('name', 'Nom', { example: 'Ferme principale' })
const farm = f('farm', 'Code ferme', { ref: 'farms', example: 'F01' })
const house = f('greenhouse', 'Code serre', { ref: 'greenhouses', required: false, example: 'S01' })
const campaign = f('campaign', 'Code campagne', { ref: 'campaigns', example: 'C2026' })
const date = f('date', 'Date', { type: 'date', example: '2026-09-01' })
const quantity = f('quantity', 'Quantité', { type: 'number', min: 0, example: '100' })
const price = f('price', 'Prix unitaire (DH)', { type: 'number', min: 0, example: '12' })
const unit = f('unit', 'Unité', { options: ['kg', 'g', 'l', 'ml', 'unite', 'heure', 'jour', 'm3', 'kwh', 'ha'], example: 'kg' })
const category = f('category', 'Catégorie comptable', { ref: 'categories', example: 'ENGRAIS' })
export const INIT_SECTIONS: InitSection[] = [
  { key: 'farms', title: 'Fermes', help: 'Une ligne par ferme du client actif. Les codes servent à relier les étapes suivantes.', fields: [code, name, f('address', 'Adresse', { required: false })] },
  { key: 'greenhouses', title: 'Serres', help: 'Les surfaces officielles sont indépendantes du dessin du plan.', fields: [{ ...code, example: 'S01' }, { ...name, example: 'Serre 01' }, farm, f('type', 'Type', { options: ['multispan', 'tunnel', 'plein_champ'], example: 'multispan' }), f('area', 'Surface officielle (m²)', { type: 'number', min: 0.01, example: '10000' }), f('usable_area', 'Surface exploitable (m²)', { type: 'number', min: 0.01, required: false, example: '9000' })] },
  { key: 'warehouses', title: 'Entrepôts', help: 'Chaque entrepôt est rattaché à une ferme.', fields: [{ ...code, example: 'E01' }, { ...name, example: 'Entrepôt principal' }, farm] },
  { key: 'campaigns', title: 'Campagnes', help: 'Définissez les périodes avant les plantations et budgets.', fields: [{ ...code, example: 'C2026' }, { ...name, example: 'Campagne 2026–2027' }, f('start', 'Début', { type: 'date', example: '2026-07-01' }), f('end', 'Fin', { type: 'date', example: '2027-06-30' })] },
  { key: 'varieties', title: 'Cultures et variétés', help: 'Sélectionnez une variété du référentiel existant ou préparez une nouvelle variété rattachée à une culture existante. Aucune référence existante ne sera modifiée.', fields: [{ ...code, example: 'MARQ' }, { ...name, example: 'Marquise' }, f('crop', 'Code culture', { ref: 'crops', example: 'TOM' }), f('existing_id', 'Identifiant variété existante (ne pas modifier)', { required: false })] },
  { key: 'plantings', title: 'Plantations', help: 'Les dates de récolte prévues doivent suivre la plantation.', fields: [{ ...code, example: 'P01' }, campaign, farm, { ...house, required: true }, f('variety', 'Code variété', { ref: 'varieties', example: 'MARQ' }), date, f('harvest_start', 'Début récolte prévu', { type: 'date', example: '2026-10-15' }), f('harvest_end', 'Fin récolte prévue', { type: 'date', example: '2027-05-31' }), f('area', 'Surface plantée (m²)', { type: 'number', min: 0.01, example: '9000' }), f('target_kg', 'Objectif production (kg)', { type: 'number', min: 0, example: '180000' })] },
  { key: 'people', title: 'Personnel et habilitations', help: 'Préparation des employés et des accès. Aucun compte ni invitation n’est créé à cette étape. Ne saisissez aucun mot de passe.', fields: [{ ...code, example: 'EMP01' }, { ...name, example: 'Employé exemple' }, farm, f('team', 'Équipe', { required: false }), f('email', 'Email utilisateur', { required: false }), f('role', 'Profil demandé', { options: ['ouvrier', 'operateur', 'agronome', 'chef_exploitation', 'comptable', 'direction', 'commercial'], example: 'chef_exploitation' }), f('daily_rate', 'Taux journalier (DH)', { type: 'number', min: 0, required: false })] },
  { key: 'partners', title: 'Fournisseurs et clients commerciaux', help: 'Ne pas confondre le client utilisateur de FarmPilot et ses clients commerciaux.', fields: [{ ...code, example: 'FOU01' }, { ...name, example: 'Fournisseur exemple' }, f('type', 'Nature', { options: ['fournisseur', 'client'], example: 'fournisseur' }), f('email', 'Email', { required: false }), f('phone', 'Téléphone', { required: false })] },
  { key: 'products', title: 'Articles', help: 'La préparation du catalogue ne crée aucun achat. Les produits phyto nécessitent ensuite leur rapprochement réglementaire.', fields: [{ ...code, example: 'ART01' }, { ...name, example: 'Engrais exemple' }, f('category', 'Catégorie', { options: ['engrais', 'phytosanitaires', 'semences', 'autres'], example: 'engrais' }), unit] },
  { key: 'opening_stock', title: 'Stock d’ouverture', help: 'Photographie du stock à la date de reprise. Sa valeur n’est pas une dépense de campagne. Un prix absent reste à valoriser, jamais assimilé à zéro.', optional: true, fields: [{ ...code, example: 'ST01' }, f('warehouse', 'Code entrepôt', { ref: 'warehouses', example: 'E01' }), f('product', 'Code article', { ref: 'products', example: 'ART01' }), date, quantity, { ...price, required: false }, f('evidence', 'Justificatif de valorisation', { required: false })] },
  { key: 'reference_costs', title: 'Coûts de référence', help: 'Hypothèses de prix pour préparer les budgets. Ces tarifs ne sont ni des achats ni des dépenses réalisées.', fields: [{ ...code, example: 'TAR01' }, { ...name, example: 'Main-d’œuvre récolte' }, category, unit, price, date] },
  { key: 'budget', title: 'Budget de campagne', help: 'Une ligne par poste et par mois. Montant prévu = quantité × prix unitaire. Sans serre : charge commune de ferme à répartir ultérieurement. Aucun coût réel n’est créé.', fields: [{ ...code, example: 'B01' }, campaign, farm, house, category, f('period', 'Mois (AAAA-MM)', { type: 'month', example: '2026-09' }), quantity, unit, price, f('description', 'Libellé', { example: 'Préparation de la campagne' })] },
  { key: 'sales', title: 'Prévisions commerciales', help: 'Volumes et prix prévus, distincts des ventes et encaissements réalisés.', optional: true, fields: [{ ...code, example: 'V01' }, campaign, farm, house, f('variety', 'Code variété', { ref: 'varieties', example: 'MARQ' }), f('period', 'Mois (AAAA-MM)', { type: 'month', example: '2026-11' }), { ...quantity, label: 'Volume prévu (kg)' }, { ...price, label: 'Prix prévu (DH/kg)' }] },
  { key: 'actual_costs', title: 'Dépenses déjà réalisées', help: 'Reprise historique uniquement. Exclure la valeur du stock d’ouverture et les consommations déjà imputées dans FarmPilot. Le justificatif identifie la source et aide à éviter les doublons.', optional: true, fields: [{ ...code, example: 'DEP01' }, campaign, farm, house, category, date, f('amount', 'Montant réel (DH)', { type: 'number', min: 0.01, example: '1500' }), f('evidence', 'Référence justificatif', { example: 'FACT-001' }), f('description', 'Libellé', { example: 'Service réalisé' })] },
  { key: 'harvests', title: 'Récoltes historiques', help: 'Reprise des récoltes si la campagne a déjà commencé. Les contrôles DAR métier restent requis lors de l’intégration.', optional: true, fields: [{ ...code, example: 'REC01' }, f('planting', 'Code plantation', { ref: 'plantings', example: 'P01' }), date, { ...quantity, label: 'Quantité récoltée (kg)' }, f('people', 'Nombre de personnes', { type: 'number', min: 1, required: false, example: '5' })] },
]
for (const section of INIT_SECTIONS) {
  if (!section.fields.some(f => f.key === 'existing_id')) section.fields.push(f('existing_id', 'Lien technique (ne pas modifier)', { required: false }))
}
// Match the stock article form; opening quantities remain in their own step.
const articleFields = INIT_SECTIONS.find(s => s.key === 'products')!.fields
articleFields.find(f => f.key === 'category')!.options = undefined
articleFields.find(f => f.key === 'category')!.ref = 'stock_categories'
articleFields.find(f => f.key === 'unit')!.options = undefined
articleFields.find(f => f.key === 'unit')!.ref = 'units'
articleFields.push(
  f('min_qty', 'Stock minimum (alerte)', { type: 'number', min: 0, required: false, example: '100' }),
  f('unit_cost', 'Coût unitaire de référence (DH)', { type: 'number', min: 0, required: false, example: '12.50' }),
  f('location', 'Emplacement', { required: false, example: 'Rayon A' }),
  f('phyto_product', 'Produit phytosanitaire homologué', { ref: 'phyto_products', required: false }),
)
// Editable business inputs (not audit columns, calculated indicators or passwords).
const optional = (key: string, label: string, extra: Partial<InitField> = {}) => f(key, label, { required: false, ...extra })
const numberField = (key: string, label: string) => optional(key, label, { type: 'number', min: 0 })
const dateField = (key: string, label: string) => optional(key, label, { type: 'date' })
const reference = (key: string, label: string, ref: string) => optional(key, label, { ref })
const notes = optional('notes', 'Notes')
const additions: Record<string, InitField[]> = {
  farms: [optional('city', 'Ville'), optional('region', 'Région'), optional('country', 'Pays'), numberField('total_area', 'Surface totale (ha)'), notes],
  greenhouses: [reference('status', 'Statut', 'greenhouse_status'), notes],
  warehouses: [optional('warehouse_type', 'Type d’entrepôt', { options: ['central', 'ferme', 'phytosanitaire', 'intrants', 'emballages', 'autre'] }), reference('manager', 'Responsable', 'members'), optional('address', 'Adresse / emplacement'), optional('is_default', 'Entrepôt principal', { options: ['oui', 'non'] }), optional('is_active', 'Actif', { options: ['oui', 'non'] })],
  campaigns: [{ ...farm, required: false }, reference('status', 'Statut', 'campaign_status'), dateField('planting_start', 'Début plantation'), dateField('harvest_start', 'Début récolte'), dateField('harvest_end', 'Fin récolte'), numberField('budget_total', 'Budget global indicatif (DH)'), numberField('production_target_kg', 'Objectif de production (kg)'), notes],
  varieties: [reference('type', 'Type / segment', 'variety_type'), reference('destination', 'Destination', 'variety_destination'), numberField('theoretical_yield_per_m2', 'Rendement théorique (kg/m²)'), numberField('theoretical_cost_per_m2', 'Coût théorique (DH/m²)'), numberField('avg_price_local', 'Prix local (DH/kg)'), numberField('avg_price_export', 'Prix export (DH/kg)'), numberField('estimated_cycle_days', 'Cycle estimé (jours)'), optional('technical_notes', 'Notes techniques')],
  plantings: [numberField('plant_count', 'Nombre de plants'), numberField('linear_meters', 'Mètres linéaires'), numberField('target_yield_per_m2', 'Rendement cible (kg/m²)'), numberField('estimated_cost', 'Coût estimé (DH)'), numberField('export_share_pct', 'Part export (%)'), numberField('price_per_kg_export', 'Prix export (DH/kg)'), numberField('price_per_kg_local', 'Prix local (DH/kg)')],
  people: [optional('first_name', 'Prénom'), optional('last_name', 'Nom de famille'), optional('cin', 'CIN'), optional('cnss_number', 'N° CNSS'), dateField('date_birth', 'Date de naissance'), dateField('start_date', 'Date d’embauche'), reference('category', 'Catégorie salarié', 'worker_category'), reference('contract_type', 'Contrat', 'contract_type'), reference('pay_frequency', 'Fréquence de paie', 'pay_frequency'), numberField('base_salary', 'Salaire de base (DH)'), optional('function', 'Fonction'), reference('family_status', 'Situation familiale', 'family_status'), numberField('dependents', 'Personnes à charge'), optional('bank_iban', 'RIB / IBAN'), reference('payment_method', 'Mode de paiement', 'payment_method'), optional('phone', 'Téléphone'), optional('address', 'Adresse'), optional('mission_label', 'Mission'), numberField('mission_days_planned', 'Jours mission prévus'), numberField('mission_days_done', 'Jours mission réalisés'), dateField('mission_start_date', 'Début mission'), dateField('mission_end_date', 'Fin mission')],
  partners: [reference('supplier_category', 'Catégorie fournisseur', 'supplier_category'), reference('client_type', 'Type client commercial', 'client_type'), optional('country', 'Pays'), optional('city', 'Ville'), optional('address', 'Adresse'), optional('contact_name', 'Contact'), numberField('payment_terms_days', 'Délai de paiement (jours)'), numberField('credit_limit', 'Plafond crédit client (DH)'), notes],
  opening_stock: [optional('reference', 'Référence de reprise'), notes],
  reference_costs: [optional('description', 'Description de l’hypothèse'), dateField('valid_until', 'Fin de validité'), optional('source', 'Source du tarif')],
  budget: [optional('version_name', 'Nom de version budgétaire'), notes],
  sales: [reference('customer', 'Client commercial', 'commercial_customers'), reference('market', 'Marché', 'markets'), notes],
  actual_costs: [notes],
  harvests: [numberField('harvest_hours', 'Heures par personne'), optional('harvest_full_day', 'Journée complète', { options: ['oui', 'non'] }), notes],
}
for (const section of INIT_SECTIONS) section.fields.push(...(additions[section.key] || []).filter(f => !section.fields.some(existing => existing.key === f.key)))
const roleField = INIT_SECTIONS.find(s => s.key === 'people')!.fields.find(f => f.key === 'role')!
roleField.options = undefined; roleField.ref = 'roles'
INIT_SECTIONS.find(s => s.key === 'people')!.fields.find(f => f.key === 'team')!.ref = 'teams'
const greenhouseType = INIT_SECTIONS.find(s => s.key === 'greenhouses')!.fields.find(f => f.key === 'type')!
greenhouseType.options = undefined; greenhouseType.ref = 'greenhouse_type'
INIT_SECTIONS.push({ key: 'harvest_trays', title: 'Contenants des récoltes', optional: true, help: 'Une ligne par type de plateau et récolte. Plusieurs lignes peuvent se rattacher à la même récolte historique. Les quantités récoltées restent dans l’étape précédente.', fields: [code, f('harvest', 'Récolte du dossier', { ref: 'harvests' }), f('tray_type', 'Type de plateau', { ref: 'tray_type' }), f('tray_count', 'Nombre de plateaux', { type: 'number', min: 1 }), notes] })
export const emptyInitDraft = (): InitDraft => ({ schema: 1, rows: {}, reviewed: [], skipped: [] })
export function newInitRow(section: InitSection, draft: InitDraft, catalog?: InitCatalog): InitRow {
  const prefixes: Record<string, string> = { farms: 'FER', greenhouses: 'SER', warehouses: 'ENT', campaigns: 'CAM', varieties: 'VAR', plantings: 'PLA', people: 'EMP', partners: 'PAR', products: 'ART', opening_stock: 'STO', reference_costs: 'TAR', budget: 'BUD', sales: 'PRE', actual_costs: 'DEP', harvests: 'REC', harvest_trays: 'PLT' }
  const taken = new Set(initReferenceRows(draft, section.key, catalog).map(r => r.code?.trim().toUpperCase()))
  let n = 1
  while (taken.has(`${prefixes[section.key]}-${String(n).padStart(4, '0')}`)) n++
  return { ...Object.fromEntries(section.fields.map(f => [f.key, ''])), code: `${prefixes[section.key]}-${String(n).padStart(4, '0')}` }
}
export function isInitDraft(value: unknown): value is InitDraft {
  if (!value || typeof value !== 'object') return false
  const d = value as InitDraft
  const keys = new Set(INIT_SECTIONS.map(s => s.key))
  return d.schema === 1 && !!d.rows && typeof d.rows === 'object' && !Array.isArray(d.rows)
    && Array.isArray(d.reviewed) && d.reviewed.every(s => typeof s === 'string' && keys.has(s))
    && Array.isArray(d.skipped) && d.skipped.every(s => INIT_SECTIONS.some(t => t.key === s && t.optional))
    && Object.entries(d.rows).every(([key, rows]) => keys.has(key) && Array.isArray(rows) && rows.length <= 1000 && rows.every(r => r && typeof r === 'object' && !Array.isArray(r) && Object.values(r).every(v => typeof v === 'string' && v.length <= 2000)))
}
export function initNumber(value: string): number {
  const normalized = value.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? Number(normalized) : NaN
}
export type InitIssue = { section: string; row: number; field: string; message: string; warning?: boolean }
export function validateInit(draft: InitDraft, catalog?: InitCatalog): InitIssue[] {
  const issues: InitIssue[] = []
  const norm = (v: string = '') => v.trim().toUpperCase()
  for (const section of INIT_SECTIONS) {
    const seen = new Set<string>()
    for (const [index, row] of (draft.rows[section.key] || []).entries()) {
      const add = (field: string, message: string, warning = false) => issues.push({ section: section.key, row: index + 1, field, message, warning })
      for (const field of section.fields) {
        const value = (row[field.key] || '').trim()
        if (!value) { if (field.required) add(field.key, `${field.label} ${row.existing_id ? 'non renseigné dans le référentiel' : 'obligatoire'}`, !!row.existing_id); continue }
        if (field.type === 'number' && (!Number.isFinite(initNumber(value)) || initNumber(value) < (field.min ?? 0))) add(field.key, `${field.label} : nombre ≥ ${field.min ?? 0} attendu`)
        if (field.key === 'people' && !Number.isInteger(initNumber(value))) add(field.key, 'Effectif entier attendu')
        if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) add(field.key, 'Date valide attendue (AAAA-MM-JJ)')
        if (field.type === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) add(field.key, 'Mois valide attendu (AAAA-MM)')
        if (field.options && !row.existing_id && !field.options.includes(value)) add(field.key, `Valeur attendue : ${field.options.join(', ')}`)
        if (field.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) add(field.key, 'Email invalide')
        if (field.ref && !(!catalog && !INIT_SECTIONS.some(s => s.key === field.ref)) && !initReferenceRows(draft, field.ref, catalog).some(r => norm(r.code) === norm(value))) add(field.key, `Référence ${value} absente : ${field.label}`)
      }
      const key = norm(row.code)
      if (key && seen.has(key)) add('code', `Code dupliqué : ${row.code}`)
      seen.add(key)
      if (row.export_share_pct && initNumber(row.export_share_pct) > 100) add('export_share_pct', 'La part export doit être comprise entre 0 et 100 %')
      for (const integer of ['plant_count', 'dependents', 'payment_terms_days', 'estimated_cycle_days', 'tray_count']) if (row[integer] && !Number.isInteger(initNumber(row[integer]))) add(integer, 'Un nombre entier est attendu')
      if (row.mission_start_date && row.mission_end_date && row.mission_end_date < row.mission_start_date) add('mission_end_date', 'La fin de mission précède son début')
      if (row.is_default === 'oui' && row.is_active === 'non') add('is_active', 'Un entrepôt principal doit être actif')
      if (section.key === 'products' && row.phyto_product && row.category !== 'phytosanitaires') add('phyto_product', 'Un lien phyto nécessite la catégorie phytosanitaires')
      if (section.key !== 'varieties' && catalog?.[section.key]) {
        const linked = catalog[section.key].find(r => r.existing_id === row.existing_id)
        if (row.existing_id && !linked) add('code', 'Référence existante introuvable ou inactive')
        if (linked && section.fields.some(f => (linked[f.key] || '') !== (row[f.key] || ''))) add('code', 'Fiche liée modifiée : sélectionnez de nouveau la référence')
        if (!row.existing_id && catalog[section.key].some(r => norm(r.code) === key)) add('code', 'Code déjà présent : utilisez la référence existante')
      }
      if (section.key === 'varieties' && catalog) {
        const sameCode = catalog.varieties.filter(r => norm(r.code) === key)
        const linked = row.existing_id ? catalog.varieties.find(r => r.existing_id === row.existing_id) : undefined
        if (row.existing_id && !linked) add('existing_id', 'Variété liée introuvable ou inactive : sélectionnez de nouveau la référence')
        if (linked && section.fields.some(f => (linked[f.key] || '') !== (row[f.key] || ''))) add('existing_id', 'La fiche liée diffère du référentiel : sélectionnez de nouveau la variété')
        if (!row.existing_id && sameCode.length) add('code', 'Ce code existe déjà : sélectionnez la variété existante')
        if (!row.existing_id && catalog.varieties.some(r => norm(r.name) === norm(row.name) && norm(r.crop) === norm(row.crop))) add('name', 'Cette variété existe déjà pour cette culture : utilisez le référentiel')
      }
      if (row.start && row.end && row.end < row.start) add('end', 'La fin précède le début')
      if (row.harvest_start && row.date && row.harvest_start < row.date) add('harvest_start', 'La récolte précède la plantation')
      if (row.harvest_end && row.harvest_start && row.harvest_end < row.harvest_start) add('harvest_end', 'La fin de récolte précède son début')
      if (row.usable_area && initNumber(row.usable_area) > initNumber(row.area)) add('usable_area', 'Surface exploitable supérieure à la surface officielle')
      const greenhouse = initReferenceRows(draft, 'greenhouses', catalog).find(r => norm(r.code) === norm(row.greenhouse))
      if (greenhouse && norm(row.farm) !== norm(greenhouse.farm)) add('greenhouse', 'Cette serre appartient à une autre ferme')
      if (section.key === 'plantings' && greenhouse && initNumber(row.area) > initNumber(greenhouse.usable_area || greenhouse.area)) add('area', 'Surface plantée supérieure à la surface disponible')
      const season = initReferenceRows(draft, 'campaigns', catalog).find(r => norm(r.code) === norm(row.campaign))
      if (season && row.period && (row.period < season.start?.slice(0, 7) || row.period > season.end?.slice(0, 7))) add('period', 'Mois hors campagne')
      if (section.key === 'opening_stock') {
        if (initNumber(row.quantity) > 0 && !row.price?.trim()) add('price', 'Stock non valorisé : prix manquant', true)
        if (row.price?.trim() && !row.evidence?.trim()) add('evidence', 'Justificatif requis pour le prix de reprise')
        if ((draft.rows.opening_stock || []).slice(0, index).some(r => norm(r.warehouse) === norm(row.warehouse) && norm(r.product) === norm(row.product))) add('product', 'Un seul solde d’ouverture par article et entrepôt')
      }
    }
  }
  return issues
}
export function initProgress(draft: InitDraft, catalog?: InitCatalog) {
  const issues = validateInit(draft, catalog)
  const complete = INIT_SECTIONS.filter(s => (s.optional && draft.skipped.includes(s.key) && !draft.rows[s.key]?.length) || (draft.reviewed.includes(s.key) && !!draft.rows[s.key]?.length && !issues.some(i => i.section === s.key && !i.warning))).length
  return { complete, total: INIT_SECTIONS.length, percent: Math.round(100 * complete / INIT_SECTIONS.length), issues }
}
export function updateInitRows(draft: InitDraft, section: string, rows: InitRow[]): InitDraft {
  // Invalidate the edited section and its transitive dependents, not unrelated work.
  const affected = new Set([section])
  let size = 0
  while (size !== affected.size) {
    size = affected.size
    INIT_SECTIONS.forEach(s => { if (s.fields.some(f => f.ref && affected.has(f.ref))) affected.add(s.key) })
  }
  return { ...draft, rows: { ...draft.rows, [section]: rows }, reviewed: draft.reviewed.filter(s => !affected.has(s)), skipped: draft.skipped.filter(s => s !== section) }
}
