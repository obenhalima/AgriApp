# Lot 127 — Import du plan Excel de ferme

14 septembre 2026.

- Plan de culture → sélectionner une ferme → Plan de la ferme → Importer un plan Excel sans dessiner les serres.
- Lecture locale du premier onglet .xlsx (5 Mo maximum, 500 lignes et 200 colonnes). Aucun classeur n’est envoyé au serveur.
- Repérage des cellules fusionnées portant un code S1, S2… ou Serre 1. Dimensions et positions calculées à partir des lignes/colonnes Excel, avec conservation du rapport largeur/hauteur.
- Aperçu et rapprochement par code avec les serres de la ferme sélectionnée. Choix manuel des correspondances possibles, mais aucun dessin manuel requis.
- Codes dupliqués, correspondances ambiguës, serres étrangères ou absentes : sauvegarde bloquée jusqu’à correction.
- L’import ne crée aucune surface, serre, plantation ou donnée comptable. Remplacement d’un plan existant soumis à confirmation puis à sauvegarde explicite, avec contrôle de révision existant.
- Migration 127 appliquée : dimensions de dessin adaptées aux plans importés. Les habilitations, contrôles de ferme et limites du canevas sont conservés.

## Recette

- Fichier fourni : premier onglet « Plan general », 29 serres S1 à S29 reconnues.
- 87 tests unitaires réussis. Recette navigateur : lecture du fichier, 29 formes, aucune sauvegarde avant clic, sauvegarde simulée et blocage sans référentiel. Aucune écriture métier réelle pendant les tests.
- TypeScript et compilation de production réussis. Commit `9fa226e` publié ; déploiement Vercel principal `agri-app` réussi.
- Aperçu privé : `outputs/plan114-20260914/Plan_STALSON_Ferme_114.html`. Source Excel non modifiée et non publiée dans Git.

## À confirmer avant rattachement réel

- STALSON possède actuellement une ferme « test » sans serre. Choisir son renommage ou la création d’une ferme 114 distincte.
- Fournir les surfaces officielles S1 à S29 : elles ne peuvent pas être déduites du dessin.
- Bâtiments, routes, bassins, images et formes libres ne sont pas importés dans cette version. Aucun import de culture ou de réseau d’irrigation depuis les autres onglets.
