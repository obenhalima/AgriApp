import { emptyInitDraft, type InitCatalog } from './initialization'

/** Snapshot for review, not an import: every row retains its existing identity. */
export function draftFromExistingClientData(catalog: InitCatalog) {
  const draft=emptyInitDraft()
  for (const key of ['farms','greenhouses','campaigns','plantings']) {
    const rows=(catalog[key] || []).filter(row=>!!row.existing_id)
    if(rows.length) draft.rows[key]=rows.map(row=>({...row}))
  }
  // Legacy global varieties are not evidence of client ownership.
  const varieties=(catalog.client_varieties || []).filter(row=>!!row.existing_id)
  if(varieties.length) draft.rows.varieties=varieties.map(row=>({...row}))
  return draft
}
