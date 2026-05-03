'use client'
import Link from 'next/link'

// Mapping module → ancre dans le guide.
// Les ancres sont définies dans public/guide-utilisateur.html (id sur <div class="page">).
const ANCHORS: Record<string, string> = {
  // Pilotage
  dashboard: 'dashboard',
  recoltes: 'recoltes',
  production: 'production',
  agronomie: 'agronomie',
  // Commerce
  marches: 'commerce',
  clients: 'commerce',
  commandes: 'commerce',
  factures: 'commerce',
  // Exploitation
  fermes: 'exploitation',
  serres: 'exploitation',
  varietes: 'exploitation',
  campagnes: 'exploitation',
  // Ressources
  fournisseurs: 'ressources',
  achats: 'ressources',
  stocks: 'ressources',
  // Finances
  couts: 'finances',
  marges: 'finances',
  analytique: 'finances',
  // Admin / Paramétrage
  plan_comptable: 'admin',
  budgets: 'admin',
  compte_exploitation: 'admin',
  workflows: 'admin',
  imports: 'admin',
  users: 'admin',
  roles: 'admin',
  // Annexes
  workflow_demarrage: 'workflow',
  couleurs: 'couleurs',
  intro: 'intro',
}

type Props = {
  /** clé du module (ex: 'recoltes', 'couts'). Voir ANCHORS pour la liste. */
  module: string
  /** style du bouton */
  variant?: 'icon' | 'text' | 'pill'
  /** ouvre dans un nouvel onglet (true) ou dans la page guide intégrée (false, défaut) */
  newTab?: boolean
  /** texte affiché si variant='text' ou 'pill' */
  label?: string
  /** classe CSS additionnelle */
  className?: string
}

export function HelpLink({ module, variant = 'icon', newTab = false, label = 'Aide', className }: Props) {
  const anchor = ANCHORS[module] ?? 'intro'
  const href = `/guide#${anchor}`

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all .15s',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-sub)',
  }

  const styles: Record<string, React.CSSProperties> = {
    icon: {
      ...baseStyle,
      width: 24, height: 24, borderRadius: '50%',
      background: 'var(--bg-2)',
      border: '1px solid var(--bd-1)',
      justifyContent: 'center',
      fontSize: 12, fontWeight: 700,
    },
    text: {
      ...baseStyle,
      fontSize: 11.5,
      padding: '2px 4px',
    },
    pill: {
      ...baseStyle,
      padding: '4px 10px',
      borderRadius: 6,
      background: 'var(--bg-1)',
      border: '1px solid var(--bd-1)',
      fontSize: 11.5,
    },
  }

  const linkProps = newTab
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {}

  return (
    <Link href={href} {...linkProps} className={className}
      style={styles[variant]}
      title={`Voir la section "${anchor}" du guide utilisateur`}>
      {variant === 'icon' ? (
        <span>?</span>
      ) : (
        <>
          <span style={{ fontSize: 13 }}>📖</span>
          <span>{label}</span>
        </>
      )}
    </Link>
  )
}
