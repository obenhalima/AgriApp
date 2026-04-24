// Edge Function : ai-analyze-cpc (mode chat)
// Assistant conversationnel expert-comptable + agronome serre tomate.
// Input : { context, messages: [{role: 'user'|'assistant', content}] }
// Output : { reply: string, model: string }

// @ts-ignore
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

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

const fmt = (v: number) => (typeof v !== 'number' ? String(v) : v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }))
const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`

// ────────────────────────────────────────────────────────────
// Construit le bloc de contexte données (envoyé dans le 1er "user message")
// ────────────────────────────────────────────────────────────
function buildContextBlock(context: any, data: any, diagnostics: any): string {
  const p = data.produits, cv = data.charges_variables, cf = data.charges_fixes, am = data.amortissements
  const ebitda = data.ebitda, res = data.resultat
  const scopeLabel = context.scope === 'domain' ? 'Domaine entier'
    : context.scope === 'farm' ? `Ferme ${context.farmName ?? ''}`
    : `Serre ${context.greenhouseCode ?? ''} (ferme ${context.farmName ?? ''})`

  const topLinesBlock = (data.topLines ?? [])
    .slice(0, 25)
    .map((l: any) => `- ${l.label} [${l.type}] : budget ${fmt(l.budget)} MAD / réel ${fmt(l.actual)} MAD (${fmtPct(l.variancePct)})`)
    .join('\n')

  let diag = ''
  if (diagnostics) {
    const d = diagnostics
    const overdueBlock = d.plantings.withHarvestOverdue.length > 0
      ? d.plantings.withHarvestOverdue.map((x: any) =>
          `- ${x.label} [serre ${x.greenhouseCode}] : début ${x.harvest_start_date}, ${x.days_overdue}j de retard, volume attendu ${fmt(x.expected_total_kg)} kg — aucune récolte saisie`).join('\n')
      : '(aucune)'
    const underperfBlock = d.plantings.underperforming.length > 0
      ? d.plantings.underperforming.map((x: any) =>
          `- ${x.label} [serre ${x.greenhouseCode}] : attendu à date ${fmt(x.expected_kg_to_date)} kg, récolté ${fmt(x.actual_kg_to_date)} kg (${fmtPct(x.gap_pct)})`).join('\n')
      : '(aucune)'
    const budgetGapsBlock = d.budgetGaps.length > 0
      ? d.budgetGaps.slice(0, 20).map((g: any) =>
          `- ${g.categoryLabel} (${g.categoryType}) — ${g.monthLabel} : budget ${fmt(g.budget)} MAD, RÉEL = 0`).join('\n')
      : '(aucun)'
    const hiddenCatsBlock = d.categoriesInCostsNotInBudget.length > 0
      ? d.categoriesInCostsNotInBudget.map((c: any) =>
          `- ${c.categoryLabel} : ${fmt(c.actual)} MAD de coûts sans budget`).join('\n')
      : '(aucune)'

    diag = `

=== DIAGNOSTIC DES DONNÉES (date ${d.today}) ===
Plantations : ${d.plantings.total} au total · dates récolte renseignées ${d.plantings.withValidDates}/${d.plantings.total} · sans prix ${d.plantings.withoutPrices}

RÉCOLTES EN RETARD (date début passée, 0 récolte)
${overdueBlock}

RÉCOLTES SOUS-PERFORMANTES (< -20% vs attendu à date)
${underperfBlock}

MOIS PASSÉS AVEC BUDGET MAIS RÉEL=0 (saisies manquantes)
${budgetGapsBlock}

COÛTS NON CATÉGORISÉS
${d.uncategorizedCostsCount} entrées pour ${fmt(d.uncategorizedCostsAmount)} MAD

CATÉGORIES AVEC COÛTS MAIS SANS BUDGET
${hiddenCatsBlock}`
  }

  const caRatio = (v: number) => p.actual > 0 ? ` (${(v/p.actual*100).toFixed(1)}% du CA)` : ''

  return `=== DONNÉES DU COMPTE D'EXPLOITATION ===
Campagne : ${context.campaignName}
Périmètre : ${scopeLabel}
Version budget : ${context.versionName}
Date d'analyse : ${context.today ?? ''}

Note : dans le "Réel", les mois futurs sont extrapolés avec le budget (rolling forecast). Pour juger la performance réelle, concentre-toi sur les mois PASSÉS et les données effectivement saisies (récoltes, coûts).

CHIFFRES CLÉS (MAD)
| Ligne                    | Budget       | Réel         | Écart % |
|--------------------------|--------------|--------------|---------|
| Produits (CA)            | ${fmt(p.budget)} | ${fmt(p.actual)} | ${fmtPct((p.actual-p.budget)/(p.budget||1)*100)} |
| Charges variables        | ${fmt(cv.budget)} | ${fmt(cv.actual)} | ${fmtPct((cv.actual-cv.budget)/(cv.budget||1)*100)} |
| Charges fixes            | ${fmt(cf.budget)} | ${fmt(cf.actual)} | ${fmtPct((cf.actual-cf.budget)/(cf.budget||1)*100)} |
| EBITDA${caRatio(ebitda.actual)} | ${fmt(ebitda.budget)} | ${fmt(ebitda.actual)} | ${fmtPct((ebitda.actual-ebitda.budget)/(ebitda.budget||1)*100)} |
| Amortissements           | ${fmt(am.budget)} | ${fmt(am.actual)} | ${fmtPct((am.actual-am.budget)/(am.budget||1)*100)} |
| Résultat d'exploitation${caRatio(res.actual)} | ${fmt(res.budget)} | ${fmt(res.actual)} | ${fmtPct((res.actual-res.budget)/(res.budget||1)*100)} |

