# Lot 128 — Importer un plan draw.io et initialiser les serres

## Parcours

Production → Plan de culture → choisir une ferme → Plan de la ferme → Importer un plan draw.io.

1. Charger un fichier `.drawio` ou `.xml` (5 Mo maximum, première page).
2. Vérifier les correspondances proposées par code. Les serres proposées appartiennent uniquement à la ferme sélectionnée.
3. Pour une serre absente, choisir **Créer et initialiser une serre** : code, nom, type, statut, surface officielle en m² ; surface exploitable facultative (reprend la surface totale), notes facultatives.
4. Vérifier l’aperçu puis enregistrer. Le plan et les créations sont enregistrés dans une transaction unique.
5. Cliquer sur une serre pour consulter sa fiche. Les plantations/campagnes se préparent séparément dans le plan de culture.

Les surfaces ne sont jamais déduites des dimensions du dessin. Les serres existantes, leurs surfaces et leurs plantations ne sont pas modifiées. Réimporter remplace uniquement la disposition après confirmation. Une serre absente du nouveau dessin reste dans le référentiel.

## Convention de dessin et limites

- Rectangle nommé `S1`, `S2`… ou données de forme `fp_type=serre`, `fp_code=CODE`.
- Codes uniques ; les groupes tournés et positions relatives doivent être dégroupés.
- Maximum 500 serres et 1 000 autres éléments.
- XML draw.io compressé et non compressé pris en charge ; seule la première page est importée.
- Bassins, bâtiments, pistes, annotations et pictogrammes restent graphiques : aucun entrepôt ou équipement métier n’est créé implicitement.
- PNG intégrés uniquement pour les images ; pas de SVG ni d’image externe. Les formes non prises en charge sont simplifiées avec avertissement ; certaines liaisons automatiques peuvent être ignorées.

## Sécurité et cohérence

- Migration `128_drawio_farm_import.sql`, après 114 et 127.
- Modification : habilitation `fermes/edit`. Création : habilitation supplémentaire `serres/create`.
- Cloisonnement par ferme et société vérifié côté serveur.
- Contrôle de révision contre les écrasements concurrents.
- Identifiant d’import conservé après un échec réseau : **Réessayer le même import** évite de créer des doublons.
- Les autres éléments sont reconstruits avec des primitives graphiques sûres ; aucun XML/HTML importé n’est injecté dans la page.

## Vérification

- `node node_modules/vitest/vitest.mjs run` : tests unitaires, dont codes et surfaces.
- `node scripts/check-drawio-import-sql.mjs` : migration + recette dans une transaction annulée ; création/rattachement, conservation des surfaces, décor, doublons, retry, révision, cloisonnement, refus anonyme.
- `node scripts/test-drawio-import.mjs chemin/plan.drawio` : navigateur avec toutes les requêtes backend simulées ; création d’une serre manquante, surface requise, coupure réseau et reprise idempotente, serre créée cliquable.

Les tests ne constituent pas une initialisation des fermes réelles : les surfaces officielles restent à renseigner par l’utilisateur lors de l’import.
