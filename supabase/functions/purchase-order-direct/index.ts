// Retired: application uses transactional, authorized costing RPCs.
// @ts-ignore -- Deno runtime
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' }
serve((req: Request) => req.method === 'OPTIONS'
  ? new Response('ok', { headers })
  : new Response(JSON.stringify({ error: 'Ancien point d’entrée désactivé. Actualisez l’application pour utiliser le parcours sécurisé.' }), { status: 410, headers }))
