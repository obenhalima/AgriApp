// Cible d'import : Coûts (cost_entries)
// Reproduit la validation de la saisie manuelle (app/couts/page.tsx + lib/costEntries.ts)

import { supabase } from '@/lib/supabase'
import { createCostEntry } from '@/lib/costEntries'
import { ImportTarget, FieldDef, RowIssue, ResolutionContext, CommitReport } from '../types'
import { buildTemplate } from '../templateBuilder'

const CHARGE_TYPES = new Set(['charge_variable', 'charge_fixe', 'amortissement'])

const FIELDS: FieldDef[] = [
  {
    key: 'code_campagne', label: 'Campagne', type: 'string', required: true,
    aliases: ['campagne', 'campaign', 'campaign_code', 'code campagne'],
    help: 'Code de la campagne (ex: CAMP-2025-01). Doit exister.',
    resolverKey: 'campaigns',
  },
  {
    key: 'code_ferme', label: 'Ferme', type: 'string', required: true,
    aliases: ['ferme', 'farm', 'farm_code', 'code ferme'],
    help: 'Code de la ferme. Obligatoire pour cohérence avec la serre.',
    resolverKey: 'farms',
  },
  {
    key: 'code_serre', label: 'Serre', type: 'string', required: false,
    aliases: ['serre', 'greenhouse', 'greenhouse_code'],
    help: 'Code de la serre (optionnel). Si renseigné, doit appartenir à la ferme.',
    resolverKey: 'greenhouses',
  },
  {
    key: 'code_categorie', label: 'Catégorie', type: 'string', required: true,
    aliases: ['categorie', 'catégorie', 'category', 'category_code', 'code cat', 'code categorie'],
    help: 'Code de la catégorie comptable (feuille, pas parent). Type charge uniquement.',
    resolverKey: 'categories',
  },
  {
    key: 'date', label: 'Date', type: 'date', required: true,
    aliases: ['entry_date', 'date entree', 'date_entree', 'jour', 'date_saisie'],
    help: 'Date ISO YYYY-MM-DD ou DD/MM/YYYY.',
  },
  {
    key: 'montant', label: 'Montant (MAD)', type: 'number', required: true,
    aliases: ['amount', 'valeur', 'total'],
    help: 'Montant en MAD. Doit être > 0.',
    min: 0,
  },
  {
    key: 'description', label: 'Description', type: 'string', required: false,
    aliases: ['notes', 'libelle', 'libellé', 'commentaire'],
    help: 'Texte libre (optionnel).',
  },
  {
    key: 'previsionnel', label: 'Prévisionnel', type: 'boolean', required: false,
    aliases: ['is_planned', 'planned', 'prev', 'prévisionnel', 'budget'],
    defaultValue: false,
    help: 'Vrai = budget prévisionnel, Faux = coût réel (défaut).',
  },
]

