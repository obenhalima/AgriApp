# Valorisation des stocks et coûts de production — 12 septembre 2026

## Périmètre livré

- CUMP par article et entrepôt ; valorisation de la consommation réelle, prix historique figé.
- Réceptions atomiques avec entrepôt obligatoire, contrôle des quantités restantes, conversion d'unité et protection contre le double envoi.
- Achat direct : création/validation du bon, puis réception explicite ; aucune entrée de stock à la simple création.
- Transferts internes : conservation de valeur, sans charge de consommation.
- Traitements : ventilation par surfaces réellement traitées, ou confirmation explicite d'une application homogène.
- Menu Coûts/kg et valorisation (`/couts/pilotage`) : direct, charges communes, complet, budget, ratios pondérés et consolidation serre/ferme/société.
- Intégration du récapitulatif des coûts à la fiche serre du plan de culture.
- Confirmation justifiée des valeurs de stock existantes et rapprochement des anciennes consommations non imputées.

## Règles et limites

Le coût/kg consolidé est la somme des coûts divisée par la somme des kilogrammes, jamais la moyenne des ratios des serres. Deux dénominateurs sont affichés : récolte totale et catégories 1–3 hors déchets (avant tri station). Sans récolte, le ratio est indisponible.

Les charges communes sont réparties dans leur campagne selon surface ou production. Les prix manquants restent inconnus ; les reprises historiques estimées sont signalées. La valeur de stock affichée est le solde actuel, indépendamment des filtres de campagne et de période du rapport de coûts.

Il s'agit d'un suivi analytique et d'une valorisation opérationnelle, pas d'un bilan légal ni d'une clôture comptable. Restent à développer : arrêté historique de stock à une date, dépréciations/pertes avec circuit dédié, écritures de comptabilité générale/export et clôture, valorisation des cultures en cours. CA et marge sur le plan restent à compléter. Un transfert entre sociétés n'est pas traité comme un transfert interne.

## Historique et reprise

Les anciennes écritures générées à la réception des achats sont sauvegardées dans `inventory_cost_migration_archive` avant recalcul. Les achats stockés cessent d'être imputés en totalité aux charges ; les consommations documentées sont reprises séparément. Ne pas restaurer aveuglément les anciennes écritures : cela doublerait les charges.

La confirmation d'une valeur actuelle ne réécrit pas les sorties historiques. Le rapprochement d'une ancienne sortie exige son prix justifié et, hors traitement, une plantation de la ferme concernée. Les écritures automatiques sont protégées contre la modification manuelle.

## Tests

- 13 tests unitaires (calculs analytiques et géométrie du plan) réussis.
- Vérification TypeScript sans émission réussie.
- Compilation Next de production réussie, dans `.next-costing-check` pour préserver le serveur local.
- SQL transactionnel annulé : réception/CUMP, coût de sortie, historique figé, transfert équilibré sans charge, conversion mL/L, réception partielle et rejeu idempotent, sur-réception refusée, contrôle d'accès, rapprochement et achat direct.
- Recette interactive complète avec un utilisateur métier : à effectuer.

## Application et publication

Les migrations concernées sont 115, 116, 117 et 118, à appliquer une seule fois et ensemble. `node scripts/prepare-costing-sql.mjs` prépare `tmp/costing/dry-run.sql` (ROLLBACK) et `tmp/costing/deploy.sql` (COMMIT). Ne pas lancer toutes les anciennes migrations avec `db push` : elles ont été appliquées manuellement.

Projet Supabase lié vérifié identique à la configuration locale : `dlisonvsphybjiyxoymk`.

**Application confirmée le 12 septembre 2026** : migrations 115–118 exécutées en une transaction, puis fonctions contrôlées par `supabase/verification/118_post_deploy.sql`. Résultat : 10 écritures d'achat archivées, 11 événements d'ouverture, 10 soldes positifs à confirmer dont 7 sans valeur connue. Aucune consommation historique suffisamment documentée n'a généré d'écriture à cette reprise (0 ligne) : utiliser le rapprochement, ne pas considérer un coût affiché nul comme une absence de dépense.

Publication Vercel bloquée le 12 septembre : jeton CLI invalide. Reconnexion nécessaire via `vercel login`, puis contrôle de la configuration de production avant `vercel deploy --prod`. Aucun secret à copier dans une conversation ou dans Git.

## Recette au retour

1. Ouvrir `/couts/pilotage` et sélectionner une campagne ; vérifier les niveaux serre, ferme et société.
2. Confirmer les prix d'ouverture avec les pièces justificatives disponibles.
3. Réceptionner un bon dans l'entrepôt de sa ferme ; vérifier quantité et valeur.
4. Confirmer un traitement avec les surfaces réelles ; vérifier la sortie et ses coûts ventilés.
5. Comparer les ratios avec les récoltes de la même campagne/période.
