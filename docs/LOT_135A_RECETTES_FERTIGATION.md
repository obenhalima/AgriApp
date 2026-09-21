# Lot 135A — Recettes de fertigation et estimation des besoins

## Périmètre livré en local

- Accès : Production → Interventions culturales → **Fertigation — recettes d’engrais et calcul des besoins** (`/interventions/fertigation`).
- Recettes par client et ferme, composées d’articles actifs de catégorie **engrais**, sans lien phytosanitaire. Auteur, date, consignes et unités conservés. Copier une recette ne modifie pas l’original.
- Nouvelle habilitation **Préparer les recettes de fertigation** (`fertigation.recipe`), attribuée par défaut à la fonction responsable fertigation ; overrides et portée ferme existants respectés. Un administrateur n’est pas automatiquement un prescripteur fertigation.
- Concentrations saisies par le responsable, en kg/m³, g/m³, L/m³ ou mL/m³ de **solution finale distribuée**. Aucune dose automatique, aucune conversion masse/volume, aucun calcul d’injection depuis une cuve mère.
- Quantité = volume final en litres / 1 000 × concentration × conversion d’unité. Stock en kg/g ou L/mL seulement. Conditionnements non normalisés (sac, bidon, unité) exclus du choix avec avertissement.
- Simulation dans un entrepôt actif de la ferme choisie : besoin, solde physique courant et manque. Le manque n’empêche pas d’enregistrer la recette.
- Deux décimales à l’affichage, quatre au calcul stock ; petites quantités non arrondies silencieusement à zéro côté serveur. La simulation est effacée dès qu’un de ses paramètres change.
- Enregistrement idempotent avec identifiant conservé en cas de réponse incertaine. Mutations directes et accès anonymes interdits, isolation société/ferme vérifiée côté serveur.

## Application

1. La migration **133** doit déjà être appliquée, ainsi que le socle stocks/entrepôts. **135A ne dépend pas de 134**, qui reste nécessaire aux notifications d’irrigation.
2. Exécuter intégralement `supabase/migrations/135a_fertigation_recipes.sql` dans Supabase, une seule fois, après accord sur la base partagée.
3. Affecter la fonction responsable fertigation ou l’habilitation de préparation sur la ferme concernée.
4. Recharger l’écran local. Ajouter les engrais manquants dans Stocks, avec une unité normalisée.
5. Préparer une recette, simuler un volume et choisir l’entrepôt de la ferme. Enregistrer même si le stock manque.

## Limites explicites et lot 135B

Ce lot **n’autorise aucune application**. Il ne crée ni programme, ni demande à valider, ni notification, ni réservation, ni mouvement de stock, ni coût. L’affichage « solde suffisant » concerne cette simulation seule : il ne tient pas compte des autres interventions futures.

Le prochain lot raccordera les recettes à la campagne, aux serres, aux dates/récurrences, aux validations distinctes du demandeur et aux notifications. Il devra figer la recette validée, calculer la disponibilité cumulée par occurrence, autoriser la planification sans stock, puis consommer atomiquement les quantités réelles au moment de l’exécution. L’imputation des coûts doit réutiliser le CUMP et les allocations existantes, sans double comptage.

La compatibilité des mélanges, la solubilité, le pH/EC et la stratégie nutritionnelle ne sont pas certifiés par ce calculateur. Aucune validation agronomique implicite liée à l’enregistrement d’une recette.

## Vérification

- `node node_modules/vitest/vitest.mjs run` : conversions, virgules, incompatibilités et entrées invalides ; suite complète 129 tests réussis.
- `node scripts/check-fertigation-recipes-sql.mjs` : DDL et fixtures dans une transaction **ROLLBACK**, contrôles d’accès, calculs, entrepôt, stock nul, idempotence et absence de mouvements/coûts. Réussi ; migration non appliquée durablement.
- `node scripts/test-fertigation-recipes.mjs` : réussi sur ordinateur et mobile 390 px, avec HTTP Supabase simulé ; aucune donnée métier écrite.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` : réussi.
- Après application : `node scripts/check-fertigation-recipes-sql.mjs --after` conserve les tests dans une transaction annulée.

Aucun push GitHub, déploiement Vercel ou envoi de notification dans ce lot.
