# Correction des paies de quinzaine

## Activation

La migration `supabase/migrations/20261120170502_payroll_corrections.sql` dépend des migrations de préparation de paie, de calcul net, de contrôle des anomalies et d’accès administrateur RH déjà présentes dans le dépôt. Elle conserve leurs contrôles et s’arrête si la version de la fonction de publication diffère de celle attendue.

Elle est prévue pour application manuelle. Les tests automatisés l’appliquent uniquement à une base PostgreSQL temporaire sur `127.0.0.1`. Aucun schéma distant ni paiement réel n’est modifié par ces tests.

## Test dans l’application locale

1. Ouvrir `http://localhost:3001/rh/paie/preparation`, sélectionner DOMBEN501, la ferme et une quinzaine validée.
2. Sans paiement enregistré, choisir **Rouvrir la paie**, saisir le motif puis confirmer. Avec un paiement, le bouton est **Préparer une régularisation**.
3. Modifier les heures de saisie manuelle, les taux, primes ou retenues. Les heures provenant du pointage se corrigent dans le pointage, puis se rechargent dans la paie.
4. Contrôler le tableau avant/après par employé : net, coût employeur, écart, payé, reste à payer et trop-perçu.
5. Confirmer de nouveau les primes et retenues, puis valider la paie. Vérifier le détail historique de la correction et les coûts de la campagne.
6. Pour une hausse après paiement, vérifier le complément payable. Pour une baisse sous le montant déjà payé, vérifier le **Trop-perçu à régulariser** : aucun remboursement, retenue ou compensation automatique n’est créé.
7. Tester également **Abandonner la correction** : la dernière version validée est restaurée et l’abandon reste dans l’historique.

## Règles

- Ouverture et abandon réservés à un responsable disposant de `rh_paie/admin`, avec profil actif et accès au client.
- Le motif d’ouverture est obligatoire. Versions initiale et corrigée, bulletins, coûts initiaux, auteur et dates sont conservés dans l’audit.
- Les paiements sont suspendus pendant la correction. Les bulletins et coûts publiés restent à leur ancienne valeur jusqu’à la revalidation.
- La revalidation conserve les identifiants de période et de bulletin, ainsi que tous les paiements. Les coûts sont remplacés atomiquement ; ils ne sont pas additionnés aux anciens coûts.
- Un employé ayant reçu un paiement ne peut pas être retiré de la paie corrigée.
- Une correction de première quinzaine est bloquée si une paie suivante du même mois est déjà validée pour les mêmes employés. Cette version ne cascade pas automatiquement les corrections vers les paies suivantes.
- Une quinzaine suivante ne peut pas être validée tant que la correction précédente du même mois reste ouverte pour les mêmes employés.
- Ces actions concernent les préparations de paie de quinzaine, pas les anciens bulletins créés directement par le module standard.

## Vérifications automatisées

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-payroll-corrections-postgres.ps1` : calcul réel en PostgreSQL, motif, droits, isolation client, révisions, idempotence, coûts, paiements conservés, trop-perçu, annulation, blocage des paies suivantes et du doublon par le module standard.
- `node --experimental-strip-types scripts/test-payroll-corrections-browser.mjs` : parcours navigateur avec toutes les requêtes Supabase interceptées.
- `node node_modules/vitest/vitest.mjs run lib/payrollCorrections.test.ts lib/payrollPreparation.test.ts lib/attendanceHistory.test.ts lib/i18nCatalog.test.ts lib/tableFilterCoverage.test.ts --maxWorkers=2`.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`.
