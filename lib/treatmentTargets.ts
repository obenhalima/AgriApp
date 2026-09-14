/** A target belongs to a prescribed line, never to the whole mixture. */
export function treatmentTargetsSummary(lines: { target_name?: string }[]) {
  return [...new Set(lines.map(line => line.target_name?.trim()).filter(Boolean))].join(' / ')
}

export function resetLineTarget<T>(empty: T, id: string, name: string) {
  return { ...empty, biological_target_id: id, target_name: name }
}

export function duplicateTreatmentProduct(lines: { catalog_product_id?: string }[]) {
  const ids = lines.map(line => line.catalog_product_id).filter(Boolean)
  return new Set(ids).size !== ids.length
}
