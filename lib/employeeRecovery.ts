import * as XLSX from 'xlsx'

export type EmployeeRecoveryRow = {
  excel_row: number
  source_number: string | null
  source_name: string
  payment_name: string | null
  normal_hourly_rate: number | null
  overtime_hourly_rate: number | null
  daily_rate: number | null
  seniority_rate: number | null
  is_active: boolean | null
  notes: string | null
  profile?: Record<string,string>
}

export function readEmployeeRecovery(buffer: ArrayBuffer,context?:{domain:string;farm:string}): EmployeeRecoveryRow[] {
  const book = XLSX.read(buffer, {type: 'array'})
  const standard=!!book.Sheets['Employes_Import']
  const simplified=standard&&['2','3'].includes(String(book.Sheets['_Contexte']?.B2?.v))
  const sheet = book.Sheets['Employes_Import'] || book.Sheets['Employés']
  if (!sheet) throw new Error('Choisissez le modèle ItriX ou le classeur consolidé contenant l’onglet Employés.')
  if(standard){
    const metadata=book.Sheets['_Contexte']
    if(!['1','2','3'].includes(String(metadata?.B2?.v))||!context||metadata.B3?.v!==context.domain||metadata.B4?.v!==context.farm){
      throw new Error('Ce modèle appartient à un autre client ou une autre ferme. Exportez le modèle du périmètre sélectionné.')
    }
  }
  const text = (address: string) => {
    const cell = sheet[address]
    if (cell?.t === 'e') throw new Error(`Cellule ${address} : erreur Excel.`)
    return cell?.v == null ? '' : String(cell.v).trim()
  }
  if (standard ? text('B1')!==(simplified?'Nom':'Nom complet source')||text('D1')!=='Tarif horaire normal' : !text('B4').startsWith('Nom') || !text('D4').includes('Taux normal')) {
    throw new Error('Les colonnes de l’onglet Employés ne correspondent pas au classeur consolidé.')
  }
  const number = (address: string, maximum: number) => {
    const raw = text(address)
    if (!raw) return null
    const value = Number(raw.replace(',', '.'))
    if (!Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`Cellule ${address} : nombre invalide.`)
    return value
  }
  const rows: EmployeeRecoveryRow[] = []
  const names = new Set<string>()
  const end = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r + 1
  for (let row = standard?2:5; row <= end; row++) {
    const sourceNumber = text(`A${row}`)
    const profile:Record<string,string>={}
    if(standard){
      const profileColumns=simplified
        ? [['B','last_name'],['C','first_name'],['J','cin'],['K','cnss_number'],['L','phone'],['M','email'],['N','start_date'],['O','date_birth']]
        : [['J','first_name'],['K','last_name'],['L','cin'],['M','cnss_number'],['N','phone'],['O','email'],['P','start_date'],['Q','date_birth']]
      for(const [column,key] of profileColumns){
        const address=`${column}${row}`
        let value=text(address)
        if(value&&['start_date','date_birth'].includes(key)){
          if(sheet[address]?.t==='n'){
            const date=XLSX.SSF.parse_date_code(Number(value),{date1904:!!book.Workbook?.WBProps?.date1904})
            if(!date)throw new Error(`Cellule ${address} : date invalide.`)
            value=`${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`
          }
          if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error(`Cellule ${address} : date ISO attendue (AAAA-MM-JJ).`)
        }
        if(value)profile[key]=value
      }
    }
    if (standard && String(book.Sheets['_Contexte']?.B2?.v) === '3') {
      const declaration = text(`P${row}`).toLowerCase()
      if (declaration && !['oui','non'].includes(declaration)) throw new Error(`Cellule P${row} : Oui ou Non attendu.`)
      if (declaration) profile.is_declared = String(declaration === 'oui')
    }
    const name = simplified ? [profile.last_name,profile.first_name].filter(Boolean).join(' ') : text(`B${row}`) || [profile.last_name,profile.first_name].filter(Boolean).join(' ')
    if (name.toUpperCase() === 'TOTAL') break
    if (!name && !sourceNumber && !Object.keys(profile).length) continue
    if (!name) throw new Error(`Ligne ${row} : nom de l’employé manquant.`)
    const key = name.toLocaleLowerCase().replace(/\s+/g, ' ')
    if (names.has(key)) throw new Error(`Ligne ${row} : nom présent plusieurs fois dans le fichier.`)
    names.add(key)
    const status = text(`H${row}`).toLowerCase()
    if (status && !['actif', 'inactif'].includes(status)) throw new Error(`Ligne ${row} : statut non reconnu.`)
    rows.push({
      excel_row: row, source_number: sourceNumber || null, source_name: name,
      payment_name: simplified?null:text(`C${row}`) || null,
      normal_hourly_rate: number(`D${row}`, 1000000),
      daily_rate: number(`E${row}`, 1000000),
      overtime_hourly_rate: number(`F${row}`, 1000000),
      seniority_rate: number(`G${row}`, 1),
      is_active: status ? status === 'actif' : null,
      notes: text(`I${row}`) || null,
      profile,
    })
  }
  if (!rows.length || rows.length > 1000) throw new Error('Le fichier doit contenir entre 1 et 1 000 employés.')
  return rows
}

// Completeness is informational. Normal editing keeps the application's validation rules.
export function missingEmployeeInformation(worker: Record<string, any>): string[] {
  const fields = [
    ['last_name', 'Nom'], ['cin', 'CIN'], ...(worker.is_declared !== false ? [['cnss_number', 'N° CNSS']] : []),
    ['date_birth', 'Date naissance'], ['start_date', "Date d'embauche"], ['farm_id', 'Ferme'],
    ['category', 'Catégorie'], ['contract_type', 'Type de contrat'], ['pay_frequency', 'Fréquence paie'],
    ['function', 'Fonction'], ['payment_method', 'Méthode paiement'], ['phone', 'Téléphone'],
    ['email', 'Email'], ['address', 'Adresse'], ['family_status', 'Situation familiale'],
    ['dependents', 'Personnes à charge'], ['normal_hourly_rate', 'Tarif horaire normal'],
    ['overtime_hourly_rate', 'Tarif horaire supplémentaire'], ['seniority_rate', 'Taux ancienneté'],
  ]
  return fields.filter(([key]) => worker[key] == null || String(worker[key]).trim() === '').map(([, label]) => label)
}

export function employeeEditError(worker: Record<string, any>, farmIds: string[]): string | null {
  if (!worker.last_name?.trim()) return 'Le nom est requis'
  if (worker.farm_id && !farmIds.includes(worker.farm_id)) return 'Ferme inaccessible pour ce client'
  for (const key of ['base_salary', 'daily_rate', 'normal_hourly_rate', 'overtime_hourly_rate', 'seniority_rate', 'dependents']) {
    if (worker[key] == null || worker[key] === '') continue
    const value = Number(worker[key])
    if (!Number.isFinite(value) || value < 0 || (key === 'seniority_rate' && value > 1)) return 'Montant ou taux invalide'
  }
  return null
}
