import {describe,it,expect} from 'vitest'
import {existsSync} from 'node:fs'
import {harvestWorkflow} from './harvestWorkflowDocumentation'
describe('Documentation du parcours récolte',()=>{
 it('documente sept étapes avec action, impact et contrôle',()=>{
  expect(harvestWorkflow.stages).toHaveLength(7)
  for(const stage of harvestWorkflow.stages){expect(stage.action).toBeTruthy();expect(stage.result).toBeTruthy();expect(stage.next).toBeTruthy()}
 })
 it('distingue les trois modes de tarification',()=>{expect(harvestWorkflow.billing).toHaveLength(3);expect(harvestWorkflow.billing[1].behavior).toContain('n’appelle pas')})
 it('cite des fichiers existants',()=>{for(const source of harvestWorkflow.sources)expect(existsSync(source),source).toBe(true)})
})
