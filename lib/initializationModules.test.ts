import { expect, it } from 'vitest'
import { emptyInitDraft } from './initialization'
import { initializationModuleSections, initializationModuleProgress } from './initializationModules'
it('separates infrastructure from campaigns and plantations',()=>{
 expect(initializationModuleSections('exploitation').map(s=>s.key)).toEqual(['farms','greenhouses','varieties'])
 expect(initializationModuleSections('plantations').map(s=>s.key)).toEqual(['campaigns','plantings'])
})
it('does not require stocks, HR or finance to prepare a selected module',()=>{
 const draft=emptyInitDraft()
 draft.rows.people=[{code:'broken'}]
 const progress=initializationModuleProgress(draft,'plantations')
 expect(progress.total).toBe(2)
 expect(progress.complete).toBe(0)
 expect(progress.issues.every(issue=>['campaigns','plantings'].includes(issue.section))).toBe(true)
 expect(draft.rows.people).toEqual([{code:'broken'}])
})
