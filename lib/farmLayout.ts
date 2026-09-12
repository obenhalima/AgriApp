export type FarmShape = { greenhouse_id: string; x: number; y: number; width: number; height: number; rotation: number }
export const PLAN_WIDTH = 1200
export const PLAN_HEIGHT = 800
export function normalizeShape(s: FarmShape): FarmShape {
  const safe = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback
  const width = Math.max(60, Math.min(300, safe(s.width, 140)))
  const height = Math.max(40, Math.min(300, safe(s.height, 80)))
  const rotation = ((Math.round(safe(s.rotation, 0) / 90) * 90) % 360 + 360) % 360
  const rotated = rotation === 90 || rotation === 270
  const halfW = (rotated ? height : width) / 2
  const halfH = (rotated ? width : height) / 2
  return { ...s, width, height, rotation,
    x: Math.max(halfW, Math.min(PLAN_WIDTH - halfW, safe(s.x, 100))),
    y: Math.max(halfH, Math.min(PLAN_HEIGHT - halfH, safe(s.y, 100))) }
}
export function newShape(id: string, index: number): FarmShape {
  return normalizeShape({ greenhouse_id: id, x: 110 + (index % 6) * 190, y: 80 + (Math.floor(index / 6) % 6) * 125, width: 150, height: 85, rotation: 0 })
}
export const formatPlanNumber = (value: number | null | undefined) => value == null || !Number.isFinite(value)
  ? 'Non renseigné' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