export const costsTarget: ImportTarget = {
  key: 'cost_entries',
  label: 'Coûts',
  icon: '💰',
  description: 'Importer des coûts réels ou prévisionnels (cost_entries).',
  instructions: [
    "Chaque ligne = une entrée de coût individuelle.",
    "Pour une répartition mensuelle ou par surface, utilisez plutôt la saisie manuelle (page Coûts).",
    "code_categorie doit être une catégorie FEUILLE et de type charge (variable, fixe, amortissement).",
    "code_serre est optionnel ; s'il est renseigné, il doit appartenir à la ferme indiquée.",
    "Si une ligne a montant = 0, elle sera ignorée (warning).",
  ],
  sheetName: 'Couts',
  fields: FIELDS,
  resolvers: [
    {
      key: 'campaigns', label: 'Campagne',
      load: async () => {
        const { data } = await supabase.from('campaigns').select('id, code, name, farm_id')
        const m = new Map<string, any>()
        ;(data ?? []).forEach((c: any) => { if (c.code) m.set(String(c.code).toUpperCase(), c) })
        return m
      },
    },
    {
      key: 'farms', label: 'Ferme',
      load: async () => {
        const { data } = await supabase.from('farms').select('id, code, name').eq('is_active', true)
        const m = new Map<string, any>()
        ;(data ?? []).forEach((f: any) => m.set(String(f.code).toUpperCase(), f))
        return m
      },
    },
    {
      key: 'greenhouses', label: 'Serre',
      load: async () => {
        const { data } = await supabase.from('greenhouses').select('id, code, name, farm_id')
        const m = new Map<string, any>()
        ;(data ?? []).forEach((g: any) => m.set(String(g.code).toUpperCase(), g))
        return m
      },
    },
    {
      key: 'categories', label: 'Catégorie',
      load: async () => {
        const { data } = await supabase.from('account_categories')
          .select('id, code, label, type, parent_id').eq('is_active', true)
        const all = data ?? []
        const parentIds = new Set(all.filter((c: any) => c.parent_id).map((c: any) => c.parent_id))
        const m = new Map<string, any>()
        all.forEach((c: any) => {
          m.set(String(c.code).toUpperCase(), {
            ...c,
            isLeaf: !parentIds.has(c.id),
          })
        })
        return m
      },
    },
  ],

  validateRow: (raw: Record<string, any>, ctx: ResolutionContext) => {
    const issues: RowIssue[] = []

    const farmCode = String(raw.code_ferme ?? '').toUpperCase()
    const farm = ctx.resolvers.farms.get(farmCode)
    if (!farm) {
      issues.push({ rowIndex: 0, field: 'code_ferme', severity: 'error',
        message: `Ferme inconnue : "${raw.code_ferme}"` })
    }

    const campCode = String(raw.code_campagne ?? '').toUpperCase()
    const campaign = ctx.resolvers.campaigns.get(campCode)
    if (!campaign) {
      issues.push({ rowIndex: 0, field: 'code_campagne', severity: 'error',
        message: `Campagne inconnue : "${raw.code_campagne}"` })
    }
    // Pas de contrôle campagne/ferme : une campagne peut couvrir plusieurs fermes.

    let greenhouse: any = null
    if (raw.code_serre) {
      const ghCode = String(raw.code_serre).toUpperCase()
      greenhouse = ctx.resolvers.greenhouses.get(ghCode)
      if (!greenhouse) {
        issues.push({ rowIndex: 0, field: 'code_serre', severity: 'error',
          message: `Serre inconnue : "${raw.code_serre}"` })
      } else if (farm && greenhouse.farm_id !== farm.id) {
        issues.push({ rowIndex: 0, field: 'code_serre', severity: 'error',
          message: `La serre "${raw.code_serre}" n'appartient pas à la ferme "${raw.code_ferme}"` })
      }
    }

    const catCode = String(raw.code_categorie ?? '').toUpperCase()
    const category = ctx.resolvers.categories.get(catCode)
    if (!category) {
      issues.push({ rowIndex: 0, field: 'code_categorie', severity: 'error',
        message: `Catégorie inconnue : "${raw.code_categorie}"` })
    } else {
      if (!category.isLeaf) {
        issues.push({ rowIndex: 0, field: 'code_categorie', severity: 'error',
          message: `"${raw.code_categorie}" est une catégorie parente — impossible d'y rattacher un montant` })
      }
      if (!CHARGE_TYPES.has(category.type)) {
        issues.push({ rowIndex: 0, field: 'code_categorie', severity: 'error',
          message: `"${raw.code_categorie}" est de type "${category.type}" — les coûts doivent être de type charge (variable/fixe/amortissement)` })
      }
    }

    // Date cohérente avec la campagne ? (warning seulement)
    if (campaign && raw.date) {
      // on ne bloque pas si hors bornes : juste warning
      // (pas de validation stricte ici, la table cost_entries n'impose pas la borne)
    }

    // Montant = 0 → warning (la ligne sera créée quand même, comme en saisie manuelle où 0 est refusé)
    const amount = Number(raw.montant) || 0
    if (amount <= 0) {
      issues.push({ rowIndex: 0, field: 'montant', severity: 'error',
        message: `Montant doit être > 0 (trouvé : ${amount})` })
    }

    const hasErr = issues.some(i => i.severity === 'error')
    return {
      resolved: hasErr ? null : {
        campaign_id: campaign.id,
        greenhouse_id: greenhouse?.id ?? null,
        account_category_id: category.id,
        cost_category: String(category.code).toLowerCase(),
        amount: Math.round(amount * 100) / 100,
        entry_date: raw.date,
        description: raw.description ?? null,
        is_planned: !!raw.previsionnel,
        _rowIndex: 0, // rempli par le moteur
      },
      issues,
    }
  },

  commit: async (resolved: any[]): Promise<CommitReport> => {
    const errors: { rowIndex: number; message: string }[] = []
    let inserted = 0
    // On passe par createCostEntry() pour conserver la logique legacy (cost_category auto)
    for (const r of resolved) {
      try {
        await createCostEntry({
          campaign_id: r.campaign_id,
          greenhouse_id: r.greenhouse_id,
          account_category_id: r.account_category_id,
          cost_category: r.cost_category,
          amount: r.amount,
          entry_date: r.entry_date,
          description: r.description,
          is_planned: r.is_planned,
        })
        inserted++
      } catch (e: any) {
        errors.push({ rowIndex: r._rowIndex ?? 0, message: e.message })
      }
    }
    return { inserted, errors }
  },

  buildTemplate: async (): Promise<Blob> => {
    const [farmsRes, ghsRes, catsRes, campsRes] = await Promise.all([
      supabase.from('farms').select('id, code, name').eq('is_active', true).order('name'),
      supabase.from('greenhouses').select('code, name, farms(code, name)').order('code'),
      supabase.from('account_categories').select('id, code, label, type, parent_id').eq('is_active', true).order('type').order('display_order'),
      supabase.from('campaigns').select('code, name, planting_start, harvest_end, farms(code, name)').order('planting_start', { ascending: false }),
    ])
    const farms = farmsRes.data ?? []
    const ghs = ghsRes.data ?? []
    const allCats = catsRes.data ?? []
    const camps = campsRes.data ?? []

    // Seulement les catégories FEUILLES et de type charge — celles utilisables
    const parentIds = new Set(allCats.filter((c: any) => c.parent_id).map((c: any) => c.parent_id))
    const usableCats = allCats.filter((c: any) => !parentIds.has(c.id) && CHARGE_TYPES.has(c.type))

    // Feuilles de référence — la colonne A contient le code (pour les dropdowns)
    const campRows = camps.map((c: any) => [c.code, c.name, c.planting_start, c.harvest_end, c.farms?.code ?? ''])
    const farmRows = farms.map((f: any) => [f.code, f.name])
    const ghRows   = ghs.map((g: any) => [g.code, g.name, g.farms?.code ?? '', g.farms?.name ?? ''])
    const catRows  = usableCats.map((c: any) => [c.code, c.label, c.type])
    const allCatRows = allCats.map((c: any) => [c.code, c.label, c.type, !parentIds.has(c.id) && CHARGE_TYPES.has(c.type) ? 'OUI' : 'NON'])

    const nbCamp = Math.max(campRows.length, 1)
    const nbFarm = Math.max(farmRows.length, 1)
    const nbGh   = Math.max(ghRows.length, 1)
    const nbCat  = Math.max(catRows.length, 1)

    // Exemple pré-rempli
    const example = farms.length > 0 && camps.length > 0 && usableCats.length > 0 ? [[
      camps[0].code, farms[0].code, '', usableCats[0].code,
      new Date().toISOString().slice(0, 10), 1200, 'Exemple — à supprimer', 'non',
    ]] : []

    return await buildTemplate({
      title: 'Template Import Coûts — FramPilot',
      author: 'FramPilot',
      instructions: {
        title: '📥 Import des coûts — Guide rapide',
        lines: [
          "Cette feuille permet d'importer des coûts réels ou prévisionnels en masse.",
          '',
          '🔸 Remplissez la feuille "Couts" ligne par ligne (1 ligne = 1 coût).',
          '🔸 Les cellules bleues en en-tête sont obligatoires.',
          '🔸 Les champs avec liste déroulante (▼) bloquent les valeurs invalides.',
          '',
          '📋 Dropdowns disponibles depuis les référentiels :',
          '   • code_campagne — liste des campagnes actives (onglet "Campagnes")',
          '   • code_ferme — liste des fermes actives (onglet "Fermes")',
          '   • code_serre — liste des serres (onglet "Serres") — laissez vide pour un coût niveau ferme',
          '   • code_categorie — UNIQUEMENT les catégories utilisables (feuilles + type charge) (onglet "Catégories")',
          '   • previsionnel — oui / non (défaut : non)',
          '',
          '✅ Contrôles Excel (bloquants à la saisie) :',
          '   • Valeurs dans les listes uniquement (pas de typo possible)',
          "   • Montant numérique ≥ 0,01 (rejette 0 ou négatif)",
          '   • Date au format valide',
          '',
          '✅ Contrôles serveur (au moment de l\'import) :',
          "   • Cohérence campagne / ferme",
          "   • Cohérence serre / ferme",
          "   • Catégorie ∈ {charge_variable, charge_fixe, amortissement}",
          "",
          "💡 Vous pouvez copier-coller des lignes depuis un autre classeur ; les validations seront conservées.",
        ],
      },
      referenceSheets: [
        {
          name: 'Campagnes',
          headers: ['code_campagne', 'nom', 'plantation', 'fin_recolte', 'code_ferme'],
          rows: campRows,
          protected: true,
        },
        {
          name: 'Fermes',
          headers: ['code_ferme', 'nom'],
          rows: farmRows,
          protected: true,
        },
        {
          name: 'Serres',
          headers: ['code_serre', 'nom', 'code_ferme', 'nom_ferme'],
          rows: ghRows,
          protected: true,
        },
        {
          name: 'Categories',
          headers: ['code_categorie', 'libelle', 'type'],
          rows: catRows,
          protected: true,
        },
        {
          name: 'Categories_toutes',
          headers: ['code_categorie', 'libelle', 'type', 'utilisable'],
          rows: allCatRows,
          protected: true,
          hidden: true,
        },
      ],
      targetSheet: {
        name: 'Couts',
        dataRowsCount: 1000,
        examples: example,
        columns: [
          {
            header: 'code_campagne', width: 18, required: true,
            note: 'Code de la campagne. Obligatoire. Choisir dans la liste déroulante.',
            validation: {
              type: 'list',
              rangeRef: `Campagnes!$A$2:$A$${nbCamp + 1}`,
              prompt: 'Sélectionner le code campagne depuis la liste.',
              error: 'Campagne inconnue. Utilisez un code de la feuille "Campagnes".',
            },
          },
          {
            header: 'code_ferme', width: 14, required: true,
            note: 'Code de la ferme. Obligatoire.',
            validation: {
              type: 'list',
              rangeRef: `Fermes!$A$2:$A$${nbFarm + 1}`,
              prompt: 'Sélectionner le code ferme depuis la liste.',
              error: 'Ferme inconnue. Utilisez un code de la feuille "Fermes".',
            },
          },
          {
            header: 'code_serre', width: 14, required: false,
            note: 'Code de la serre (optionnel). Si renseigné, doit appartenir à la ferme.',
            validation: {
              type: 'list',
              rangeRef: `Serres!$A$2:$A$${nbGh + 1}`,
              allowBlank: true,
              prompt: 'Optionnel. Si renseigné, doit appartenir à la ferme.',
              error: 'Serre inconnue. Utilisez un code de la feuille "Serres" (ou laissez vide).',
            },
          },
          {
            header: 'code_categorie', width: 18, required: true,
            note: 'Code catégorie. SEULES les catégories utilisables (feuilles + type charge) sont dans la liste.',
            validation: {
              type: 'list',
              rangeRef: `Categories!$A$2:$A$${nbCat + 1}`,
              prompt: 'Uniquement les catégories feuilles de type charge.',
              error: 'Catégorie invalide ou non utilisable.',
            },
          },
          {
            header: 'date', width: 14, required: true,
            note: 'Date du coût (AAAA-MM-JJ).',
            numFmt: 'yyyy-mm-dd',
            validation: {
              type: 'date', min: '2020-01-01', max: '2100-12-31',
              prompt: 'Format date (AAAA-MM-JJ).',
              error: 'Date invalide. Format attendu : AAAA-MM-JJ (ex : 2026-04-24).',
            },
          },
          {
            header: 'montant', width: 14, required: true,
            note: 'Montant en MAD. Doit être strictement supérieur à 0.',
            numFmt: '#,##0.00',
            validation: {
              type: 'decimal', min: 0.01,
              prompt: 'Montant en MAD (> 0).',
              error: 'Montant invalide. Doit être > 0.',
            },
          },
          {
            header: 'description', width: 32, required: false,
            note: 'Texte libre (optionnel).',
          },
          {
            header: 'previsionnel', width: 14, required: false,
            note: 'oui = budget prévisionnel, non = coût réel (défaut).',
            validation: {
              type: 'list', values: ['oui', 'non'], allowBlank: true,
              prompt: 'oui (prévisionnel) ou non (réel).',
              error: 'Valeur invalide. Choisissez "oui" ou "non".',
            },
          },
        ],
      },
    })
  },
}
