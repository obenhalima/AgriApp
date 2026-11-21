# Règlements CNSS et charges patronales

## Activation et accès

Appliquer manuellement `supabase/migrations/20261120173128_social_contribution_payments.sql`, après les migrations de préparation de paie, de calcul net et de correction de paie. La migration n’a pas été appliquée au projet distant par les tests.

Ouvrir `http://localhost:3001/rh/cnss`. Le parcours quinzaine affiche **CNSS & règlements** dans le menu RH et le tableau de bord, selon les droits du profil. Toutes les lectures et actions sont rattachées au client sélectionné.

Les anciennes déclarations globales de `cnss_declarations` restent intactes en base. Elles ne sont pas attribuées automatiquement à un client, car elles n’ont pas ce rattachement. Le nouveau suivi utilise `social_contribution_declarations` et `social_contribution_payments`.

## Fonctionnement

- Les montants viennent des bulletins des périodes validées, payées ou clôturées, selon le mois de paie. Les brouillons de période sont exclus.
- Pour la paie de quinzaine, le statut déclaré enregistré dans la version publiée de la paie est utilisé : les salariés explicitement non déclarés ne contribuent ni à l’assiette ni aux cotisations CNSS. Les mois validés sans cotisations restent visibles.
- Le total à régler additionne CNSS et AMO salariales, CNSS et AMO patronales, allocations familiales et formation professionnelle. L’impôt sur le revenu est exclu.
- Les statuts de déclaration et de règlement sont distincts. Déclarer ne crée aucun règlement. Un règlement peut être enregistré dès que les cotisations validées existent, sans imposer une confirmation de déclaration dans l’application.
- Chaque règlement conserve la date, le montant, le mode, la référence facultative, l’utilisateur et la date de saisie, ainsi qu’un instantané des cotisations sources.
- Plusieurs paiements partiels sont possibles. Les statuts **À payer**, **Partiellement payé** et **Payé** sont calculés à partir des montants réellement enregistrés. Le détail présente tous les règlements et leur date.
- Un règlement supérieur au solde, nul, négatif, non fini ou avec plus de deux décimales est refusé en base. Un même identifiant de requête ne crée jamais deux règlements. Une révision périmée est refusée.
- Une correction de paie en cours suspend les règlements du mois. Les montants précédemment publiés restent visibles jusqu’à revalidation de la paie.
- Après modification des paies, l’écran affiche **À actualiser**. Recalculer conserve les règlements et l’historique de la déclaration, et invalide la confirmation de déclaration si la source a changé. Un trop-perçu est affiché séparément, sans remboursement ni récupération automatique.
- Les règlements, déclarations et recalculs CNSS ne créent, ne modifient et ne suppriment aucune ligne de coût. Les paiements des employés sont également conservés.

## Test manuel sur DOMBEN501

1. Sélectionner le client, l’année 2026 et septembre. Vérifier séparément part salariale, charges patronales et total dû depuis les deux quinzaines validées.
2. Cliquer **Payer**, saisir une partie du total, une date et une référence, puis confirmer. Vérifier **Partiellement payé** et le solde.
3. Ouvrir **Détails** : vérifier les six composantes et le règlement dans l’historique.
4. Saisir le solde avec une autre date. Vérifier **Payé**, le solde nul, la date du dernier règlement et les deux lignes dans l’historique.
5. Confirmer une déclaration avec sa référence DAMANCOM : cela ne change pas les montants payés.
6. Comparer les coûts et le compte d’exploitation avant/après paiement : aucun montant de coût ne doit changer.
7. Corriger une paie dans le parcours prévu, puis revenir sur CNSS : actualiser, recalculer le mois et vérifier le nouveau solde ou le trop-perçu. Ne pas régler une seconde fois un montant déjà payé.

## Vérifications automatisées

- `scripts/test-social-contribution-payments-postgres.ps1` : PostgreSQL jetable sur `127.0.0.1:55466`, sans identifiants de l’application. Vérifie notamment les montants, les paiements partiels/complets, les révisions, les droits, l’isolation des clients, les corrections, les paies standard et l’absence de toute modification des coûts.
- `node scripts/test-social-contribution-payments-browser.mjs` : navigateur local, toutes les requêtes Supabase interceptées et simulées.
- `node node_modules/vitest/vitest.mjs run lib/socialContributions.test.ts lib/hrWorkflow.test.ts lib/i18nCatalog.test.ts lib/tableFilterCoverage.test.ts --maxWorkers=2`.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`.
