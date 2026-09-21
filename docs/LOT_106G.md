# 106G — Déduction automatique des unités

Préparé, non appliqué en base. Prérequis : 106D et 106F_bis. Le fichier 106G_auto_stock_units.sql contient fonctions, tests de déduction et réparation limitée au client 8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79 fourni dans le diagnostic.

- Source : dose_text des lignes validées Station de la liste sélectionnée et unités d'usages actifs ou liés aux lignes validées. Jamais le nom, la concentration en substance active ou les LMR.
- Convention de création : L pour volumes, kg pour masses, unité pour nombres. Plusieurs familles différentes : blocage ; absence de donnée reconnue : blocage.
- Les unités compatibles déjà utilisées, notamment mL/g, sont conservées afin de ne pas modifier quantités ou coûts.
- Les anciens articles générés sans lien sont réutilisés par code/client, pas recréés. Correction d'une unité incompatible seulement si quantité, seuil, prix sont nuls et sans mouvements, prescription, demande de sortie ou transfert. Sinon revue historique nécessaire.
- Aucune dose ni homologation créée ou validée par cette opération. L'autorisation d'application reste distincte du lien catalogue-stock.
- Interface en lecture seule pour l'unité. Serveur indépendant de l'unité reçue du navigateur.

Vérification locale : syntaxe TSX OK. Huit assertions SQL intégrées au script, à exécuter en base avant les mises à jour. Recette connectée à faire : unité kg/ha vers kg, ml/100 L vers L, dose vide, sources contradictoires, article ancien sans historique, article avec mouvements, changement de client et réouverture sans doublon.
