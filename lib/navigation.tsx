/**
 * FarmPilot — Configuration de navigation centralisée.
 *
 * Source unique pour la Sidebar, le Command Palette (Cmd+K) et les Breadcrumbs.
 *
 * Regroupement fonctionnel par flux métier :
 *   1. PILOTAGE       → vue d'ensemble + analyse + alertes
 *   2. PRODUCTION     → cycle agricole (planning → culture → récolte)
 *   3. INFRASTRUCTURE → assets physiques (fermes, serres, variétés)
 *   4. COMMERCIAL     → vente & clients
 *   5. APPROVISIONNEMENT → achats & stocks
 *   6. FINANCE        → budgets, coûts, marges, amortissements
 *   7. RH             → ressources humaines
 *   8. PARAMÉTRAGE    → configuration métier (plan comptable, workflows…)
 *   9. ADMINISTRATION → utilisateurs & permissions
 *  10. AIDE           → documentation
 */
import {
  type LucideIcon,
  // Section icons
  Compass, Sprout as SectionSprout, Building2 as SectionBuilding, Handshake as SectionHandshake,
  ShoppingCart as SectionShopping, Wallet as SectionWallet, Users as SectionUsers,
  Sliders, ShieldAlert, BookOpen as SectionBook,
  // Nav items
  LayoutDashboard, Sprout, Settings2, FlaskConical, AlertTriangle, Gauge, Clock,
  Globe, Handshake, ClipboardList, Receipt, FileBarChart,
  Building2, Box, Dna, Calendar, Leaf,
  Truck, ShoppingCart, Package,
  Coins, TrendingUp, Bot, Calculator,
  Users, UserSquare, Banknote, Palmtree, Building, MessageSquare,
  BookText, Briefcase, Workflow,
  UserCog, ShieldCheck,
  BookOpen,
  Plus, Search, Bell,
  Database, Settings, List,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  moduleCode: string
  icon: LucideIcon
  /** Couleur d'accent (hex ou CSS var) pour la sidebar/palette */
  color: string
  /** Mots-clés pour la recherche dans la palette */
  keywords?: string[]
  /** Raccourci clavier (ex: 'g d' pour goto dashboard) */
  shortcut?: string[]
  /** Petite description pour la palette / tooltip */
  description?: string
}

