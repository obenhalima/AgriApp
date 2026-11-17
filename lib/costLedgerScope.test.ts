import {expect,it} from 'vitest'
import {costFarmId,groupCostAllocations} from './costLedgerScope'

it('groups distributed stock costs once and retains their allocations',()=>{
  const entries=[
    {id:'a',source_stock_movement_id:'movement',amount:30,greenhouse_id:'S1'},
    {id:'b',source_stock_movement_id:'movement',amount:70,greenhouse_id:'S2'},
    {id:'c',amount:20,description:'same description'},
    {id:'d',amount:20,description:'same description'},
  ]
  const rows=groupCostAllocations(entries)
  expect(rows).toHaveLength(3)
  expect(rows[0].amount).toBe(100)
  expect(rows[0].allocations.map((entry:any)=>entry.greenhouse_id)).toEqual(['S1','S2'])
  expect(rows.reduce((sum,row)=>sum+row.amount,0)).toBe(140)
  expect(groupCostAllocations(entries.filter(entry=>entry.greenhouse_id==='S1'))[0].amount).toBe(30)
})

it('uses the greenhouse farm before the campaign farm and retains common farm costs',()=>{
  expect(costFarmId({greenhouses:{farm_id:'farm2'},campaigns:{farm_id:'farm1'}})).toBe('farm2')
  expect(costFarmId({campaigns:{farm_id:'farm1'}})).toBe('farm1')
  expect(costFarmId({})).toBe('')
})
