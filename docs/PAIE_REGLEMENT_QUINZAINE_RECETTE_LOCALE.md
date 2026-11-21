# Marquer une quinzaine comme payée

## Activation locale

Appliquer manuellement la migration `supabase/migrations/20261121095312_payroll_fortnight_settlement.sql`, après les migrations existantes de préparation et de correction de paie. Les tests l’appliquent uniquement à une base PostgreSQL temporaire. Aucun schéma distant ni paiement réel n’est modifié par les tests.

Ouvrir `http://localhost:3001/rh/paie`. Le bouton **Marquer la paie comme payée** est présent sur chaque quinzaine validée de l’historique et sur la préparation sélectionnée. Il est réservé aux utilisateurs autorisés à enregistrer des paiements.

## Ce que fait la confirmation

1. Présente le montant déjà payé, le solde restant et le nombre d’employés ayant encore un solde. Le détail par employé permet de vérifier les montants avant confirmation.
2. Demande la date réelle du paiement, le mode (espèces, virement ou chèque) et une référence facultative.
3. Enregistre uniquement le solde positif de chaque employé. Un employé déjà soldé ou avec un net nul ne reçoit aucune nouvelle ligne. Les paiements partiels gardent leurs montants, dates, références et identifiants.
4. Met à jour les statuts de règlement par le mécanisme de paiement existant. Le statut affiché devient **Payé** une fois les soldes nuls ; un trop-perçu existant reste signalé séparément et ne paie jamais un autre employé.
5. Conserve un reçu collectif dans `payroll_fortnight_settlements`, avec montant, nombre d’employés, date, mode, référence, utilisateur, horodatage et liens vers les paiements individuels créés.

L’action enregistre un règlement déjà effectué hors de l’application. Elle ne déclenche aucun virement bancaire et ne règle pas la CNSS.

## Coûts et contrôles

- Les coûts ne sont ni recalculés ni recréés lors d’un changement de statut payé. La migration corrige les déclencheurs pour que les changements de statut/date seuls ne déclenchent aucune nouvelle comptabilisation, y compris lorsque les coûts d’origine sont manquants.
- Les montants viennent des nets validés et des bulletins publiés, jamais des taux actuels de la fiche employé.
- Le serveur verrouille la préparation et les bulletins et vérifie la révision ainsi que le solde total présenté à l’utilisateur.
- Si un autre paiement est enregistré entre l’aperçu et la confirmation, la demande est refusée et l’utilisateur doit actualiser.
- Une paie en brouillon ou en correction ne peut pas être soldée. Les utilisateurs sans droit de paiement, non membres du client ou inactifs sont refusés.
- Tous les paiements du lot sont atomiques. Si une insertion échoue, le lot entier est annulé. Une répétition de la même requête ne crée aucun doublon.

## Où retrouver la trace

- **Règlements de la quinzaine** : reçu collectif, consultable depuis la ligne de paie.
- **Détail par employé → Paiements** : liste des règlements individuels, avec date, montant, mode et référence. Le bloc est placé en tête de fiche ; un message indique explicitement l’absence de paiement.

## Recette

1. Choisir une quinzaine validée contenant des employés non payés, partiellement payés et déjà soldés.
2. Noter le coût total avant l’opération et le détail des paiements existants.
3. Ouvrir le bouton de règlement collectif. Vérifier que le montant correspond uniquement aux soldes positifs, puis saisir date, mode et référence et confirmer.
4. Vérifier **Payé**, le solde nul, le reçu collectif et les nouvelles lignes dans les fiches des employés concernés. Vérifier que les anciens paiements sont intacts et les coûts inchangés.
5. Vérifier qu’une paie déjà soldée ne peut pas être payée une seconde fois et qu’une correction en cours empêche le règlement.

## Tests automatisés

- `scripts/test-payroll-fortnight-settlement-postgres.ps1` : PostgreSQL temporaire sur `127.0.0.1:55467`, sans identifiants de l’application. Contrôle les paiements partiels, salariés soldés et net nul, droits, révisions, concurrence, idempotence, conservation des coûts et annulation atomique en cas d’échec au deuxième employé.
- `node scripts/test-payroll-fortnight-settlement-browser.mjs` : navigateur local, toutes les requêtes Supabase interceptées.
- `lib/payrollSettlement.test.ts` : calcul de l’aperçu en centimes et séparation des soldes individuels.