export type NavSection = {
  section: string
  /** Description de la section pour le hover/tooltip */
  tagline?: string
  /** Icône de la section (affichée à gauche du titre dans la sidebar) */
  icon?: LucideIcon
  /** Couleur principale de la section (utilisée pour le titre + accents) */
  color?: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  // ────────────────────────────────────────────────────────────────────────
  // 🎯 PILOTAGE — Vue d'ensemble & alertes
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'PILOTAGE',
    tagline: 'Vue 360° · KPI · alertes',
    icon: Compass,
    color: '#6366f1',
    items: [
      { href: '/',        moduleCode: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: '#6366f1', keywords: ['accueil', 'home', 'kpi', 'tableau de bord'], shortcut: ['g', 'd'], description: 'Vue exécutive temps réel' },
      { href: '/alertes', moduleCode: 'alertes',   label: 'Alertes',   icon: AlertTriangle,   color: '#ef4444', keywords: ['notifications', 'warnings'], description: 'Centre d\'alertes' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 🌱 PRODUCTION — Cycle agricole (planning → culture → récolte)
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'PRODUCTION',
    tagline: 'Cycle agricole · plan → récolte',
    icon: SectionSprout,
    color: '#10b981',
    items: [
      { href: '/plan-culture', moduleCode: 'campagnes',  label: 'Plan de culture', icon: Leaf,        color: '#10b981', keywords: ['plan', 'budget', 'volumes', 'gantt', 'planification'], description: 'Vue Gantt + KPI plantations' },
      { href: '/campagnes',    moduleCode: 'campagnes',  label: 'Campagnes',       icon: Calendar,    color: '#22c55e', keywords: ['saison', 'cycle'], description: 'Saisons de production' },
      { href: '/production',   moduleCode: 'production', label: 'Plantations',     icon: Settings2,   color: '#f59e0b', keywords: ['rendement', 'plantations', 'production'], description: 'Affectation variétés × serres' },
      { href: '/recoltes',     moduleCode: 'recoltes',   label: 'Récoltes',        icon: Sprout,      color: '#10b981', keywords: ['harvest', 'lots', 'tri', 'station', 'recolte'], shortcut: ['g', 'r'], description: 'Lots, tri, dispatches, prix' },
      { href: '/pointage',     moduleCode: 'pointage',     label: 'Pointage',        icon: Clock,       color: '#0ea5e9', keywords: ['heures', 'temps', 'pointage', 'main oeuvre', 'mo', 'presence'], description: 'Heures de travail par serre/tâche' },
      { href: '/productivite', moduleCode: 'productivite', label: 'Productivité',    icon: Gauge,       color: '#8b5cf6', keywords: ['rendement', 'metre lineaire', 'ml', 'kg/ml', 'cout mo', 'productivite'], description: 'kg/ml, coût/ml, coût MO/ml par culture' },
      { href: '/agronomie',    moduleCode: 'agronomie',  label: 'Agronomie',       icon: FlaskConical, color: '#06b6d4', keywords: ['journal', 'cultural', 'traitement', 'irrigation', 'fertigation'], description: 'Journal cultural' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 🏗️ INFRASTRUCTURE — Assets physiques
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'INFRASTRUCTURE',
    tagline: 'Sites · serres · variétés',
    icon: SectionBuilding,
    color: '#0ea5e9',
    items: [
      { href: '/fermes',   moduleCode: 'fermes',   label: 'Fermes',   icon: Building2, color: '#64748b', keywords: ['sites', 'domaine'], description: 'Sites de production' },
      { href: '/serres',   moduleCode: 'serres',   label: 'Serres',   icon: Box,        color: '#0ea5e9', keywords: ['greenhouse', 'tunnel'], description: 'Inventaire des serres' },
      { href: '/cultures', moduleCode: 'varietes', label: 'Cultures', icon: Sprout,     color: '#22c55e', keywords: ['crop', 'culture', 'poivron', 'concombre', 'multi-culture', 'catalogue variete'], description: 'Cultures de l\'exploitation + catalogue de variétés' },
      { href: '/varietes', moduleCode: 'varietes', label: 'Variétés', icon: Dna,        color: '#a855f7', keywords: ['cultivar', 'roma', 'cherry', 'tomate'], description: 'Catalogue des variétés' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 💼 COMMERCIAL — Vente & relation client
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'COMMERCIAL',
    tagline: 'Clients · ventes · facturation',
    icon: SectionHandshake,
    color: '#ec4899',
    items: [
      { href: '/clients',   moduleCode: 'clients',   label: 'Clients',     icon: Handshake,     color: '#8b5cf6', keywords: ['acheteurs'], description: 'Annuaire clients' },
      { href: '/marches',   moduleCode: 'marches',   label: 'Marchés',     icon: Globe,         color: '#3b82f6', keywords: ['export', 'local', 'prix'], description: 'Débouchés (export, local…)' },
      { href: '/commandes', moduleCode: 'commandes', label: 'Commandes',   icon: ClipboardList, color: '#ec4899', keywords: ['orders', 'ventes'], description: 'Bons de commande clients' },
      { href: '/factures',  moduleCode: 'factures',  label: 'Factures',    icon: Receipt,       color: '#f43f5e', keywords: ['invoice', 'facture', 'paiement', 'echeance', 'tresorerie'], description: 'Factures + échéances' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 📦 APPROVISIONNEMENT — Achats & stocks
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'APPROVISIONNEMENT',
    tagline: 'Fournisseurs · achats · stocks',
    icon: SectionShopping,
    color: '#f97316',
    items: [
      { href: '/fournisseurs', moduleCode: 'fournisseurs', label: 'Fournisseurs', icon: Truck,        color: '#f97316', keywords: ['suppliers'], description: 'Annuaire fournisseurs' },
      { href: '/achats',       moduleCode: 'achats',       label: "Bons d'achat", icon: ShoppingCart, color: '#eab308', keywords: ['bons', 'commande', 'po', 'achat direct'], description: 'BO + achats directs' },
      { href: '/stocks',       moduleCode: 'stocks',       label: 'Stocks',       icon: Package,      color: '#14b8a6', keywords: ['inventory', 'magasin', 'inventaire'], description: 'Inventaire + mouvements' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 💰 FINANCE — Budgets, coûts, compte d'exploitation, marges, analyses
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'FINANCE',
    tagline: 'Budgets · coûts · CPC · marges',
    icon: SectionWallet,
    color: '#f59e0b',
    items: [
      { href: '/admin/budgets',             moduleCode: 'budgets',             label: 'Budgets',               icon: Briefcase,    color: '#8b5cf6', keywords: ['budget', 'previsions'], description: 'Budgets prévisionnels par version' },
      { href: '/couts',                     moduleCode: 'couts',               label: 'Coûts',                 icon: Coins,        color: '#f59e0b', keywords: ['charges', 'cout', 'depenses'], description: 'Saisie des coûts réels' },
      { href: '/admin/amortissements',      moduleCode: 'amortissements',      label: 'Amortissements',        icon: Calculator,   color: '#a855f7', keywords: ['immo', 'amort', 'actifs'], description: 'Actifs immobilisés' },
      { href: '/admin/compte-exploitation', moduleCode: 'compte_exploitation', label: "Compte d'exploitation", icon: FileBarChart, color: '#10b981', keywords: ['cpc', 'rapport', 'budget', 'reel'], description: 'Budget vs Réel par catégorie' },
      { href: '/marges',                    moduleCode: 'marges',              label: 'Marges',                icon: TrendingUp,   color: '#10b981', keywords: ['rentabilite', 'profit', 'marge brute'], description: 'Rentabilité par variété/marché' },
      { href: '/analytique',                moduleCode: 'analytique',          label: 'IA & Analyses',         icon: Bot,          color: '#8b5cf6', keywords: ['ai', 'gemini', 'prediction', 'analytics', 'previsions'], description: 'Diagnostics & prévisions IA' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 👥 RH — Ressources humaines
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'RESSOURCES HUMAINES',
    tagline: 'Personnel · paie · CNSS',
    icon: SectionUsers,
    color: '#0ea5e9',
    items: [
      { href: '/rh',          moduleCode: 'rh',          label: 'Tableau de bord', icon: Users,         color: '#0ea5e9', keywords: ['hr', 'rh dashboard'], description: 'Vue d\'ensemble RH' },
      { href: '/rh/employes', moduleCode: 'rh_employes', label: 'Employés',        icon: UserSquare,    color: '#0ea5e9', keywords: ['salaries', 'tacheron', 'fermier', 'staff'], description: 'Annuaire employés + matricule auto' },
      { href: '/rh/paie',     moduleCode: 'rh_paie',     label: 'Paie',            icon: Banknote,      color: '#10b981', keywords: ['payroll', 'salaire', 'bulletin'], description: 'Bulletins mensuel/quinzaine' },
      { href: '/rh/conges',   moduleCode: 'rh_conges',   label: 'Congés',          icon: Palmtree,      color: '#f59e0b', keywords: ['vacation', 'absences', 'maladie'], description: 'Gestion des absences' },
      { href: '/rh/cnss',     moduleCode: 'rh_cnss',     label: 'CNSS',            icon: Building,      color: '#6366f1', keywords: ['cnss', 'amo', 'cotisations', 'damancom'], description: 'Déclarations CNSS' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 🔧 PARAMÉTRAGE — Configuration métier
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'PARAMÉTRAGE',
    tagline: 'Plan comptable · workflows · bot',
    icon: Sliders,
    color: '#64748b',
    items: [
      { href: '/admin/account-categories', moduleCode: 'plan_comptable', label: 'Plan comptable', icon: BookText,      color: '#0ea5e9', keywords: ['categories', 'comptable'], description: 'Catégories comptables' },
      { href: '/admin/workflows',          moduleCode: 'workflows',      label: 'Workflows',      icon: Workflow,      color: '#64748b', keywords: ['states', 'transitions'], description: 'États & transitions' },
      { href: '/rh/chatbot',               moduleCode: 'rh_chatbot',     label: 'Chatbot Telegram', icon: MessageSquare, color: '#26a5e4', keywords: ['bot', 'telegram', 'voice', 'ouvriers'], description: 'Saisie vocale par message' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // ⚙️ ADMINISTRATION — Utilisateurs & permissions
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'ADMINISTRATION',
    tagline: 'Comptes & permissions',
    icon: ShieldAlert,
    color: '#ef4444',
    items: [
      { href: '/admin/parametres',  moduleCode: 'users',  label: 'Paramètres globaux',  icon: Settings,    color: '#ef4444', keywords: ['settings', 'organisation', 'domaine', 'campagne live', 'identite', 'logo'], description: 'Identité du domaine, campagne live, options d\'affichage' },
      { href: '/admin/referentiels', moduleCode: 'users', label: 'Référentiels',        icon: List,        color: '#ef4444', keywords: ['listes', 'deroulantes', 'types', 'categories', 'unites', 'devises', 'no-code', 'referentiel'], description: 'Listes déroulantes paramétrables (types, catégories, unités) sans code' },
      { href: '/admin/users',       moduleCode: 'users',  label: 'Utilisateurs',        icon: UserCog,     color: '#ef4444', description: 'Comptes utilisateurs' },
      { href: '/admin/roles',       moduleCode: 'roles',  label: 'Rôles & Permissions', icon: ShieldCheck, color: '#ef4444', description: 'Rôles & matrice de permissions' },
      { href: '/admin/demo-reset',  moduleCode: 'users',  label: 'Démo / Reset',        icon: Database,    color: '#ef4444', keywords: ['nouvelle campagne', 'supprimer', 'reset', 'wipe', 'demo', 'nuclear'], description: 'Nouvelle campagne, suppression et reset (démo)' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 📚 AIDE
  // ────────────────────────────────────────────────────────────────────────
  {
    section: 'AIDE',
    tagline: 'Documentation',
    icon: SectionBook,
    color: '#0ea5e9',
    items: [
      { href: '/guide', moduleCode: 'dashboard', label: 'Guide utilisateur', icon: BookOpen, color: '#0ea5e9', description: 'Documentation complète' },
    ],
  },
]

/** Quick actions disponibles dans le Command Palette (créations rapides). */
export type QuickAction = {
  id: string
  label: string
  href: string
  icon: LucideIcon
  color: string
  keywords?: string[]
  /** Module requis pour afficher l'action */
  moduleCode?: string
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'new-harvest',    label: 'Nouvelle récolte',     href: '/recoltes',     icon: Sprout,        color: '#10b981', keywords: ['ajouter', 'créer', 'récolte'], moduleCode: 'recoltes' },
  { id: 'new-campaign',   label: 'Nouvelle campagne',    href: '/campagnes',    icon: Calendar,      color: '#22c55e', keywords: ['créer', 'campagne'], moduleCode: 'campagnes' },
  { id: 'new-greenhouse', label: 'Nouvelle serre',       href: '/serres',       icon: Box,           color: '#0ea5e9', keywords: ['créer', 'serre'], moduleCode: 'serres' },
  { id: 'new-employee',   label: 'Nouvel employé',       href: '/rh/employes',  icon: UserSquare,    color: '#0ea5e9', keywords: ['créer', 'employe'], moduleCode: 'rh_employes' },
  { id: 'new-invoice',    label: 'Nouvelle facture',     href: '/factures',     icon: Receipt,       color: '#f43f5e', keywords: ['créer', 'facture'], moduleCode: 'factures' },
  { id: 'new-cost',       label: 'Nouveau coût',         href: '/couts',        icon: Coins,         color: '#f59e0b', keywords: ['créer', 'coût'], moduleCode: 'couts' },
  { id: 'new-purchase',   label: 'Nouveau bon d\'achat', href: '/achats',       icon: ShoppingCart,  color: '#eab308', keywords: ['créer', 'achat'], moduleCode: 'achats' },
  { id: 'view-alerts',    label: 'Voir les alertes',     href: '/alertes',      icon: AlertTriangle, color: '#f59e0b', keywords: ['alertes', 'notifications'] },
]

/** Aplatit toute la nav en liste linéaire (utile pour la palette). */
export function flattenNav(nav: NavSection[] = NAV): { section: string; item: NavItem }[] {
  return nav.flatMap(s => s.items.map(item => ({ section: s.section, item })))
}

/** Trouve l'entrée de nav correspondant à un pathname (match exact ou préfixe). */
export function findNavItem(pathname: string): { section: string; item: NavItem } | null {
  const flat = flattenNav()
  const exact = flat.find(({ item }) => item.href === pathname)
  if (exact) return exact
  const candidates = flat.filter(({ item }) => pathname.startsWith(item.href + '/') || pathname === item.href)
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => b.item.href.length - a.item.href.length)[0]
}

/** Construit un fil d'ariane à partir d'un pathname. */
export function buildBreadcrumbs(pathname: string): { label: string; href?: string; icon?: LucideIcon }[] {
  if (pathname === '/' || pathname === '/login') {
    return [{ label: 'Dashboard', icon: LayoutDashboard }]
  }
  const found = findNavItem(pathname)
  if (!found) return [{ label: 'Page' }]
  return [
    { label: found.section, },
    { label: found.item.label, href: found.item.href, icon: found.item.icon },
  ]
}
