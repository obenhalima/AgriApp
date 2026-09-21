# Confirmation des coûts historiques

Dans Coûts/kg et valorisation, ouvrir « Voir les coûts concernés », puis « Vérifier et confirmer ».

1. Vérifier le prix par unité de stock de la consommation historique. Il est prérempli à partir des montants imputés, pas du CUMP actuel.
2. Vérifier les surfaces réelles proposées pour les imputations par surface. Les valeurs préremplies peuvent provenir de la prescription. Pour plusieurs lignes d'une même serre, saisir la surface propre à chaque affectation, sans duplication.
3. Saisir la pièce justificative et confirmer explicitement le prix et les surfaces.
4. Confirmer. Toutes les lignes de la consommation sont recalculées atomiquement, y compris hors du filtre d'affichage. Le rapport est rechargé.

Les quantités, mouvements de stock, CUMP et données agronomiques ne sont pas modifiés. Les identifiants des écritures analytiques sont conservés. Un audit conserve auteur, date, motif, prix/surfaces et écritures avant/après. Le droit coûts/modification et l'appartenance au client sont exigés. Les comptes inactifs sont refusés.

Une confirmation répétée après une réponse réseau perdue est idempotente. Une version périmée est refusée. Les lignes sans mouvement source restent à examiner manuellement. Cette confirmation analytique ne vaut pas clôture comptable ni validation phytosanitaire.

## SQL

- Nouvelle installation : `136_confirm_historical_consumption_costs.sql` (inclut le contrôle des surfaces).
- Si 136 a déjà été exécutée avant l'ajout du contrôle : appliquer uniquement `136b_historical_surface_guard.sql`. Il borne les surfaces aux surfaces plantées des affectations, sans reprendre les confirmations déjà enregistrées.
- Aucun script n'est appliqué durablement par les tests de cette tâche.

## Vérifications

- Test SQL transactionnel annulé : prix recalculé, audit avant/après, idempotence, permission, version périmée, justificatif, immutabilité du stock et des mouvements, refus de modification directe des coûts.
- Test navigateur avec Supabase simulé : préremplissage, erreurs, virgule décimale, confirmation et disparition de l'alerte ; aucun appel d'écriture à la vraie base.
- Le complément 136b est vérifié en transaction annulée pour sa création ; une nouvelle recette métier requiert une consommation encore provisoire (toutes celles disponibles ont depuis été confirmées).
