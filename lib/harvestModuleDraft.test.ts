import {it,expect,vi,beforeEach} from 'vitest'
import {readFileSync} from 'node:fs'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),filters:[] as string[],draft:null as any}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc,from:()=>({select:()=>({eq:(key:string,value:string)=>{mocks.filters.push(`${key}:${value}`);return {maybeSingle:()=>Promise.resolve({data:mocks.draft,error:null})}}})})}}))
import {loadHarvestModuleDraft,saveHarvestModuleDraft,importSavedHarvestModule} from './harvestModuleDraft'
beforeEach(()=>{vi.clearAllMocks();mocks.filters=[];mocks.draft=null})
it('loads only the selected client draft',async()=>{
 mocks.draft={revision:1,input_data:{Recoltes:[]},import_rows:[],import_result:null}
 expect((await loadHarvestModuleDraft('client-a'))?.revision).toBe(1)
 expect(mocks.filters).toEqual(['domain_id:client-a'])
})
it('saves the controlled input and prepared rows with optimistic revision',async()=>{
 mocks.rpc.mockResolvedValue({data:2,error:null})
 expect(await saveHarvestModuleDraft('client-a',1,{Recoltes:[]},[])).toBe(2)
 expect(mocks.rpc).toHaveBeenCalledWith('save_harvest_module_draft',{p_domain:'client-a',p_revision:1,p_input:{Recoltes:[]},p_rows:[]})
})
it('imports the saved revision without trusting another client payload',async()=>{
 mocks.rpc.mockResolvedValue({data:{created:2,already_imported:0},error:null})
 expect((await importSavedHarvestModule('client-a',2)).created).toBe(2)
 expect(mocks.rpc).toHaveBeenCalledWith('import_saved_harvest_module',{p_domain:'client-a',p_revision:2})
})
it('reports the single required migration and does not silently fall back',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}})
 await expect(importSavedHarvestModule('client-a',1)).rejects.toThrow('SQL 160')
})
it('protects tenant data and atomically journals the existing import (source contract)',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/160_harvest_module_drafts.sql',import.meta.url),'utf8')
 expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(2)
 expect(sql).toContain("'recoltes','create'")
 expect(sql).toContain('domain_id=p_domain AND revision=p_revision FOR UPDATE')
 expect(sql).toContain('RETURN v_draft.import_result')
 expect(sql).toContain('public.import_historical_harvests(p_domain,v_draft.import_rows)')
 expect(sql).not.toContain('DELETE FROM')
 expect(sql).toContain('INSERT INTO public.harvest_module_history')
})
