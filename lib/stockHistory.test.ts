import {describe,it,expect} from 'vitest'
import ExcelJS from 'exceljs'
import {checkStockHistory,HISTORY_COLUMNS,historyPayload,type HistoryCatalog,type HistoryRow} from './stockHistory'
import {stockHistoryWorkbook,readStockHistoryWorkbook} from './stockHistoryWorkbook'

const catalog:HistoryCatalog={items:[{id:'i',code:'E1',name:'Engrais',unit:'kg',category:'engrais'}],warehouses:[{id:'w',code:'D1',name:'Principal',farm_id:'f',farm_code:'F1',farm_name:'501'}],suppliers:[{code:'FO1',name:'Fournisseur'}],plantings:[{ref:'P-one',id:'p1',campaign:'C1',campaign_name:'2026',farm:'F1',greenhouse:'S1',variety:'Tomate',area:100},{ref:'P-two',id:'p2',campaign:'C1',campaign_name:'2026',farm:'F1',greenhouse:'S2',variety:'Tomate',area:300}],balances:[],movement_count:0}
const row=(patch:Partial<HistoryRow>={}):HistoryRow=>({line:2,external_id:'H1',date:'2026-09-01',order:'1',type:'entree',item:'E1',unit:'kg',warehouse:'D1',quantity:'10',price:'',reference:'',supplier:'',farm:'F1',campaign:'',plantings:'',notes:'',...patch})
const check=(rows:HistoryRow[])=>checkStockHistory(rows,catalog,'2026-11-07')
describe('Stock history reference workbook',()=>{
 it('requires entry prices for FIFO and accepts a confirmed zero price',()=>{
  expect(checkStockHistory([row()],{...catalog,cost_method:'fifo'},'2026-11-12').issues).toHaveLength(1)
  expect(checkStockHistory([row({price:'0'})],{...catalog,cost_method:'fifo'},'2026-11-12').issues).toEqual([])
  expect(checkStockHistory([row()],{...catalog,cost_method:'cump'},'2026-11-12').issues).toEqual([])
 })
 it('keeps unknown prices distinct from zero and normalizes localized quantities',()=>{
  expect(check([row({quantity:'10,50'})])).toMatchObject({issues:[],rows:[{quantity:'10.50',price:''}]})
  expect(check([row({price:'0'})])).toMatchObject({issues:[],rows:[{price:'0.00000000'}]})
  expect(historyPayload([row()])[0]).not.toHaveProperty('line')
 })
 it('requires exact units, dates, stable ids, chronological ordering and known references',()=>{
  for(const patch of [{quantity:'-1'},{quantity:'NaN'},{quantity:'0'},{quantity:'0.001'},{unit:'L'},{date:'2026-02-30'},{date:'2999-01-01'},{order:'1.5'},{item:'OTHER'},{warehouse:'OTHER'},{farm:'OTHER'},{supplier:'UNKNOWN'}])expect(check([row(patch)]).issues.length,JSON.stringify(patch)).toBeGreaterThan(0)
  expect(check([row(),row({line:3})]).issues.length).toBeGreaterThan(0)
  expect(check([row(),row({external_id:'H2',line:3})]).issues.length).toBeGreaterThan(0)
 })
 it('accepts multiple planting references only within the farm and campaign',()=>{
  const exit=row({type:'sortie',campaign:'C1',plantings:'P-one ; P-two'})
  expect(check([exit]).issues).toEqual([])
  for(const patch of [{plantings:'P-one;P-one'},{plantings:'OTHER'},{plantings:''},{campaign:'OTHER'},{price:'2'},{supplier:'FO1'}])expect(check([{...exit,...patch}]).issues.length).toBeGreaterThan(0)
 })
 it('exports all tenant references and existing balances with an empty entry sheet',async()=>{
  const bytes=await(await stockHistoryWorkbook('tenant','501',catalog)).arrayBuffer()
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes)
  expect(wb.getWorksheet('Ref_Articles')!.getCell('A2').value).toBe('E1')
  expect(wb.getWorksheet('Ref_Plantations')!.getCell('A3').value).toBe('P-two')
  expect(check(await readStockHistoryWorkbook(bytes,'tenant')).rows).toEqual([])
  await expect(readStockHistoryWorkbook(bytes,'other')).rejects.toThrow('client actif')
  const sheet=wb.getWorksheet('Mouvements')!
  HISTORY_COLUMNS.forEach(([key],index)=>sheet.getCell(2,index+1).value=row()[key])
  sheet.getCell('B2').value=new Date('2026-09-01T00:00:00Z')
  const entered=await wb.xlsx.writeBuffer()
  expect(check(await readStockHistoryWorkbook(entered as ArrayBuffer,'tenant')).issues).toEqual([])
  sheet.getCell('H2').value={formula:'10+1',result:11}
  await expect(readStockHistoryWorkbook(await wb.xlsx.writeBuffer() as ArrayBuffer,'tenant')).rejects.toThrow('formules')
 })
})
