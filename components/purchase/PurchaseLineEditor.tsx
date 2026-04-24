'use client'
import { useState } from 'react'
import { StockItemCreateModal } from '@/components/stock/StockItemCreateModal'

export type PurchaseLineDraft = {
  itemDescription: string
  unit: string
  quantity: string
  unitPrice: string
  stockItemId: string
}

export const EMPTY_PURCHASE_LINE: PurchaseLineDraft = {
  itemDescription: '', unit: '', quantity: '', unitPrice: '', stockItemId: '',
}

export type StockItemLite = { id: string; name: string; unit: string | null; code?: string }

type Props = {
  lines: PurchaseLineDraft[]
  onChange: (next: PurchaseLineDraft[]) => void
  stockItems: StockItemLite[]
  onStockItemsRefresh?: () => Promise<void> | void
  showPriceColumn?: boolean   // masquer si le parcours n'en a pas besoin
}

export function PurchaseLineEditor({ lines, onChange, stockItems, onStockItemsRefresh, showPriceColumn = true }: Props) {
  const [modalIdx, setModalIdx] = useState<number | null>(null)

  const patch = (i: number, p: Partial<PurchaseLineDraft>) =>
    onChange(lines.map((l, idx) => idx === i ? { ...l, ...p } : l))

  const selectStock = (i: number, id: string) => {
    const it = stockItems.find(x => x.id === id)
    patch(i, {
      stockItemId: id,
      itemDescription: it ? it.name : '',
      unit: it?.unit ?? '',
    })
  }

  const add = () => onChange([...lines, { ...EMPTY_PURCHASE_LINE }])
  const remove = (i: number) => {
    if (lines.length <= 1) return
    onChange(lines.filter((_, idx) => idx !== i))
  }

  const cols = showPriceColumn
    ? '2fr .5fr .8fr .9fr auto'
    : '2fr .6fr .9fr auto'

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span>ARTICLE STOCK *</span>
                <button type="button" onClick={() => setModalIdx(i)}
                  style={{ background: 'transparent', border: '1px solid var(--neon)40', color: 'var(--neon)', borderRadius: 4, padding: '1px 6px', fontSize: 10, cursor: 'pointer' }}>
                  + nouveau
                </button>
              </div>
              <select value={line.stockItemId} onChange={e => selectStock(i, e.target.value)}
                style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)',
                  border: `1px solid ${line.stockItemId ? 'var(--bd-1)' : 'var(--amber)60'}`,
                  borderRadius: 5, fontSize: 11 }}>
                <option value="">— sélectionner —</option>
                {stockItems.map(si => <option key={si.id} value={si.id}>{si.name}{si.unit ? ` (${si.unit})` : ''}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>UNITÉ</div>
              <input value={line.unit} readOnly
                style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-3)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>QUANTITÉ *</div>
              <input type="number" value={line.quantity} onChange={e => patch(i, { quantity: e.target.value })}
                style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 12 }} />
            </div>
            {showPriceColumn && (
              <div>
                <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>PRIX UNIT.</div>
                <input type="number" value={line.unitPrice} onChange={e => patch(i, { unitPrice: e.target.value })}
                  style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 12 }} />
              </div>
            )}
            <button onClick={() => remove(i)} disabled={lines.length === 1}
              title="Supprimer la ligne"
              style={{ border: '1px solid var(--bd-1)', background: 'transparent', color: 'var(--red)', borderRadius: 5, padding: '6px 8px', cursor: lines.length === 1 ? 'not-allowed' : 'pointer' }}>
              ✕
            </button>
          </div>
        ))}
        <button onClick={add} type="button"
          style={{ alignSelf: 'start', border: '1px dashed var(--bd-1)', background: 'transparent', color: 'var(--tx-2)', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
          + Ajouter une ligne
        </button>
      </div>

      <StockItemCreateModal
        open={modalIdx !== null}
        onClose={() => setModalIdx(null)}
        onCreated={async (item) => {
          await onStockItemsRefresh?.()
          if (modalIdx !== null) {
            patch(modalIdx, { stockItemId: item.id, itemDescription: item.name, unit: item.unit })
          }
          setModalIdx(null)
        }}
        initialName={modalIdx !== null ? lines[modalIdx]?.itemDescription ?? '' : ''}
        initialUnit={modalIdx !== null ? lines[modalIdx]?.unit ?? '' : ''}
      />
    </>
  )
}
