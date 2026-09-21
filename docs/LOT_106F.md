# 106F — Liens des articles préparés

Cause identifiée : l'INSERT de prepare_positive_list_stock omettait plant_protection_product_id. Le statut existant était donc perdu au rechargement. La page affichait également tous les produits, même déjà liés.

- Migration 106f_fix_prepared_stock_product_link.sql à appliquer après 106E : ajout du lien aux futures créations et réparation des anciens articles actifs, exclusivement via leur code généré, leur client et leur liste source validée. Aucun rapprochement par nom, aucun changement de quantité ni suppression.
- Affichage par défaut des seuls articles manquants ; option pour consulter les articles liés. Les articles existants sont exclus de la sélection et de l'envoi.
- Tests locaux : syntaxe TSX, filtre par défaut, affichage de tous, exclusion des existants de la sélection. Exécution SQL et recette connectée encore en attente.
- Recette : appliquer la migration, rouvrir la liste, vérifier les compteurs, créer un article manquant, recharger et constater qu'il reste lié. Une seconde préparation ne doit créer aucun doublon. Contrôler un autre client et l'absence de modification de ses quantités.
