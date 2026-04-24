// Constructeur de templates Excel avec contrôles NATIFS (dropdowns, dates, décimaux, oui/non)
// L'utilisateur ne peut pas entrer une valeur invalide : Excel bloque à la saisie.
// Utilise exceljs pour les data validations + formatage + frozen rows + cell notes.

import ExcelJS from 'exceljs'

export type ValidationSpec =
  | {
      type: 'list'
      /** Liste inline de valeurs (max ~255 caractères combinés) */
      values?: string[]
      /** Référence de plage dans une feuille (ex: "Fermes!$A$2:$A$999") */
      rangeRef?: string
      allowBlank?: boolean
      prompt?: string
      error?: string
    }
  | {
      type: 'date'
      min?: string      // YYYY-MM-DD
      max?: string
      allowBlank?: boolean
      prompt?: string
      error?: string
    }
  | {
      type: 'decimal' | 'whole'
      min?: number
      max?: number
      allowBlank?: boolean
      prompt?: string
      error?: string
    }
  | {
      type: 'textLength'
      min?: number
      max?: number
      allowBlank?: boolean
    }

export type ColumnSpec = {
  /** en-tête visible */
  header: string
  /** largeur en "caractères" */
  width?: number
  /** commentaire (note jaune) sur la cellule d'en-tête */
  note?: string
  /** validation appliquée à la plage de données (A2:A{dataRows+1}) */
  validation?: ValidationSpec
  /** format de nombre (ex: '#,##0.00', 'yyyy-mm-dd') */
  numFmt?: string
  /** fond de l'en-tête (hex sans #) */
  headerBg?: string
  /** texte en rouge si la cellule est vide ET marked as required */
  required?: boolean
}

export type ReferenceSheetSpec = {
  name: string
  headers: string[]
  rows: any[][]
  /** masquée par défaut ? */
  hidden?: boolean
  /** protégée en écriture ? */
  protected?: boolean
}

export type TemplateSpec = {
  /** feuille principale (cible) */
  targetSheet: {
    name: string
    columns: ColumnSpec[]
    /** exemple(s) de ligne à pré-remplir (sera en italique) */
    examples?: any[][]
    /** nombre de lignes préparées avec validations (défaut : 500) */
    dataRowsCount?: number
  }
  /** feuilles de référence (Fermes, Catégories, etc.) */
  referenceSheets?: ReferenceSheetSpec[]
  /** instructions en première feuille */
  instructions?: {
    title: string
    lines: string[]
  }
  /** titre du classeur */
  title?: string
  /** auteur */
  author?: string
}

// Couleurs thème
const COLOR_HEADER_BG = 'FF1E3A5F'    // bleu foncé
const COLOR_HEADER_FG = 'FFFFFFFF'
const COLOR_REQUIRED_BG = 'FF2563EB'   // bleu requis
const COLOR_EXAMPLE_FG = 'FF9CA3AF'   // gris italique
const COLOR_INSTRUCTIONS_TITLE = 'FF10B981'
const COLOR_REFERENCE_BG = 'FFF3F4F6'
const COLOR_REFERENCE_HDR = 'FF6B7280'

