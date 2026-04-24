// Edge Function : workflow-transition
// Valide et applique une transition de workflow sur une entité.
//
// Entrée (JSON):
//   { entityType: string, entityId: string, transitionId: string, comment?: string }
//
// Sortie (JSON):
//   { to_state: string }   -- code du nouvel état
//   { error: string }      -- en cas d'erreur (HTTP 4xx/5xx)

// @ts-ignore -- import Deno (résolu à l'exécution sur Supabase)
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// ------------------------------------------------------------
// Mapping entity_type -> { table, statusColumn }
// Ajouter ici chaque nouveau module géré par le moteur.
// ------------------------------------------------------------
const ENTITY_TABLE_MAP: Record<string, { table: string; statusColumn: string }> = {
  sales_order:    { table: 'sales_orders',    statusColumn: 'status' },
  purchase_order: { table: 'purchase_orders', statusColumn: 'status' },
  // invoice:       { table: 'invoices',        statusColumn: 'status' },
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non autorisée' }, 405)
  }

  try {
    const { entityType, entityId, transitionId, comment } = await req.json()
    console.log('[wf] input', { entityType, entityId, transitionId })

    if (!entityType || !entityId || !transitionId) {
      return jsonResponse({ error: 'Paramètres manquants (entityType, entityId, transitionId requis)' }, 400)
    }

    const entityConfig = ENTITY_TABLE_MAP[entityType]
    if (!entityConfig) {
      return jsonResponse({ error: `Type d'entité non géré par le moteur : ${entityType}` }, 400)
    }

    // @ts-ignore -- Deno.env disponible à l'exécution
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    // @ts-ignore
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Variables d\'environnement Supabase manquantes' }, 500)
    }

    // Client service_role : bypass RLS, accès complet. L'Edge Function est la frontière de sécurité.
    const supabase = createClient(supabaseUrl, serviceKey)

    // Identification de l'utilisateur (optionnel — si auth pas encore en place, userId reste null).
    let userId: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice('Bearer '.length)
        const { data: userData } = await supabase.auth.getUser(token)
        userId = userData?.user?.id ?? null
      } catch (e) {
        console.warn('[wf] impossible d\'identifier l\'utilisateur :', e)
      }
    }

    // 1. Charger la transition (queries séquentielles simples — pas d'embedding PostgREST)
    const { data: transition, error: te } = await supabase
      .from('workflow_transitions')
      .select('id, definition_id, from_state_id, to_state_id, code, label, is_active')
      .eq('id', transitionId)
      .maybeSingle()

    if (te) { console.error('[wf] erreur lecture transition:', te); throw te }
    if (!transition) return jsonResponse({ error: 'Transition introuvable' }, 404)
    if (!transition.is_active) return jsonResponse({ error: 'Transition désactivée' }, 400)

    // 2. Charger la définition associée
    const { data: def, error: de } = await supabase
      .from('workflow_definitions')
      .select('entity_type, is_active')
      .eq('id', transition.definition_id)
      .maybeSingle()

    if (de) { console.error('[wf] erreur lecture définition:', de); throw de }
    if (!def?.is_active) return jsonResponse({ error: 'Workflow désactivé' }, 400)
    if (def.entity_type !== entityType) {
      return jsonResponse({ error: `La transition ne correspond pas au type d'entité ${entityType}` }, 400)
    }

    // 3. Charger les 2 états (from et to) — nécessaires pour leurs codes
    const { data: fromState, error: fe } = await supabase
      .from('workflow_states').select('code, label').eq('id', transition.from_state_id).maybeSingle()
    if (fe || !fromState) { console.error('[wf] from_state introuvable:', fe); return jsonResponse({ error: 'État source introuvable' }, 500) }

    const { data: toState, error: tse } = await supabase
      .from('workflow_states').select('code, label').eq('id', transition.to_state_id).maybeSingle()
    if (tse || !toState) { console.error('[wf] to_state introuvable:', tse); return jsonResponse({ error: 'État cible introuvable' }, 500) }

    // 4. Charger l'état actuel de l'entité
    const { data: entityRow, error: ee } = await supabase
      .from(entityConfig.table)
      .select(`id, ${entityConfig.statusColumn}`)
      .eq('id', entityId)
      .maybeSingle()

    if (ee) { console.error('[wf] erreur lecture entité:', ee); throw ee }
    if (!entityRow) return jsonResponse({ error: 'Entité introuvable' }, 404)

    const currentStatus = (entityRow as any)[entityConfig.statusColumn]
    if (currentStatus !== fromState.code) {
      return jsonResponse({
        error: `Transition invalide : l'entité est dans l'état "${currentStatus}" mais la transition attend "${fromState.code}".`,
      }, 409)
    }

    // 5. Appliquer le changement d'état
    const { error: ue } = await supabase
      .from(entityConfig.table)
      .update({ [entityConfig.statusColumn]: toState.code, updated_at: new Date().toISOString() })
      .eq('id', entityId)

    if (ue) { console.error('[wf] erreur update:', ue); throw ue }

    // 6. Enregistrer l'historique (non bloquant)
    const { error: he } = await supabase.from('workflow_history').insert({
      entity_type: entityType,
      entity_id: entityId,
      definition_id: transition.definition_id,
      transition_id: transition.id,
      from_state_code: fromState.code,
      to_state_code: toState.code,
      performed_by: userId,
      comment: comment ?? null,
    })

    if (he) console.error('[wf] historique non écrit:', he)

    console.log('[wf] ok', { entityId, from: fromState.code, to: toState.code })
    return jsonResponse({ to_state: toState.code })
  } catch (e: any) {
    console.error('[wf] exception:', e?.message, e)
    return jsonResponse({ error: e?.message ?? 'Erreur serveur' }, 500)
  }
})