TOP POSTES (écarts budget↔réel en valeur absolue)
${topLinesBlock || '(aucun)'}${diag}
`
}

// ────────────────────────────────────────────────────────────
// Appel Gemini avec retry + fallback multi-modèles
// ────────────────────────────────────────────────────────────
async function callGemini(apiKey: string, systemInstruction: string, contents: any[]): Promise<{ text: string; model: string }> {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']
  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 3500,
      topP: 0.95,
    },
  }

  let lastErr = ''
  let lastStatus = 0

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (r.ok) {
          const j = await r.json()
          const text = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          if (text) return { text, model }
          lastErr = `Réponse vide du modèle ${model}`
          continue
        }
        const t = await r.text()
        lastStatus = r.status
        lastErr = t.slice(0, 300)
        console.error(`[gemini] ${model} attempt ${attempt}: ${r.status} ${lastErr}`)
        if (r.status === 503 || r.status === 429) {
          if (attempt === 1) await new Promise(res => setTimeout(res, 1500))
        } else {
          break // passe au modèle suivant
        }
      } catch (e: any) {
        lastErr = e?.message ?? 'network error'
        console.error(`[gemini] ${model} exception:`, lastErr)
      }
    }
  }
  throw new Error(`Tous les modèles Gemini ont échoué (dernier: ${lastStatus}) — ${lastErr}`)
}

// ────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée' }, 405)

  try {
    // @ts-ignore
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY non configurée' }, 500)

    const body = await req.json()
    if (!body?.context || !body?.data) return jsonResponse({ error: 'context et data requis' }, 400)
    if (!Array.isArray(body.messages)) return jsonResponse({ error: 'messages (array) requis' }, 400)

    const systemInstruction = `Tu es un assistant IA cumulant trois rôles experts au service de la direction d'une exploitation agricole marocaine de tomates sous serre :

1. **EXPERT-COMPTABLE CHEF DE MISSION** : tu maîtrises le compte d'exploitation (CPC), l'EBITDA, les écarts budget vs réel, la fiabilité des données comptables. Tu fais une revue analytique critique comme avant clôture.

2. **AGRONOME SPÉCIALISTE TOMATE SOUS SERRE AU MAROC** : tu connais les cycles de production (plantation, floraison, nouaison, récolte), les rendements cibles (120-180 t/ha en tomate ronde sous abri), les problématiques phytosanitaires courantes (tuta absoluta, oïdium, virus TYLCV), les conditions climatiques (région Souss-Massa, Chtouka, Agadir), l'équilibre technique entre intrants et résultat.

3. **ANALYSTE FINANCIER** : tu identifies les signaux faibles, corrèles données financières et opérationnelles (ex: une récolte en retard explique souvent un CA en retard), tu proposes des actions concrètes priorisées.

RÈGLES DE DIALOGUE :
- Tu parles toujours en français, ton direct et professionnel, sans jargon inutile.
- Tu t'appuies STRICTEMENT sur les données fournies dans le bloc contexte. Ne jamais inventer de chiffres.
- Si une donnée manque pour répondre à la question, dis-le clairement au lieu d'improviser.
- Tu cites les montants exacts en MAD avec arrondi à l'entier.
- Tu utilises du markdown pour structurer (titres ##, listes, **gras**).
- Tu es concis : 3-8 phrases par réponse sauf si un tableau ou une analyse détaillée est explicitement demandée.
- Tu peux poser une question de clarification si la demande est ambiguë.
- À la première question de l'utilisateur (qui sera souvent "donne une revue"), tu produis un rapport d'audit complet avec : synthèse, qualité des données, écarts financiers majeurs, risques, recommandations.
- Aux questions suivantes (follow-up), tu réponds de façon ciblée à la question précisément posée, sans re-dérouler tout le rapport.
- Quand tu mentionnes une plantation en retard ou un gap de saisie, pointe-le par son nom et donne un ordre d'action concret.`

    const contextBlock = buildContextBlock(body.context, body.data, body.diagnostics)

    // Construit les "contents" Gemini :
    // - Premier message user = contexte données + consigne d'acquiescement
    // - Message model factice = "OK je suis prêt"
    // - Puis l'historique réel des messages + nouveau message
    const contents: any[] = [
      { role: 'user', parts: [{ text: contextBlock + '\n\nJe vais te poser des questions sur ces données. Confirme que tu les as bien enregistrées en répondant uniquement par "OK".' }] },
      { role: 'model', parts: [{ text: 'OK' }] },
    ]
    for (const m of body.messages) {
      const role = m.role === 'assistant' ? 'model' : 'user'
      contents.push({ role, parts: [{ text: String(m.content ?? '') }] })
    }

    const { text, model } = await callGemini(apiKey, systemInstruction, contents)
    return jsonResponse({ reply: text, model })

  } catch (e: any) {
    console.error('[ai-chat-cpc] exception:', e?.message)
    return jsonResponse({ error: e?.message ?? 'Erreur serveur' }, 500)
  }
})
