import {it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {confirmDiscard} from './confirmDiscard'
it('closes an untouched dialog without a prompt',()=>{
 const confirm=vi.fn();expect(confirmDiscard(false,confirm)).toBe(true);expect(confirm).not.toHaveBeenCalled()
})
it('keeps unsaved entries when cancellation is rejected',()=>{expect(confirmDiscard(true,()=>false)).toBe(false)})
it('allows discarding only after confirmation',()=>{expect(confirmDiscard(true,()=>true)).toBe(true)})
it('guards backdrop, Escape, cross and shared Cancel handlers without intercepting save',()=>{
 const source=readFileSync(new URL('../components/ui/Modal.tsx',import.meta.url),'utf8')
 expect(source).toContain('if (!open) requestClose(onClose)')
 expect(source).toContain('onClick={()=>requestClose(onClose)}')
 expect(source).toContain('onClick={()=>requestClose(onCancel)}')
 expect(source).toContain('onClick={onSave}')
 expect(source).toContain('onInputCapture')
})
