# Lot 133 — Interventions culturales / irrigation simple

État au 18 septembre 2026 : migration 133 appliquée par l’utilisateur, présence du schéma confirmée et recette SQL post-application réussie en transaction annulée. Interface locale accessible (HTTP 200). Aucun push GitHub ni déploiement Vercel.

## Décisions et périmètre

Le journal agronomique existant est conservé, sans conversion de son historique. Nouvelle entrée **Production → Interventions culturales** (`/interventions`).

Ce premier lot couvre **l’eau seule** : aucun engrais, pesticide, mouvement de stock ou coût automatique. Un traitement par le réseau d’irrigation reste un traitement phyto et ne doit pas contourner les contrôles de ce module.

Le catalogue de cadrage visible dans la page comprend irrigation, fertigation, nutrition foliaire, fertilisation/amendements, qualité de l’eau, biostimulation, auxiliaires, piégeage, confusion sexuelle, hygiène, entretien réseau, sol/substrat, pollinisation, ombrage, CO₂ et travaux culturaux. Les familles autres que l’irrigation sont **à venir**, et ne sont pas des prescriptions agronomiques par défaut. Ce catalogue est pour l’instant un référentiel de présentation dans le code, non une table administrable.

## Parcours livré

1. Créer un brouillon : ferme, campagne de cette ferme, serres actives, source d’eau, secteur libre facultatif, consignes.
2. Planifier une date, plusieurs dates/créneaux, ou une fréquence quotidienne, hebdomadaire, mensuelle, trimestrielle, annuelle avec intervalle et nombre d’occurrences. 100 occurrences maximum, horizon serveur 3 ans. Dates/heures saisies dans le fuseau du navigateur indiqué dans l’écran ; stockage UTC.
3. Vérifier l’aperçu, enregistrer puis soumettre le programme.
4. Si validation activée (défaut), une autre personne habilitée approuve ou refuse tout le programme. Un seul niveau dans ce lot.
5. Confirmer chaque occurrence : date réelle, quantité réelle, méthode de détermination, observation/justification. La date réelle doit suivre la soumission et l’approbation éventuelle et ne pas être future.
6. Clôture automatique lorsque toutes les occurrences sont confirmées. Annulation du restant avec motif, sans effacer les réalisations existantes.

Programmes immuables : pas d’édition du brouillon dans cette version. Annuler et créer un nouveau programme pour corriger. Pas de reprise automatique d’un programme refusé. Pas d’amendement d’un réel confirmé : évolution distincte avec audit à prévoir.

## Eau : unités explicites

- Saisie directe : litres globaux par occurrence, toutes les serres sélectionnées.
- Estimation : minutes × débit total en L/h ÷ 60.
- Réel mesuré : (index après − index avant) en m³ × 1 000.
- Pas de débit, volume, dose ou surface déduits arbitrairement ; pas de défaut 1 000 L/ha hérité du phyto.
- Affichage français, espace de milliers et deux décimales. Saisie décimale avec virgule ou point.
- Le volume global n’est **pas** réparti automatiquement par serre. Les KPI eau/kg et les imputations nécessiteront une règle explicite ou des compteurs par secteur/serre.

## Sécurité et habilitations

Nouvelles habilitations visibles par le catalogue existant de fonctions :

| Fonction existante | Planifier | Valider | Confirmer le réel |
|---|---|---|---|
| Chargé d’irrigation | Oui | Non | Oui |
| Responsable fertigation | Oui | Oui | Oui |
| Responsable d’exploitation | Non par défaut | Oui | Non par défaut |

Les habilitations respectent les affectations société/ferme et les dérogations utilisateur existantes. Il faut aussi l’accès en lecture au module Agronomie, un compte actif, un mot de passe à jour et une appartenance à la société.

Les écritures directes sur les nouvelles tables sont interdites aux clients. Les RPC contrôlent le périmètre, les états, la séparation demandeur/validateur et l’idempotence. Les tables de consultation sont protégées par RLS. Un doublon de confirmation ne consomme rien et ne réécrit pas le réel.

Paramètre de validation par société, réservé à son administrateur et historisé. Le choix est figé lors de la soumission ; une désactivation ultérieure n’approuve pas les demandes déjà soumises. Sans validation requise, le programme est exécutable sans inventer un validateur.

## Vérification et déploiement

- Résultats du 18 septembre 2026 : 124 tests unitaires (18 fichiers), recette SQL complète annulée réussie, recette UI simulée desktop/mobile réussie. Table `irrigation_programs` absente après les essais : aucun schéma ou jeu de données métier de test persisté.
- Migration : `supabase/migrations/133_irrigation_programs.sql`. Dépend du socle multi-sociétés/fonctions existant, pas de 130–132.
- Tests calculs/dates : `lib/irrigation.test.ts`.
- Test SQL : `node scripts/check-irrigation-sql.mjs`. Crée le schéma et des données temporaires dans **une transaction entièrement annulée**. Ne conserve ni habilitations, ni programmes, ni changements de paramétrage. Ne déclenche aucune notification externe.
- Recette UI locale : `node scripts/test-irrigation.mjs`, requêtes Supabase interceptées, aucune donnée métier écrite.
- Après application : `node scripts/check-irrigation-sql.mjs --after` vérifie le parcours sans réexécuter la migration. Réussi le 18 septembre 2026. Reste la recette métier dans l’interface à deux comptes sur une ferme de test ; ne pas réappliquer 133.

## Reste à faire — ne pas présenter comme livré

1. Référentiel administrable de secteurs, rattachement des compteurs et sources d’eau ; suivi au niveau serre.
2. Édition/versionnement des programmes, exceptions de calendrier, cycles quotidiens récurrents multiples et date de fin automatique.
3. Plusieurs niveaux de validation, centralisation dans « Mes validations », notifications push/Telegram et rappels. Le premier lot utilise l’écran Interventions (adapté au mobile), sans notification envoyée.
4. Fertigation : recettes/cuvelages, concentration finale vs cuve mère, injection, compatibilités validées par expert, besoins/stock par occurrence, consommation réelle et coûts.
5. Autres familles et contraintes propres aux produits et organismes vivants.
6. Coût de l’eau/énergie/main-d’œuvre et allocations par serre/campagne ; centre d’alertes global. Les retards sont déjà visibles dans cet écran uniquement.

## Références de cadrage

- FAO, bonnes pratiques sous serre méditerranéenne : https://www.fao.org/4/i3284e/i3284e.pdf
- CTIFL, cultures hors-sol : https://www.ctifl.fr/expertise-culture-hors-sol-tomate-concombre-fraise
- ONSSA, index et autorisations : https://eservice.onssa.gov.ma/

Ces références structurent les familles métier ; aucune dose, fréquence de traitement obligatoire ou homologation commerciale n’est créée par ce lot.
