import { supabase } from './supabase'

export type WorkflowState = {
  id: string
  definition_id: string
  code: string
  label: string
  description?: string | null
  color?: string | null
  is_initial: boolean
  is_final: boolean
  order_idx: number
}

export type WorkflowTransition = {
  id: string
  definition_id: string
  from_state_id: string
  to_state_id: string
  code: string
  label: string
  description?: string | null
  is_active: boolean
  order_idx: number
  requires_approval: boolean
  to_state?: WorkflowState
}

export type WorkflowDefinition = {
  id: string
  entity_type: string
  code: string
  name: string
  description?: string | null
  version: number
  is_active: boolean
  is_default: boolean
}

export type WorkflowHistoryEntry = {
  id: string
  entity_type: string
  entity_id: string
  from_state_code: string | null
  to_state_code: string
  transition_id: string | null
  performed_by: string | null
  comment: string | null
  created_at: string
}

/**
 * Récupère la définition active par défaut pour un type d'entité.
 */
export async function getDefaultDefinition(entityType: string): Promise<WorkflowDefinition | null> {
  const { data, error } = await supabase
    .from('workflow_definitions')
    .select('*')
    .eq('entity_type', entityType)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Récupère les états d'un workflow, triés par order_idx.
 */
export async function getStates(definitionId: string): Promise<WorkflowState[]> {
  const { data, error } = await supabase
    .from('workflow_states')
    .select('*')
    .eq('definition_id', definitionId)
    .order('order_idx')
  if (error) throw error
  return data ?? []
}

/**
 * Récupère les transitions sortantes depuis un état donné (code).
 * Utilisé pour afficher dynamiquement les boutons d'action sur l'entité.
 */
export async function getAvailableTransitions(
  entityType: string,
  currentStateCode: string
): Promise<WorkflowTransition[]> {
  const def = await getDefaultDefinition(entityType)
  if (!def) return []

  const { data: fromState, error: e1 } = await supabase
    .from('workflow_states')
    .select('id')
    .eq('definition_id', def.id)
    .eq('code', currentStateCode)
    .maybeSingle()
  if (e1) throw e1
  if (!fromState) return []

  const { data, error } = await supabase
    .from('workflow_transitions')
    .select('*, to_state:workflow_states!workflow_transitions_to_state_id_fkey(*)')
    .eq('definition_id', def.id)
    .eq('from_state_id', fromState.id)
    .eq('is_active', true)
    .order('order_idx')
  if (error) throw error
  return (data ?? []) as WorkflowTransition[]
}

/**
 * Récupère l'historique des transitions d'une entité, du plus récent au plus ancien.
 */
export async function getEntityHistory(
  entityType: string,
  entityId: string
): Promise<WorkflowHistoryEntry[]> {
  const { data, error } = await supabase
    .from('workflow_history')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Déclenche une transition via l'Edge Function (validation serveur + historique).
 * Retourne le nouveau code d'état appliqué.
 */
export async function applyTransition(params: {
  entityType: string
  entityId: string
  transitionId: string
  comment?: string
}): Promise<{ to_state: string }> {
  const { data, error } = await supabase.functions.invoke('workflow-transition', {
    body: params,
  })
  // Si non-2xx, supabase-js met l'erreur dans `error` sans inclure le body.
  // On récupère le body JSON pour avoir le vrai message (cf. jsonResponse côté Edge).
  if (error) {
    let detail = error.message
    try {
      const ctx: any = (error as any).context
      if (ctx?.res && typeof ctx.res.text === 'function') {
        const bodyText = await ctx.res.text()
        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText)
            detail = parsed.error ?? parsed.message ?? bodyText
          } catch { detail = bodyText }
        }
      }
    } catch {}
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
