import {describe,it,expect,vi} from 'vitest'
import ExcelJS from 'exceljs'
vi.mock('./supabase',()=>({supabase:{}}))
import {productReviewWorkbook,readProductReviewWorkbook,sameReviewMovement,type ProductReviewContext} from './stockProductReview'

const context:ProductReviewContext={method:'cump',version:'a'.repeat(64),plantings:[],movements:[
 {id:'exit-1',item:'article',code:'ENG01',name:'Engrais',unit:'kg',quantity:10,date:'2026-10-01',reference:'BL1',warehouse:'Principal',farm:'farm',price:null,fixed:true,linked:false},
 {id:'exit-2',item:'article',code:'ENG01',name:'Engrais',unit:'kg',quantity:5,date:'2026-10-02',reference:'BL2',warehouse:'Principal',farm:'farm',price:12,fixed:true,linked:false},
]}
async function workbook(value=context){
 const blob=await productReviewWorkbook('domain',value)
 const book=new ExcelJS.Workbook()
 await book.xlsx.load(await blob.arrayBuffer())
 return book
}
async function read(book:ExcelJS.Workbook,domain='domain'){
 return readProductReviewWorkbook(await book.xlsx.writeBuffer() as ArrayBuffer,domain)
}
describe('product reconciliation workbook',()=>{
 it('compares allocation values independently of JSON key order and rejects real changes',()=>{
  const target={area:100,campaign_id:'c',greenhouse_id:'g',planting_id:'p',variety_id:'v'}
  const original={...context.movements[0],targets:[target]}
  const current={...context.movements[0],targets:[{planting_id:'p',variety_id:'v',greenhouse_id:'g',campaign_id:'c',area:100}]}
  expect(sameReviewMovement(current,original)).toBe(true)
  expect(sameReviewMovement({...current,quantity:11},original)).toBe(false)
  expect(sameReviewMovement({...current,targets:[{...target,area:200}]},original)).toBe(false)
 })
 it('reads saved numeric price formula results without evaluating external links',async()=>{
  const book=await workbook({...context,movements:[context.movements[0]]})
  book.getWorksheet('Produits')!.getCell('E2').value={formula:"VLOOKUP(B2,'[prices.xlsx]Prices'!B:D,3,0)",result:5.45}
  const result=await readProductReviewWorkbook(await book.xlsx.writeBuffer() as ArrayBuffer,'domain',{allowPartial:true,allowCachedPrices:true,fallbackReason:'Prix de la ferme'})
  expect(result.rows[0].price).toBe('5.45')
  expect(result.formulaPrices).toBe(1)
  book.getWorksheet('Produits')!.getCell('E2').value={formula:'1+2'}
  await expect(readProductReviewWorkbook(await book.xlsx.writeBuffer() as ArrayBuffer,'domain',{allowPartial:true,allowCachedPrices:true,fallbackReason:'Prix de la ferme'})).rejects.toThrow('Aucun CUMP')
 })
 it('imports priced products with a shared source while leaving missing CUMP pending',async()=>{
  const source={...context,movements:[...context.movements,{...context.movements[0],id:'exit-3',item:'other',code:'ENG02',name:'Autre engrais'}]}
  const book=await workbook(source)
  book.getWorksheet('Produits')!.getCell('E2').value='8,50'
  const result=await readProductReviewWorkbook(await book.xlsx.writeBuffer() as ArrayBuffer,'domain',{allowPartial:true,fallbackReason:'Prix communiqués par la ferme'})
  expect(result.rows.map(row=>row.id)).toEqual(['exit-1','exit-2'])
  expect(result.rows.map(row=>row.price)).toEqual(['8.50','12'])
  expect(result.rows.every(row=>row.reason==='Prix communiqués par la ferme')).toBe(true)
  expect(result.skippedProducts).toEqual(['ENG02'])
 })
 it('requires at least one price and rejects invalid supplied prices during a partial import',async()=>{
  const source={...context,movements:[context.movements[0]]}
  const book=await workbook(source)
  const readPartial=async()=>readProductReviewWorkbook(await book.xlsx.writeBuffer() as ArrayBuffer,'domain',{allowPartial:true,fallbackReason:'Fichier reçu'})
  await expect(readPartial()).rejects.toThrow('Aucun CUMP')
  book.getWorksheet('Produits')!.getCell('E2').value='invalide'
  await expect(readPartial()).rejects.toThrow('CUMP et justificatif requis')
 })
 it('uses one CUMP for unknown exits and preserves calculated prices',async()=>{
  const book=await workbook()
  expect(book.getWorksheet('Produits')!.rowCount).toBe(2)
  book.getWorksheet('Produits')!.getCell('E2').value='8,50'
  book.getWorksheet('Produits')!.getCell('F2').value='Facture fournisseur'
  const result=await read(book)
  expect(result.rows.map(row=>row.price)).toEqual(['8.50','12'])
  expect(result.rows.map(row=>row.plantings)).toEqual([[],[]])
 })
 it('rejects a different client, changed quantity and formulas',async()=>{
  const book=await workbook()
  await expect(read(book,'other')).rejects.toThrow('client actif')
  book.getWorksheet('Produits')!.getCell('E2').value={formula:'1+2'}
  await expect(read(book)).rejects.toThrow('formules')
  book.getWorksheet('Produits')!.getCell('E2').value=8
  book.getWorksheet('Produits')!.getCell('F2').value='Justification'
  book.getWorksheet('Sorties')!.getCell('D2').value=99
  await expect(read(book)).rejects.toThrow('sortie modifiée')
 })
 it('exports FIFO exits and prevents overriding receipt-derived PU',async()=>{
  const book=await workbook({...context,method:'fifo',movements:context.movements.map(m=>({...m,price:9}))})
  expect(book.getWorksheet('Produits')).toBeUndefined()
  expect((await read(book)).rows.map(row=>row.price)).toEqual(['9','9'])
  book.getWorksheet('Sorties')!.getCell('G2').value=11
  await expect(read(book)).rejects.toThrow('PU calculé')
 })
 it('round trips context beyond the Excel cell text limit',async()=>{
  const large={...context,movements:Array.from({length:250},(_,index)=>({...context.movements[0],id:`exit-${index}`,price:9}))}
  const book=await workbook(large)
  expect(book.getWorksheet('_itr_review')!.rowCount).toBeGreaterThan(3)
  expect((await read(book)).rows).toHaveLength(250)
 })
})
