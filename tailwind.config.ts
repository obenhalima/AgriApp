import type { Config } from 'tailwindcss'

/**
 * FarmPilot — Design System Tailwind config
 *
 * Stratégie : Tailwind expose des tokens sémantiques qui pointent vers nos
 * CSS variables existantes (`--bg-base`, `--neon`, etc.) déjà définies dans
 * globals.css pour les modes light + dark. Aucune duplication.
 *
 * Usage : `bg-surface-base text-fg-primary border-border-default` etc.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1600px',
      },
    },
    extend: {
      // ─── Surfaces & couleurs sémantiques ───
      colors: {
        // Surfaces (4 niveaux d'élévation)
        surface: {
          base:    'var(--bg-base)',
          raised:  'var(--bg-card)',
          sunk:    'var(--bg-deep)',
          hover:   'var(--bg-hover)',
          input:   'var(--bg-input)',
        },
        // Textes
        fg: {
          primary:   'var(--tx-1)',
          secondary: 'var(--tx-2)',
          tertiary:  'var(--tx-3)',
          muted:     'var(--tx-4)',
        },
        // Bordures
        border: {
          subtle:  'var(--border)',
          DEFAULT: 'var(--border)',
          strong:  'var(--border-md)',
          focus:   'var(--neon)',
        },
        // Brand (vert agritech ou indigo selon thème)
        brand: {
          DEFAULT: 'var(--neon)',
          dim:     'var(--neon-dim)',
          accent:  'var(--neon-2)',
        },
        // Sémantiques
        success: { DEFAULT: 'var(--neon)',   dim: 'var(--neon-dim)' },
        warning: { DEFAULT: 'var(--amber)',  dim: 'var(--amber-dim)' },
        danger:  { DEFAULT: 'var(--red)',    dim: 'var(--red-dim)' },
        info:    { DEFAULT: 'var(--blue)',   dim: 'var(--blue-dim)' },
        // Métiers
        revenue: 'var(--neon)',
        expense: 'var(--red)',
        neutral: 'var(--tx-3)',
        // Données viz (palette 8 teintes harmonieuses pour charts)
        data: {
          1: '#6366f1',
          2: '#10b981',
          3: '#f59e0b',
          4: '#ef4444',
          5: '#8b5cf6',
          6: '#06b6d4',
          7: '#ec4899',
          8: '#14b8a6',
        },
        // Conserver les anciens tokens pour compat
        soil:   '#2c1f0e',
        bark:   '#3d2b14',
        moss:   '#4a5a2a',
        leaf:   'var(--leaf)',
        sprout: '#7aab45',
        lime:   '#a8c96a',
        straw:  '#f5e6c0',
        cream:  '#faf6ed',
        sand:   'var(--sand)',
        ochre:  '#c8882a',
        tomato: '#d94535',
        rust:   'var(--rust)',
        sky:    '#4a8ab0',
      },

      // ─── Familles de fonts ───
      fontFamily: {
        sans:    ['var(--font-body)',    'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Geist', 'sans-serif'],
        mono:    ['var(--font-mono)',    'Geist Mono', 'monospace'],
      },

      // ─── Tailles typo (5 niveaux) ───
      fontSize: {
        'caption':     ['11px', { lineHeight: '1.4', letterSpacing: '0.02em' }],
        'body-sm':     ['12.5px', { lineHeight: '1.5' }],
        'body':        ['13.5px', { lineHeight: '1.55' }],
        'body-lg':     ['15px',  { lineHeight: '1.55' }],
        'heading-sm':  ['14px',  { lineHeight: '1.3', fontWeight: '600' }],
        'heading':     ['16px',  { lineHeight: '1.3', fontWeight: '600' }],
        'heading-lg':  ['18px',  { lineHeight: '1.3', fontWeight: '700' }],
        'display-sm':  ['22px',  { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '700' }],
        'display':     ['28px',  { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-lg':  ['36px',  { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '800' }],
        'display-xl':  ['44px',  { lineHeight: '1',    letterSpacing: '-0.03em',  fontWeight: '800' }],
        'display-2xl': ['56px',  { lineHeight: '1',    letterSpacing: '-0.035em', fontWeight: '800' }],
      },

      // ─── Spacing strict 4px ───
      spacing: {
        'xs':  '4px',
        'sm':  '8px',
        'md':  '12px',
        'lg':  '16px',
        'xl':  '24px',
        '2xl': '32px',
        '3xl': '48px',
        '4xl': '64px',
      },

      // ─── Radii ───
      borderRadius: {
        'sm':   '4px',
        'md':   '8px',
        'lg':   '12px',
        'xl':   '16px',
        '2xl':  '20px',
        DEFAULT: '8px',
      },

      // ─── Élévations ───
      boxShadow: {
        'flat':     'none',
        'raised':   '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
        'floating': '0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04)',
        'overlay':  '0 12px 32px rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.06)',
        'modal':    '0 24px 60px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.08)',
        'glow':     '0 0 24px var(--neon-dim)',
        'glow-lg':  '0 0 48px var(--neon-dim), 0 8px 32px var(--neon-dim)',
      },

      // ─── Animations & transitions ───
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      keyframes: {
        // Existing
        'fade-in':       { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up':       { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-down':     { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'none' } },
        // Stagger reveal
        'slide-up':      { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'none' } },
        // Skeleton shimmer
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Glow pulse pour live indicators
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 var(--neon-dim)' },
          '50%':      { boxShadow: '0 0 0 8px transparent' },
        },
        // Conic gradient rotation (premium border)
        'rotate-conic': {
          'from': { '--rotation': '0deg' } as any,
          'to':   { '--rotation': '360deg' } as any,
        },
        // Sparkle / shine sweep
        'shine': {
          '0%':   { transform: 'translateX(-100%) skewX(-15deg)' },
          '100%': { transform: 'translateX(200%) skewX(-15deg)' },
        },
      },

      animation: {
        'fade-in':    'fade-in 0.3s ease-out',
        'fade-up':    'fade-up 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'fade-down':  'fade-down 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-up':   'slide-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'shimmer':    'shimmer 2.4s linear infinite',
        'glow-pulse': 'glow-pulse 2s ease-out infinite',
        'shine':      'shine 1.6s ease-out',
      },

      // ─── Background gradients ───
      backgroundImage: {
        'gradient-radial':  'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
        'gradient-conic':   'conic-gradient(from var(--rotation, 0deg), var(--tw-gradient-stops))',
        'shimmer':          'linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent)',
        'brand-gradient':   'linear-gradient(135deg, var(--neon) 0%, var(--neon-2) 100%)',
        'success-gradient': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'danger-gradient':  'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        'warning-gradient': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        'info-gradient':    'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      },

      // ─── Container queries ───
      screens: {
        'xs': '480px',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}
export default config
