# 🍅 TomatoPilot

Application de gestion intégrée pour ferme de tomates sous serre.

## Stack
- **Frontend** : Next.js 14 + TypeScript + Tailwind CSS
- **Base de données** : Supabase (PostgreSQL)
- **Graphiques** : Recharts
- **Déploiement** : Vercel

## Modules
- 📊 Dashboard analytique avec KPIs dynamiques
- 🏗️ Gestion Fermes & Serres
- 🌱 Référentiel Variétés
- 📅 Campagnes de Production
- 📈 Suivi Production & Récoltes
- 🌍 Marchés & Stratégie Commerciale
- 👥 Clients & Factures
- 🏭 Fournisseurs & Achats
- 📦 Gestion des Stocks
- 💰 Coûts & Budget
- 🤖 IA & Simulation (What-If Analysis)
- 🔔 Centre d'Alertes

## Installation locale

```bash
# 1. Cloner le repo
git clone https://github.com/obenhalima/AgriApp
cd AgriApp

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env.local
# Remplir NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY

# 4. Lancer le schéma sur Supabase
# Copier le contenu de supabase/migrations/001_initial_schema.sql
# dans l'éditeur SQL de votre dashboard Supabase

# 5. Démarrer l'application
npm run dev
```

## Variables d'environnement (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Structure du projet

```
app/
  page.tsx              # Dashboard
  serres/               # Gestion serres
  varietes/             # Référentiel variétés
  campagnes/            # Campagnes
  production/           # Suivi production
  marches/              # Marchés
  clients/              # Clients
  factures/             # Factures
  stocks/               # Stocks
  couts/                # Coûts & Budget
  analytique/           # IA & Simulation
  alertes/              # Alertes
components/
  layout/               # Sidebar, Topbar
  dashboard/            # KpiCard, Charts
lib/
  supabase.ts           # Client Supabase + types
supabase/
  migrations/           # Schéma SQL complet
```
