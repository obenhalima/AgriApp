import { describe, it, expect } from 'vitest'
import { emptyInitDraft, INIT_SECTIONS, initNumber, initProgress, isInitDraft, newInitRow, updateInitRows, validateInit } from './initialization'
import { initializationWorkbook, readInitializationWorkbook } from './initializationWorkbook'

const examples = () => ({ ...emptyInitDraft(), rows: Object.fromEntries(INIT_SECTIONS.map(s => [s.key, [Object.fromEntries(s.fields.map(f => [f.key, f.example || '']))]])) })
describe('initialization preparation', () => {
  it('roundtrips every declared field in every step without dropping relationships', async () => {
    const draft = emptyInitDraft()
    for (const section of INIT_SECTIONS) draft.rows[section.key] = [Object.fromEntries(section.fields.map(field => [field.key, field.type === 'number' ? '17.25' : field.type === 'date' ? '2026-09-21' : field.type === 'month' ? '2026-09' : `value-${field.key}`]))]
    const bytes = await (await initializationWorkbook('qa', draft)).arrayBuffer()
    expect(await readInitializationWorkbook(bytes, 'qa')).toEqual(draft.rows)
  }, 60000)
  it('keeps complete article fields and uses entered reference chains in Excel', async () => {
    const d = examples()
    Object.assign(d.rows.products[0], { min_qty: '12', unit_cost: '45.50', location: 'Rayon B', phyto_product: '' })
    d.rows.farms[0].code = 'FERME-REELLE'
    d.rows.warehouses[0].farm = 'FERME-REELLE'
    const bytes = await (await initializationWorkbook('qa', d, undefined, 'opening_stock')).arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(bytes, { type: 'array' })
    expect(wb.Sheets.Ref_farms.A2.v).toBe('FERME-REELLE')
    const refs = XLSX.utils.sheet_to_json(wb.Sheets.Ref_products)
    expect(refs[0]).toMatchObject({ location: 'Rayon B', min_qty: '12', unit_cost: '45.50' })
    const article = await (await initializationWorkbook('qa', d, undefined, 'products')).arrayBuffer()
    expect((await readInitializationWorkbook(article, 'qa', 'products')).products[0]).toMatchObject({ location: 'Rayon B', min_qty: '12', unit_cost: '45.5' })
  }, 60000)
  it('exports only the active entry sheet, prefilled, and preserves other steps on import', async () => {
    const d = examples()
    d.reviewed = ['farms', 'products']
    const bytes = await (await initializationWorkbook('qa', d, undefined, 'products')).arrayBuffer()
    const imported = await readInitializationWorkbook(bytes, 'qa', 'products')
    expect(Object.keys(imported)).toEqual(['products'])
    expect(imported.products[0].name).toBe(d.rows.products[0].name)
    const next = updateInitRows(d, 'products', imported.products)
    expect(next.rows.farms).toEqual(d.rows.farms)
    expect(next.reviewed).toContain('farms')
    await expect(readInitializationWorkbook(bytes, 'qa', 'farms')).rejects.toThrow('autre étape')
  }, 60000)
  it('includes earlier draft references as informative sheets and scopes legacy full-workbook imports', async () => {
    const d = examples()
    const bytes = await (await initializationWorkbook('qa', d, undefined, 'greenhouses')).arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(bytes, { type: 'array' })
    expect(wb.Sheets.Ref_farms.A2.v).toBe('F01')
    expect(wb.Sheets.farms).toBeUndefined()
    const full = await (await initializationWorkbook('qa', d)).arrayBuffer()
    expect(Object.keys(await readInitializationWorkbook(full, 'qa', 'products'))).toEqual(['products'])
  }, 60000)
  it('generates business codes without colliding with existing or draft records', () => {
    const d = emptyInitDraft(); d.rows.farms = [{ code: 'FER-0002', name: 'B' }]
    const catalog = { crops: [], varieties: [], farms: [{ code: 'FER-0001', name: 'A', existing_id: 'f1' }] }
    expect(newInitRow(INIT_SECTIONS[0], d, catalog).code).toBe('FER-0003')
  })
  it('resolves existing farms and rejects stale linked records', () => {
    const d = emptyInitDraft()
    d.rows.warehouses = [{ code: 'E', name: 'Stock', farm: 'F1' }]
    const catalog = { crops: [], varieties: [], farms: [{ code: 'F1', name: 'Existing', existing_id: 'f1' }] }
    expect(validateInit(d, catalog)).toEqual([])
    d.rows.farms = [{ code: 'F1', name: 'Changed', existing_id: 'f1' }]
    expect(validateInit(d, catalog).some(i => i.message.includes('Fiche liée modifiée'))).toBe(true)
  })
  it('distinguishes blank and zero and accepts French numbers', () => {
    expect(initNumber('')).toBeNaN(); expect(initNumber('0')).toBe(0); expect(initNumber('1 500,25')).toBe(1500.25)
  })
  it('does not complete empty steps', () => {
    const draft = emptyInitDraft(); draft.reviewed = INIT_SECTIONS.map(s => s.key)
    expect(initProgress(draft).complete).toBe(0)
  })
  it('detects duplicate codes without case sensitivity', () => {
    const d = emptyInitDraft(); d.rows.farms = [{ code: 'F01', name: 'A' }, { code: ' f01 ', name: 'B' }]
    expect(validateInit(d).some(i => i.message.includes('dupliqué'))).toBe(true)
  })
  it('checks dates, references and surface', () => {
    const d = examples(); d.rows.greenhouses[0].usable_area = '12000'; d.rows.plantings[0].date = '2026-02-30'; d.rows.warehouses[0].farm = 'missing'
    const errors = validateInit(d)
    expect(errors.some(i => i.field === 'usable_area')).toBe(true)
    expect(errors.some(i => i.field === 'date' && i.message.startsWith('Date'))).toBe(true)
    expect(errors.some(i => i.field === 'farm')).toBe(true)
  })
  it('does not value stock at zero when price is absent', () => {
    const d = examples(); d.rows.opening_stock[0].price = ''
    expect(validateInit(d).some(i => i.section === 'opening_stock' && i.warning)).toBe(true)
  })
  it('requires valuation evidence even for an explicit zero', () => {
    const d = examples(); d.rows.opening_stock[0].price = '0'
    expect(validateInit(d).some(i => i.section === 'opening_stock' && i.field === 'evidence')).toBe(true)
  })
  it('checks budget period and does not permit negative quantities', () => {
    const d = examples(); d.rows.budget[0].period = '2028-09'; d.rows.budget[0].quantity = '-1'
    expect(validateInit(d).filter(i => i.section === 'budget')).toHaveLength(2)
  })
  it('invalidates reviews after edits', () => {
    const d = examples(); d.reviewed = ['farms', 'greenhouses']
    expect(updateInitRows(d, 'farms', []).reviewed).toEqual([])
  })
  it('rejects malformed drafts before rendering', () => {
    expect(isInitDraft(emptyInitDraft())).toBe(true)
    expect(isInitDraft({ ...emptyInitDraft(), rows: { farms: [{ code: 15 }] } })).toBe(false)
    expect(isInitDraft({ ...emptyInitDraft(), skipped: ['farms'] })).toBe(false)
  })
  it('accepts existing varieties for plantings without copying them to draft', () => {
    const d = examples(); d.rows.varieties = []
    const catalog = { crops: [{ code: 'TOM', name: 'Tomate' }], varieties: [{ code: 'MARQ', name: 'Marquise', crop: 'TOM', existing_id: 'v1' }] }
    expect(validateInit(d, catalog).some(i => i.field === 'variety')).toBe(false)
  })
  it('detects existing code collisions, unknown crops and tampered links', () => {
    const d = examples()
    const catalog = { crops: [{ code: 'TOM', name: 'Tomate' }], varieties: [{ code: 'MARQ', name: 'Marquise', crop: 'TOM', existing_id: 'v1' }] }
    expect(validateInit(d, catalog).some(i => i.section === 'varieties' && i.field === 'code')).toBe(true)
    d.rows.varieties = [{ ...catalog.varieties[0] }]
    expect(validateInit(d, catalog).filter(i => i.section === 'varieties')).toEqual([])
    d.rows.varieties[0].crop = 'UNKNOWN'
    expect(validateInit(d, catalog).some(i => i.field === 'crop')).toBe(true)
    expect(validateInit(d, catalog).some(i => i.field === 'existing_id')).toBe(true)
  })
  it('preserves existing variety identifiers in Excel without importing reference sheets', async () => {
    const d = emptyInitDraft()
    const catalog = { crops: [{ code: 'TOM', name: 'Tomate' }], varieties: [{ code: 'MARQ', name: 'Marquise', crop: 'TOM', existing_id: 'v1' }] }
    d.rows.varieties = catalog.varieties
    const bytes = await (await initializationWorkbook('qa-domain', d, catalog)).arrayBuffer()
    const rows = await readInitializationWorkbook(bytes, 'qa-domain')
    expect(rows.varieties[0].existing_id).toBe('v1')
    expect(rows.Ref_cultures).toBeUndefined()
  }, 60000)
  it('roundtrips a template without importing examples', async () => {
    const blob = await initializationWorkbook('qa-domain')
    const data = await readInitializationWorkbook(await blob.arrayBuffer(), 'qa-domain')
    expect(Object.keys(data)).toHaveLength(INIT_SECTIONS.length)
    expect(Object.values(data).every(rows => !rows.length)).toBe(true)
  }, 60000)
  it('roundtrips draft data and rejects a different client', async () => {
    const d = examples(); d.rows.budget[0].price = '1 234,56'
    const bytes = await (await initializationWorkbook('qa-domain', d)).arrayBuffer()
    expect(initNumber((await readInitializationWorkbook(bytes, 'qa-domain')).budget[0].price)).toBe(1234.56)
    await expect(readInitializationWorkbook(bytes, 'other-domain')).rejects.toThrow('client actif')
  }, 60000)
})
