import { z } from 'npm:zod@4.1.13'

const str = z.string().nullable()
const num = z.number().finite().nullable()
const fields = (keys: string[]) => Object.fromEntries(keys.map(key => [key, str])) as Record<string, typeof str>

export const invoiceSchema = z.strictObject({
  supplier: z.strictObject(fields(['name','ice','if_number','rc','patente','address','city','phone','email','rib'])),
  customer: z.strictObject({ name: str, ice: str }),
  invoice: z.strictObject(fields(['number','date','due_date','currency','purchase_order_ref','delivery_note_ref','payment_terms','payment_method'])),
  lines: z.array(z.strictObject({
    description: str, product_code: str, quantity: num, unit: str, packaging: str,
    unit_price_ht: num, discount_pct: num, vat_rate: num, amount_ht: num, lot_number: str,
  })),
  totals: z.strictObject({
    total_ht: num, total_discount: num, total_vat: num, stamp_duty: num, total_ttc: num,
    vat_breakdown: z.array(z.strictObject({ rate: num, base: num, amount: num })),
  }),
  confidence: z.record(z.string(), z.number().min(0).max(1)),
  warnings: z.array(z.string()),
})
export type InvoiceData = z.infer<typeof invoiceSchema>
export const jsonSchema = z.toJSONSchema(invoiceSchema)
