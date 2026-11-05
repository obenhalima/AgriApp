export type ColumnSelections = Record<string, string[]>

export function filterSearch(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim()
}

export function matchesColumns(values: string[], selections: ColumnSelections) {
  return Object.entries(selections).every(([column, accepted]) => accepted.includes(values[Number(column)] ?? ''))
}

export type TableColumn = { index: number; label: string; host: HTMLElement }
export type TableFilterRow = { element: HTMLTableRowElement; values: string[]; kind: 'data' | 'group' | 'summary'; depth: number }

function cellValue(cell: HTMLTableCellElement) {
  if (cell.dataset.filterValue !== undefined) return cell.dataset.filterValue
  const copy = cell.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[data-column-filter-ui],button,script,style,[aria-hidden="true"]').forEach(el => el.remove())
  const fields = Array.from(cell.querySelectorAll('input:not([type="hidden"]),select,textarea'))
  if (fields.length) return fields.map(field => {
    if (field instanceof HTMLSelectElement) return Array.from(field.selectedOptions).map(option => option.text).join(', ')
    if (field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type)) return field.checked ? '✓' : '—'
    return (field as HTMLInputElement).value
  }).join(' · ').trim()
  return (copy.textContent || '').replace(/\s+/g, ' ').trim()
}

function headerLabel(cell: HTMLTableCellElement) {
  const copy=cell.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[data-column-filter-ui],svg,input,select,textarea,[aria-hidden="true"]').forEach(element=>element.remove())
  return (copy.textContent||'').replace(/\s+/g,' ').replace(/[▾▴▸▲▼↕]/g,'').trim()
}

export function readFilterTable(table: HTMLTableElement) {
  const headerRows = table.tHead ? Array.from(table.tHead.rows) : Array.from(table.rows).slice(0, 1).filter(row => row.querySelector('th'))
  const grid: HTMLTableCellElement[][] = []
  headerRows.forEach((row, y) => {
    grid[y] ||= []
    let x = 0
    Array.from(row.cells).forEach(cell => {
      while (grid[y][x]) x++
      for (let dy = 0; dy < cell.rowSpan; dy++) {
        grid[y + dy] ||= []
        for (let dx = 0; dx < cell.colSpan; dx++) grid[y + dy][x + dx] = cell
      }
      x += cell.colSpan
    })
  })
  const columns: TableColumn[] = []
  const leafRow = grid[grid.length - 1] || []
  leafRow.forEach((_leaf, index) => {
    const cell=[...grid].reverse().map(row=>row[index]).find(header=>header && header.colSpan===1 && headerLabel(header))
    if(!cell)return
    const label = headerLabel(cell)
    if (cell.colSpan !== 1 || !label || /^(actions?|détails|details|الإجراءات)$/i.test(label) || cell.dataset.columnFilter === 'off') return
    let host = cell.querySelector<HTMLElement>(':scope > [data-column-filter-ui]')
    if (!host) {
      host = document.createElement('span')
      host.dataset.columnFilterUi = 'true'
      host.className = 'inline-flex align-middle ms-1 print:hidden'
      cell.appendChild(host)
    }
    const labels=Array.from(new Set(grid.map(row=>row[index]).filter(Boolean).map(header=>headerLabel(header)).filter(Boolean)))
    columns.push({ index, label:labels.join(' · '), host })
  })
  const rows: TableFilterRow[] = []
  const spans: { value: string; remaining: number }[] = []
  Array.from(table.tBodies).forEach(body => Array.from(body.rows).forEach(row => {
    if (headerRows.includes(row)) return
    const values: string[] = []
    spans.forEach((span, index) => { if (span.remaining > 0) { values[index] = span.value; span.remaining-- } })
    let index = 0
    Array.from(row.cells).forEach(cell => {
      while (values[index] !== undefined) index++
      const value = cellValue(cell)
      for (let dx = 0; dx < cell.colSpan; dx++) {
        values[index + dx] = value
        if (cell.rowSpan > 1) spans[index + dx] = { value, remaining: cell.rowSpan - 1 }
      }
      index += cell.colSpan
    })
    const groupCell = Array.from(row.cells).find(cell => cell.colSpan > 1)
    const firstValue = values.find(value => value.trim()) || ''
    const summary = row.dataset.filterSummary === 'true' || /^(total\b|sous.total\b|ebitda\b|résultat\b|resultat\b|المجموع|الإجمالي)/i.test(firstValue)
    rows.push({ element: row, values, kind: summary ? 'summary' : groupCell ? 'group' : 'data', depth: Number(row.dataset.filterDepth || parseFloat(groupCell?.style.paddingLeft || '0')) })
  }))
  return { columns, rows }
}

export function applyTableSelections(rows: TableFilterRow[], selections: ColumnSelections) {
  const active = Object.keys(selections).length > 0
  const groups: TableFilterRow[] = []
  const visibleGroups = new Set<HTMLTableRowElement>()
  let visible = 0
  for (const row of rows) {
    if (row.kind === 'group') {
      while (groups.length && groups[groups.length - 1].depth >= row.depth) groups.pop()
      groups.push(row)
    } else if (row.kind === 'data') {
      const match = !active || matchesColumns(row.values, selections)
      row.element.toggleAttribute('data-column-filter-hidden', !match)
      if (match) { visible++; groups.forEach(group => visibleGroups.add(group.element)) }
    }
  }
  rows.filter(row => row.kind !== 'data').forEach(row => {
    row.element.toggleAttribute('data-column-filter-hidden', active && (row.kind === 'group' ? !visibleGroups.has(row.element) : visible === 0))
  })
  return visible
}
