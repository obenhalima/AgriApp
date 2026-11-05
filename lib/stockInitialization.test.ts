import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { checkStockInitialization, STOCK_COLUMNS, stockPayload, type StockInput } from './stockInitialization'
import { stockInitializationWorkbook, readStockInitializationWorkbook } from './stockInitializationWorkbook'
import type { InitCatalog } from './initialization'
const catalog: InitCatalog = { crops: [], varieties: [], products: [], farms: [{code:'F01',name:'501'}], warehouses: [{code:'D1',name:'Principal',farm:'F01'}], stock_categories: [{code:'engrais',name:'Engrais'}], units: [{code:'kg',name:'Kilogramme'}] }
const row = (overrides: Partial<StockInput> = {}): StockInput => ({ line: 2, code:'ENG01',name:'Engrais test',category:'engrais',unit:'kg',warehouse:'D1',date:'2026-11-03',quantity:'',price:'',evidence:'',notes:'',...overrides })
const check = (rows: StockInput[], refs=catalog) => checkStockInitialization(rows, refs, '2026-11-04')
describe('ItriX articles and stock initialization', () => {
  it('creates a catalogue-only article, preserves unknown costs and distinguishes zero', () => {
    expect(check([row()])).toMatchObject({ created:1, positive:0, zero:0, unvalued:0 })
    expect(check([row({quantity:'0'})])).toMatchObject({ zero:1, unvalued:0 })
    expect(check([row({quantity:'2,5'})])).toMatchObject({positive:1,unvalued:1})
    expect(check([row({quantity:'2,5'})]).rows[0]).toMatchObject({quantity:'2.50',price:''})
    expect(check([row({quantity:'1',price:'0',evidence:'Don'})]).issues).toEqual([])
    expect(stockPayload([row()])[0]).not.toHaveProperty('line')
  })
  it('checks known references, input precision and accurate Excel row numbers', () => {
    for (const change of [{unit:'L'}, {category:'invented'}, {quantity:'-1'}, {quantity:'1.001'}, {quantity:'Infinity'}, {quantity:'1',warehouse:'OTHER'}, {quantity:'1',date:'2026-11-05'}, {quantity:'1',date:'2026-02-30'}, {quantity:'1',price:'4'}, {price:'1'}]) {
      const result=check([row({line:44,...change})]); expect(result.issues.some(i=>!i.warning)).toBe(true); expect(result.issues[0].line).toBe(44)
    }
    expect(check([row({quantity:'1',price:'0.00000001',evidence:'Facture'})]).rows[0].price).toBe('0.00000001')
  })
  it('ignores untouched existing articles and refuses metadata changes and inactive articles', () => {
    const refs={...catalog,products:[{code:'ENG01',name:'Engrais test',category:'engrais',unit:'kg',is_active:'oui'}]}
    expect(check([row()],refs).rows).toEqual([])
    expect(check([row({quantity:'4'})],refs)).toMatchObject({created:0,reused:1,positive:1})
    expect(check([row({unit:'L'})],refs).issues.some(i=>!i.warning)).toBe(true)
    expect(check([row({code:'OTHER'})],refs).issues.some(i=>!i.warning)).toBe(true)
    expect(check([row({quantity:'0'})],{...refs,products:[{...refs.products[0],is_active:'non'}]}).issues.some(i=>!i.warning)).toBe(true)
  })
  it('rejects duplicate article/warehouse and contradictory definitions but accepts distinct warehouses', () => {
    expect(check([row({quantity:'1'}),row({line:3,quantity:'2'})]).issues.some(i=>!i.warning)).toBe(true)
    expect(check([row(),row({line:3,name:'Other'})]).issues.some(i=>!i.warning)).toBe(true)
    const refs={...catalog,warehouses:[...catalog.warehouses,{code:'D2',name:'Deux',farm:'F01'}]}
    expect(check([row({quantity:'1'}),row({line:3,warehouse:'D2',quantity:'2'})],refs)).toMatchObject({created:1,positive:2})
  })
  it('exports an empty-client template with references and reads user-entered new article stock',async()=>{
    const bytes=await (await stockInitializationWorkbook('tenant-a','501',catalog,'D1','2026-11-03')).arrayBuffer()
    const wb=new ExcelJS.Workbook(); await wb.xlsx.load(bytes)
    expect(wb.getWorksheet('Articles_Stock')!.getCell('A1').value).toBe('Code article')
    expect(wb.getWorksheet('Ref_Unites')!.getCell('A2').value).toBe('kg')
    expect(check(await readStockInitializationWorkbook(bytes,'tenant-a')).rows).toEqual([])
    const sheet=wb.getWorksheet('Articles_Stock')!
    sheet.getRow(2).values=['ENG01','Engrais test','engrais','kg','D1',new Date('2026-11-03T00:00:00Z'),2.5,null,'','Inventaire']
    const filled=await wb.xlsx.writeBuffer()
    const input=await readStockInitializationWorkbook(filled as ArrayBuffer,'tenant-a')
    expect(check(input)).toMatchObject({created:1,positive:1,unvalued:1})
    await expect(readStockInitializationWorkbook(filled as ArrayBuffer,'tenant-b')).rejects.toThrow('client actif')
    sheet.getCell('G2').value={formula:'1+1'}
    await expect(readStockInitializationWorkbook(await wb.xlsx.writeBuffer() as ArrayBuffer,'tenant-a')).rejects.toThrow('formules')
  },60000)
  it('preserves existing names, codes and units in the template',async()=>{
    const refs={...catalog,products:[{code:'ENG01',name:'Engrais test',category:'engrais',unit:'kg'}]}
    const blob=await stockInitializationWorkbook('tenant-a','501',refs,'D1','2026-11-03')
    const input=await readStockInitializationWorkbook(await blob.arrayBuffer(),'tenant-a')
    expect(input[0]).toMatchObject(row()); expect(check(input,refs).rows).toEqual([])
    expect(STOCK_COLUMNS).toHaveLength(10)
  },60000)
})