export async function buildTemplate(spec: TemplateSpec): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.creator = spec.author || 'FramPilot'
  wb.created = new Date()
  if (spec.title) wb.title = spec.title

  // ═══════════════════════════════════════════════════════════════
  // 1. Feuille INSTRUCTIONS (si fournie) — première feuille
  // ═══════════════════════════════════════════════════════════════
  if (spec.instructions) {
    const s = wb.addWorksheet('Instructions', {
      views: [{ showGridLines: false, zoomScale: 110 }],
    })
    s.columns = [{ width: 120 }]
    s.getCell('A1').value = spec.instructions.title
    s.getCell('A1').font = { bold: true, size: 18, color: { argb: COLOR_INSTRUCTIONS_TITLE } }
    s.getRow(1).height = 28
    spec.instructions.lines.forEach((line, i) => {
      const row = s.getCell(`A${i + 3}`)
      row.value = line
      row.font = { size: 11, color: { argb: 'FF374151' } }
      row.alignment = { vertical: 'top', wrapText: true }
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. Feuilles de RÉFÉRENCE (avant la feuille cible pour que les
  //    dropdowns puissent les référencer)
  // ═══════════════════════════════════════════════════════════════
  for (const ref of spec.referenceSheets ?? []) {
    const s = wb.addWorksheet(ref.name, {
      state: ref.hidden ? 'hidden' : 'visible',
      views: [{ state: 'frozen', ySplit: 1 }],
    })
    s.columns = ref.headers.map(h => ({
      header: h,
      key: h,
      width: Math.max(16, h.length + 4),
    }))
    // Style header
    s.getRow(1).eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_REFERENCE_HDR } }
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      c.alignment = { vertical: 'middle' }
    })
    s.getRow(1).height = 22
    for (const row of ref.rows) s.addRow(row)
    // Zebra sur les données
    for (let r = 2; r <= ref.rows.length + 1; r++) {
      if (r % 2 === 0) {
        s.getRow(r).eachCell(c => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_REFERENCE_BG } }
        })
      }
      s.getRow(r).font = { size: 10 }
    }
    // Auto-filter
    if (ref.rows.length > 0) {
      s.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: ref.rows.length + 1, column: ref.headers.length },
      }
    }
    if (ref.protected) {
      s.protect('', { selectLockedCells: true, selectUnlockedCells: true })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. Feuille CIBLE avec validations
  // ═══════════════════════════════════════════════════════════════
  const target = spec.targetSheet
  const dataRows = target.dataRowsCount ?? 500
  const s = wb.addWorksheet(target.name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  // Colonnes
  s.columns = target.columns.map(c => ({
    header: c.header,
    key: c.header,
    width: c.width ?? Math.max(14, c.header.length + 4),
    style: c.numFmt ? { numFmt: c.numFmt } : undefined,
  }))

  // Style en-tête
  s.getRow(1).eachCell((c, colNum) => {
    const col = target.columns[colNum - 1]
    c.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: col?.required ? COLOR_REQUIRED_BG : (col?.headerBg ? 'FF' + col.headerBg : COLOR_HEADER_BG) },
    }
    c.font = { bold: true, color: { argb: COLOR_HEADER_FG }, size: 11 }
    c.alignment = { vertical: 'middle', horizontal: 'left' }
    c.border = {
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
    }
    if (col?.note) {
      c.note = {
        texts: [{ text: col.note, font: { size: 10 } }],
        margins: { insetmode: 'custom', inset: [0.13, 0.13, 0.13, 0.13] } as any,
      } as any
    }
  })
  s.getRow(1).height = 26

  // Validations : appliquer à A2:A{dataRows+1} etc.
  for (let i = 0; i < target.columns.length; i++) {
    const col = target.columns[i]
    if (!col.validation) continue
    const colLetter = colLetterOf(i + 1)
    const range = `${colLetter}2:${colLetter}${dataRows + 1}`
    const v = col.validation
    const base: any = {
      allowBlank: v.type !== 'list' ? (v as any).allowBlank ?? true : (v as any).allowBlank ?? true,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Valeur invalide',
      showInputMessage: !!(v as any).prompt,
      promptTitle: (v as any).prompt ? col.header : undefined,
      prompt: (v as any).prompt,
    }
    if (v.type === 'list') {
      base.type = 'list'
      if (v.rangeRef) base.formulae = [v.rangeRef]
      else if (v.values) {
        // Inline quoted list. Max length ~255 chars.
        base.formulae = [`"${v.values.join(',')}"`]
      }
      base.error = v.error ?? 'Choisissez une valeur dans la liste.'
    } else if (v.type === 'date') {
      base.type = 'date'
      base.operator = v.min && v.max ? 'between' : v.min ? 'greaterThanOrEqual' : v.max ? 'lessThanOrEqual' : 'greaterThanOrEqual'
      if (v.min) base.formulae = [v.min]
      if (v.max) base.formulae = base.formulae ? [...base.formulae, v.max] : [v.max]
      if (!base.formulae) base.formulae = ['1900-01-01']
      base.error = v.error ?? 'Date invalide. Format : AAAA-MM-JJ.'
    } else if (v.type === 'decimal' || v.type === 'whole') {
      base.type = v.type
      base.operator = v.min !== undefined && v.max !== undefined ? 'between' :
                      v.min !== undefined ? 'greaterThanOrEqual' :
                      v.max !== undefined ? 'lessThanOrEqual' : 'greaterThanOrEqual'
      const fs: any[] = []
      if (v.min !== undefined) fs.push(v.min)
      if (v.max !== undefined) fs.push(v.max)
      if (fs.length === 0) fs.push(0)
      base.formulae = fs
      base.error = v.error ?? `Nombre invalide${v.min !== undefined ? ` (minimum : ${v.min})` : ''}.`
    } else if (v.type === 'textLength') {
      base.type = 'textLength'
      if (v.min !== undefined && v.max !== undefined) { base.operator = 'between'; base.formulae = [v.min, v.max] }
      else if (v.min !== undefined) { base.operator = 'greaterThanOrEqual'; base.formulae = [v.min] }
      else if (v.max !== undefined) { base.operator = 'lessThanOrEqual'; base.formulae = [v.max] }
    }
    ;(s as any).dataValidations.add(range, base)
  }

  // Lignes d'exemple (en italique gris)
  if (target.examples) {
    target.examples.forEach((ex, ri) => {
      const rowNum = ri + 2
      ex.forEach((val, ci) => {
        const cell = s.getCell(rowNum, ci + 1)
        cell.value = val
        cell.font = { italic: true, color: { argb: COLOR_EXAMPLE_FG }, size: 10 }
      })
    })
  }

  // Numéro de format + alignement sur les colonnes data
  for (let i = 0; i < target.columns.length; i++) {
    const col = target.columns[i]
    if (!col.numFmt) continue
    const colLetter = colLetterOf(i + 1)
    for (let r = 2; r <= dataRows + 1; r++) {
      s.getCell(`${colLetter}${r}`).numFmt = col.numFmt
    }
  }

  // AutoFilter sur l'en-tête
  s.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: target.columns.length },
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. Sérialiser en Blob
  // ═══════════════════════════════════════════════════════════════
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// A=1, B=2, ... Z=26, AA=27, ...
function colLetterOf(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
