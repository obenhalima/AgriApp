import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

describe('Couverture des tableaux de l’application', () => {
  it('utilise le moteur commun pour tous les tableaux JSX', () => {
    const nativeTables: string[] = []
    let covered = 0
    function inspect(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) { inspect(file); continue }
        if (!file.endsWith('.tsx')) continue
        const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        function visit(node: ts.Node) {
          if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = node.tagName.getText(source)
            if (tag === 'FilterableTable' || tag === 'DataTable') covered++
            if (tag === 'table' && !file.endsWith(path.join('ui', 'FilterableTable.tsx'))) nativeTables.push(file)
          }
          ts.forEachChild(node, visit)
        }
        visit(source)
      }
    }
    inspect('app')
    inspect('components')
    expect(nativeTables).toEqual([])
    expect(covered).toBeGreaterThan(60)
  }, 60000)
})
