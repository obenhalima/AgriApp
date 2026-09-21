# 107B — Planifier sans stock

Code préparé. Migration à appliquer manuellement après 107A : `supabase/migrations/107b_plan_without_stock.sql`. Ne pas réexécuter 107A. Vérification en base et recette connectée encore à faire.

## Périmètre

- Sélection manuelle des produits liés à la cible, sans ajout automatique.
- Prescription soumise avec produit du catalogue sans article de stock ; nom et unité de quantité conservés.
- Usage correspondant à la cible et dose calculable toujours nécessaires. Les vérifications ONSSA peuvent rester en attente pendant la planification, jamais pendant l'application.
- Pas de création d'article, achat, mouvement, quantité fictive ni coût à la soumission.
- Prévision 107A étendue aux articles absents : alerte par occurrence.
- Action « Rattacher les articles créés » par prescription/occurrence. Préparer d'abord l'article, puis cliquer sur cette action pour chaque occurrence concernée. Conversion de la quantité vers son unité, y compris en saisie manuelle ; justification conservée.
- Confirmation réelle : article actif du même client, produit et usage réglementaires vérifiés, étiquette confirmée, DAR et délai de rentrée renseignés, dose conforme et stock suffisant. Contrôles en SQL, pas uniquement dans l'interface.
- Les occurrences approvisionnées restent exécutables ; les besoins antérieurs restent pris en compte selon 107A.
- Le rattachement obligatoire entrepôt/ferme et les coûts inter-fermes ne sont pas traités ici.

## Recette après application SQL

1. Soumettre un produit lié à la cible mais sans article : succès, nom et quantité visibles, alerte « Article à créer », aucun mouvement.
2. Planifier cinq occurrences, article existant, stock couvrant quatre : quatre disponibles et la cinquième en rupture. Exécuter la première sans blocage par la cinquième.
3. Tenter une réalisation sans article, sans stock ou avec données réglementaires non vérifiées : refus et aucune sortie.
4. Créer l'article sans réception : rattacher, alerte stock toujours présente. Réceptionner : actualiser la prévision.
5. Quantité initiale 1 472 mL, article en L : rattachement à 1,472 L. Tester également g/kg et conversion inverse.
6. Quantité manuelle : valeur convertie, justification conservée. Refuser les familles incompatibles (g/L).
7. Cible non liée, produit inactif, article d'un autre client, utilisateur non habilité : refus.
8. Après approvisionnement et vérifications, confirmer : mouvement dans l'entrepôt sélectionné, pas de consommation d'une occurrence future.
9. Régression : prescription avec article existant, refus d'auto-validation, confirmation « non réalisée », anciennes prescriptions et historique inchangés.

Vérification locale effectuée : transpilation TSX sans erreur. Pas de build de production en parallèle du serveur de développement.
