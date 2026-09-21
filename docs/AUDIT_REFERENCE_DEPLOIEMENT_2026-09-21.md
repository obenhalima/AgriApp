# Audit de préparation de la version de référence

Date : 21 septembre 2026. Périmètre : dépôt local FarmPilot.

## Verdict

**NO GO pour dupliquer directement le dépôt comme instance client de production.**
Le socle applicatif est réutilisable, mais l'installation sur une base vierge n'est pas encore reproductible et indépendante de la démo.

Audit statique local, sans écriture en base, création de projet, branche, commit, push, déploiement ni envoi de notifications. Aucun secret lu dans `.env.local`. Les états réels des services distants et la concordance schéma/migrations restent à vérifier en lecture seule.

## Décisions confirmées

- Base actuelle conservée comme démo/dev, sans nettoyage ni conversion en production.
- Un projet Supabase et un déploiement applicatif par client ; plusieurs fermes dans une même instance client.
- Même code source, versions identifiées ; pas de branche permanente par client.
- Catalogue partagé synchronisé et versionné ; listes Station, prix, utilisateurs et données opérationnelles propres aux clients.
- Branche `reference` après validation d'une installation vierge, pas avant.

## Constats prioritaires et preuves

| Priorité | Constat observé | Preuve locale | Action avant référence |
|---|---|---|---|
| P0 | Installation dépendante d'un compte QA | `073_platform_admin_bootstrap.sql` exige exactement un profil `agenttest@test.com` puis lui accorde le statut plateforme | Bootstrap explicite du premier administrateur client, sans compte de test et sans élévation plateforme automatique |
| P0 | Données de démonstration mêlées au schéma | `001_initial_schema.sql`, section « FERME DEMO » : ferme, variétés, prix et marchés | Extraire des seeds distincts : référentiels approuvés / démo ; aucune quantité, prix ou ferme fictifs dans le socle client |
| P0 | Dépendances à BENHALIMA dans la chaîne | 072 crée DOM-BENHALIMA ; 076 et 079 recherchent ce domaine ; 106G cible un UUID spécifique | Construire une baseline neutre ; garder les réparations historiques hors installation client |
| P0 | Historique Git incomplet par rapport à l'application locale | Branche `main`, HEAD `496a3c6` ; nombreux fichiers modifiés/non suivis, notamment migrations 130–140 et nouveaux modules | Inventorier puis intégrer uniquement les changements revus ; ne pas committer `outputs/` en bloc |
| P0 | Installation vierge non éprouvée | Absence de `supabase/config.toml` et de workflow `.github` dans le dépôt inspecté ; suffixes de migrations 106b/106F/135a/137b | Définir un ordre explicite compatible avec l'outil retenu, un manifeste et une recette vierge ; ne pas réordonner aveuglément l'historique déjà appliqué |
| P0 | URL de démo figée dans le bootstrap push | `scripts/configure-mobile-dispatch.mjs:21` écrit APP_PUBLIC_URL vers agri-app-orpin.vercel.app | Paramétrer et vérifier l'identité du projet cible avant toute configuration ; pas d'envoi pendant l'installation |
| P1 | Build permissif | `next.config.js` : ignoreBuildErrors et ignoreDuringBuilds | Rendre TypeScript et lint bloquants dans la chaîne de livraison ; le contrôle TypeScript indépendant passe aujourd'hui |
| P1 | Origines et identité codées pour la démo | `next.config.js` allowedOrigins ; `app/layout.tsx`, `app/login/page.tsx`, `lib/appSettings.ts`, migration 045 | Paramétrage d'instance et suppression des valeurs de marque BENHALIMA par défaut dans le socle |
| P1 | Fonctions de remise à zéro présentes | migrations 036/067 et `app/admin/demo-reset/page.tsx` | Décider leur exclusion du socle production ou un verrou serveur d'environnement ; masquer le menu ne suffit pas |
| P1 | Provisionnement incomplet des services | 11 dossiers Edge Functions ; Storage 096 ; cron/Vault/pg_net 126 | Manifeste par service, secrets séparés, politiques Storage, Auth et URLs de retour, tests par instance |
| P1 | Catalogue central non installé comme service partagé | Référentiels et catalogue actuellement dans le schéma applicatif ; aucun mécanisme de synchronisation central identifié dans le périmètre inspecté | Définir propriétaire, identifiants stables, versions, conflits et conservation des historiques avant implémentation |
| P1 | Import disponible mais pas assistant complet d'initialisation | `app/admin/imports/page.tsx`, `lib/imports/*`, migration 017 | Réutiliser lecture Excel/mapping ; auditer les écritures, ajouter staging persistant, idempotence, reprise et validation par étape |

