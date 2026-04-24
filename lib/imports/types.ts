// Types partagés du moteur d'import
// Le moteur est générique : chaque cible (Coûts, Récoltes, Achats…) déclare
// ses colonnes et ses résolveurs, et le moteur fait le reste.

export type ColumnType = 'string' | 'number' | 'integer' | 'date' | 'boolean'

export type FieldDef = {
  /** clé interne (utilisée dans la ligne résolue) */
  key: string
  /** libellé affiché dans l'UI de mapping */
  label: string
  /** type attendu (pour le parsing / validation basique) */
  type: ColumnType
  /** obligatoire ? */
  required: boolean
  /** aliases acceptés pour auto-mapping (casse insensible, accents tolérés) */
  aliases?: string[]
  /** description courte (help text dans l'UI) */
  help?: string
  /** si type='number', minimum inclusif */
  min?: number
  /** si type='number', maximum inclusif */
  max?: number
  /** valeurs autorisées (enum-like) */
  oneOf?: string[]
  /** si résolveur FK : le champ contient un CODE qui sera transformé en ID
   *  par le moteur via le registry de résolveurs de la target */
  resolverKey?: string
  /** valeur par défaut appliquée si la cellule est vide */
  defaultValue?: string | number | boolean
}

export type ResolverDef = {
  key: string
  /** libellé court (Ferme, Catégorie, Serre…) */
  label: string
  /** charge le référentiel et retourne une map: CODE (uppercased) → objet complet */
  load: () => Promise<Map<string, any>>
}

/** Définition d'une cible d'import */
export type ImportTarget = {
  /** clé unique (ex: "cost_entries") */
  key: string
  /** libellé UI (ex: "Coûts") */
  label: string
  /** icône emoji */
  icon: string
  /** description courte */
  description: string
  /** sections d'aide à afficher en tête du template */
  instructions: string[]
  /** colonnes de la feuille principale */
  fields: FieldDef[]
  /** nom de la feuille canonique dans le template (ex: "Couts") */
  sheetName: string
  /** résolveurs (chargés 1 seule fois avant la validation) */
  resolvers: ResolverDef[]
  /** construit un template .xlsx avec feuilles d'aide + référentiels */
  buildTemplate: () => Promise<Blob>
  /** validation + résolution FK d'une ligne parsée */
  validateRow: (
    raw: Record<string, any>,
    ctx: ResolutionContext
  ) => { resolved: any; issues: RowIssue[] } | Promise<{ resolved: any; issues: RowIssue[] }>
  /** insertion finale dans la base à partir des lignes résolues */
  commit: (resolved: any[]) => Promise<CommitReport>
  /** pour les cibles master-detail (récoltes/achats), groupe les lignes
   *  avant commit (ex: même planting+date → 1 harvest) */
  groupBeforeCommit?: (resolved: any[]) => any[]
}

export type ResolutionContext = {
  /** map resolverKey → Map<code_upper, object> */
  resolvers: Record<string, Map<string, any>>
  /** toutes les lignes déjà parsées (pour cross-checks : doublons…) */
  allRows: Record<string, any>[]
}

export type RowIssue = {
  rowIndex: number
  field?: string
  severity: 'error' | 'warning'
  message: string
}

export type ParsedRow = {
  rowIndex: number   // ligne Excel (2+ si header en 1)
  raw: Record<string, any>  // valeurs brutes (après mapping colonne→field)
}

export type ValidatedRow<T = any> = {
  rowIndex: number
  resolved: T | null   // null si invalide
  issues: RowIssue[]
}

export type ValidationReport<T = any> = {
  rows: ParsedRow[]
  validated: ValidatedRow<T>[]
  issues: RowIssue[]          // issues globales (doublons, etc.)
  summary: {
    totalRows: number
    validRows: number
    errors: number
    warnings: number
  }
}

export type CommitReport = {
  inserted: number
  updated?: number
  skipped?: number
  errors?: { rowIndex: number; message: string }[]
  /** infos additionnelles spécifiques à la cible (ex: nb de récoltes créées vs dispatches) */
  extra?: Record<string, any>
}

/** Mapping colonne Excel → clé de field (ou null si ignorée) */
export type ColumnMapping = Record<string, string | null>

/** Description d'un onglet Excel détecté */
export type SheetInfo = {
  name: string
  rowCount: number
  columnCount: number
  /** première ligne (considérée comme en-tête) */
  headers: string[]
  /** 5 premières lignes de données pour preview */
  preview: any[][]
}
