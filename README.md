# 🍅 ItriX Farm

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

## Import de factures fournisseurs

Dans **Factures → Fournisseurs**, cliquez sur **Charger une facture** ou glissez-déposez les fichiers. Les formats PDF, JPG, PNG et HEIC sont acceptés, jusqu’à 10 Mo par fichier. Une fois l’analyse terminée, **Vérifier** ouvre le formulaire de création avec l’aperçu à gauche. Corrigez les valeurs, confirmez les rapprochements et enregistrez. Le document original est téléchargeable depuis la fiche de la facture fournisseur.

### Déploiement

1. Appliquer les migrations d’import sur l’environnement cible. Le bucket `supplier-invoice-imports` est privé. Les écritures d’import passent par le serveur, qui vérifie le profil actif et la permission `achats.create` du client. Le formulaire écrit la facture via le flux Supabase existant et le déclencheur rattache l’import dans la même transaction.
2. Déployer l’Edge Function `supplier-invoice-extract` avec `supabase functions deploy supplier-invoice-extract --no-verify-jwt`. La fonction vérifie elle-même le jeton utilisateur avec Supabase Auth, ainsi que le rôle de service pour la route de traitement. Renseigner ses variables d’environnement côté serveur.
3. Installer **Node.js 22**, **Poppler** (`pdftoppm`) et **ImageMagick 7** (`magick`) avec le délégué `libheif` prenant en charge HEIC sur l’hôte du worker. Vérifier le support en décodant un fichier HEIC de test. Lancer le worker sous un superviseur de processus, avec accès réseau à Supabase et des fichiers temporaires privés.

```sh
node --env-file=.env.local scripts/supplier-invoice-worker.mjs
```

Le worker utilise `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. `INVOICE_EXTRACTION_URL` permet de cibler une autre instance de la fonction. `PDFTOPPM_PATH` et `MAGICK_PATH` permettent de sélectionner les exécutables. Le worker vérifie l’empreinte du fichier, réclame les tâches avec un bail de dix minutes et reprend un bail expiré. Relancer le chargement du même fichier reprend un téléversement interrompu.

### Fournisseurs d’extraction

| Variable | Gemini | Ollama |
| --- | --- | --- |
| `EXTRACTION_PROVIDER` | `gemini` | `ollama` |
| `GEMINI_API_KEY` | Clé Google AI Studio | — |
| `GEMINI_MODEL` | ID Flash compatible avec les sorties structurées et le quota de votre projet | — |
| `OLLAMA_URL` | — | URL privée accessible depuis le runtime Edge |
| `OLLAMA_MODEL` | — | `qwen3-vl:8b` par défaut |

Ollama doit être exécuté avec le modèle vision installé sur un serveur disposant des ressources nécessaires. Pour un service sur réseau privé, exécuter la fonction dans un environnement Supabase qui accède à ce réseau. Le `localhost` d’une Edge Function hébergée désigne son propre environnement. Garder les clés et la clé de rôle de service hors du navigateur et de Git.

**Confidentialité.** Google peut utiliser les données envoyées via l’offre gratuite Gemini pour améliorer ses produits. Utilisez Ollama pour les factures sensibles. L’original et les résultats d’extraction restent stockés dans le projet Supabase configuré. [Conditions Gemini API](https://ai.google.dev/gemini-api/terms)

### Limites et tests

- Le modèle reçoit les cinq premières pages au maximum, avec une rasterisation à environ 150 dpi et une image limitée à 2 000 pixels sur le grand côté. Le PDF original complet reste attaché.
- Les suggestions de fournisseur et d’article doivent être vérifiées. Les lignes, le détail du timbre et les corrections restent dans le dossier d’import. Les réceptions d’achat continuent de gérer les entrées en stock.
- Les tâches peuvent échouer si le fournisseur est indisponible, si le quota Gemini est atteint ou si le runtime dépasse ses limites. Un message apparaît dans la liste. **Relancer** remet la tâche en file.
- Le décodeur HEIC dépend de la compilation locale d’ImageMagick. [Formats ImageMagick](https://imagemagick.org/script/formats.php)

```sh
deno test --config supabase/functions/supplier-invoice-extract/deno.json supabase/functions/supplier-invoice-extract/providers_test.ts
node --test scripts/supplier-invoice-preprocess.test.mjs
pwsh -File scripts/test-supplier-invoice-import-postgres.ps1
npm run extract-sample -- ./factures-exemples
```

Pour inclure le décodage HEIC dans les tests, définir `TEST_HEIC_FILE` avec le chemin d’un fichier HEIC de test. L’ICE du client se renseigne dans `domains.ice` pour activer le contrôle du destinataire.

Exportez les variables du fournisseur avant de lancer `extract-sample`. Le script utilise les variables du fournisseur courant, puis affiche un objet JSON par fichier avec les données et les résultats des contrôles. Exécutez-le une fois pour chaque fournisseur avec un dossier de factures de test et la configuration correspondante. Cette commande transmet les documents au fournisseur sélectionné.
