# Lot 114 — Plan schématique de la ferme

## Utilisation

1. Appliquer `supabase/migrations/114_farm_schematic_plan.sql` dans l'éditeur SQL Supabase.
2. Ouvrir **Production > Plan de culture > Plan de la ferme**.
3. Choisir une ferme. Le dessin est partagé entre les campagnes, pas copié à chaque campagne.
4. Une personne avec le droit `fermes.edit` peut cliquer sur **Modifier le plan**, choisir une serre existante et la placer.
5. Glisser la forme, régler X/Y/largeur/hauteur dans le panneau et tourner par pas de 90°. Enregistrer avant de quitter.
6. En consultation, cliquer sur une serre affiche sa surface officielle, les plantations de la campagne et la somme des récoltes enregistrées (toutes catégories, déchets compris).

## Périmètre

- Plan non cadastral, grille fixe 1200 × 800 ; dimensions graphiques sans conversion en mètres.
- Aucun doublon de serre créé, aucune modification des surfaces officielles.
- Retirer du plan ne supprime ni la serre ni ses cultures.
- Le filtre variété est explicitement ignoré par le plan afin de conserver la disposition complète.
- Les objectifs absents restent « Non renseigné » ; l'absence de saisie de récolte est signalée distinctement.
- Les consultations de culture et récolte sont paginées et filtrées par société, ferme et campagne.
- Le serveur contrôle les droits, l'appartenance des serres et les limites du canevas. Les écritures directes sont interdites ; sauvegarde atomique par RPC avec révision anti-écrasement.
- Une erreur réseau ou une migration absente est affichée, sans annoncer une sauvegarde réussie.

## Recette connectée à réaliser après SQL

- Ferme A : placer deux serres, déplacer, tourner, sauvegarder, recharger : positions identiques.
- Ferme B : plan distinct. Autre société : aucune forme ou donnée de A.
- Réessayer un ID de serre d'une autre ferme via RPC : rejet.
- Profil lecture seule : pas de modification UI, appel RPC rejeté.
- Deux sessions éditent la même révision : la seconde sauvegarde est refusée.
- Annuler / retirer une forme : vérifier que référentiel, surfaces et plantations restent inchangés.
- Changer de campagne : dessin inchangé, cultures et récoltes mises à jour ; aucune campagne = aucune donnée inventée.
- Comparer la production affichée aux récoltes de la serre, y compris saison dépassant 500 lignes.
- Couper le réseau / SQL absent : erreur visible et possibilité de recharger, pas de blocage permanent.
- Vérifier glisser-déposer à plusieurs tailles d'écran, sélection clavier et champs de position.

## Suite prévue (non incluse)

- Vue financière : CA, coûts et marges après règles d'affectation validées.
- Fonds de plan / satellite, contours libres et autres bâtiments.
- Alertes, traitements et indicateurs opérationnels complémentaires au clic.

Migration préparée, non exécutée automatiquement. Recette métier multi-comptes à réaliser après application.

## Vérifications locales

- 5 tests unitaires de géométrie / formatage réussis (`lib/farmLayout.test.ts`).
- Route `/plan-culture` : HTTP 200 ; ceci ne remplace pas une recette authentifiée.
- TypeScript : aucune erreur remontée dans les fichiers du lot 114 ; la vérification globale reste en échec sur des fichiers coûts, budgets et factures non modifiés dans ce lot.
- Contrôles SQL en lecture seule fournis dans `supabase/verification/114_farm_schematic_plan_checks.sql`.