Les constats d'absence sont limités au dépôt inspecté : ils ne prouvent pas l'absence d'une configuration manuelle distante.

## Configuration à inventorier par instance

- Front : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, nom public du bot si utilisé.
- Serveur Next/Vercel : SUPABASE_SERVICE_ROLE_KEY, APP_PUBLIC_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET, TELEGRAM_BOT_TOKEN selon services activés.
- Edge : variables Supabase, MOBILE_DISPATCH_SECRET, clés VAPID, APP_PUBLIC_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_PILOT_ENABLED, GEMINI_API_KEY si IA activée.
- `.env.example` existe mais ne couvre pas à lui seul le provisionnement Edge/Vault/Auth/Storage.
- `.env.local` est ignoré par Git et n'est pas suivi dans l'index constaté. Ce contrôle n'est pas un audit exhaustif de secrets ni de l'historique Git.
- La migration 126 programme un cron ; sa fonction ne fait rien sans URL/secret Vault. Ne pas cloner secrets, abonnements push, invitations, sessions ou files d'envoi de la démo.
- Choisir un canal d'envoi principal et documenter les rôles respectifs du dispatcher Next et du dispatcher Edge existants.

## Réutilisable

Authentification/rôles, isolation par domaine, garde-fous métier, navigation configurable et modèle d'import Excel existent. Leur présence n'atteste pas d'une recette sécurité exhaustive.

Le modèle multi-domaines peut être conservé dans chaque base client pour compatibilité, sans partager les données entre projets. Une base dédiée ne supprime pas les contrôles RLS ni les habilitations.

## Vérifications exécutées

- `npx tsc --noEmit` : réussi.
- `npx vitest run lib/profileNavigation.test.ts lib/treatmentCalendar.test.ts lib/harvestPeople.test.ts lib/agronomy360.test.ts` : 23 tests réussis, 4 fichiers.
- Inspection des fichiers de configuration, migrations ciblées, routes d'import et services externes ; aucune exécution de migration.
- Pas de build de production (le serveur local utilise .next), pas de tests E2E complets ni de restauration sur base vierge.
- Pas de scan complet des secrets, de vérification des sauvegardes distantes, de tests Auth/Storage/cron sur nouvelle instance ou d'audit complet des politiques RLS.

## Plan de livraison

### Lot R1 — Socle neutre, sans changer la démo

1. Inventaire versionné des migrations : DDL, seeds, reprises historiques et actions externes.
2. Baseline dédiée aux installations neuves ; ne pas modifier rétroactivement les migrations appliquées de la démo.
3. Seeds validés séparés des données d'exemple ; première identité admin créée explicitement.
4. Paramètres d'instance et garde contre le provisionnement du projet démo par erreur.
5. Matrice des services requis/optionnels, activation des notifications désactivée jusqu'à recette.

Livrables : baseline, manifeste des seeds/services, modèle de configuration complet, procédure de bootstrap. Pas encore une instance client active.

### Lot R2 — Installation et guide testés

Sur un projet jetable isolé à autoriser/provisionner : installation, nouveau compte administrateur, accès non-admin, Storage, cycle métier minimal, deuxième exécution maîtrisée, sauvegarde/restauration vérifiée. Documenter chaque étape et critère de succès. Publication `reference` et tag seulement après réussite. Les mises à jour des instances existantes auront une chaîne distincte du bootstrap initial.

### Lot R3 — Wizard d'initialisation

Client → fermes → serres → entrepôts → campagne → plantations. Templates et saisie directe, exemples séparés, journal d'import, erreurs par cellule, rapprochements par identifiants métier stables, transactions par lot, protection contre doublons/reprises et écrasements. Progression fondée sur les données validées. Compléter ensuite stocks d'ouverture, coûts, partenaires, personnes et soldes selon périmètre approuvé.

### Lot R4 — Premier client

Projet Supabase client + Vercel, version épinglée, secrets propres, saisie/import réels, contrôles métier signés, activation progressive des services. Conserver un dossier de livraison : version, migrations, seeds, contrôles, restauration et responsables.

## Conditions de passage en production

Installation vierge réussie ; aucune identité QA ni donnée démo ; bootstrap administrateur client sûr ; cohérence des URL/projets ; isolation confirmée ; sauvegarde/restauration testées ; aucune notification vers la démo ; guide suivi par un second opérateur ; validation des données réelles et approbation d'activation.
