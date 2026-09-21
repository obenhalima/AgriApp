# 106C — Préparation du stock depuis une liste positive

## Correctif du 10 septembre 2026 — création catalogue

Appliquer 106e_catalog_without_purchase.sql après 106C. Ce correctif remplace
le comportement ci-dessous : seul le produit validé et son unité sont nécessaires.
Fournisseur préféré, conditionnement et prix restent facultatifs.
La création ne touche plus warehouse_stocks ni stock_movements. Le choix
d'entrepôt et le seuil local sont retirés du formulaire. Les articles/affectations
existants restent inchangés. Le stock physique sera créé à la réception.
Contrôle syntaxique et absence de champs entrepôt/seuil transmis vérifiés ;
recette SQL à faire après application : création sans fournisseur/conditionnement,
zéro affectation nouvelle, stock initial zéro, doublon réutilisé, fournisseur
d'un autre client refusé si renseigné.

## Historique initial (remplacé par le correctif ci-dessus)

Préparé, application SQL et recette en base en attente.
Après 106A/106B, appliquer 106c_phyto_stock_preparation.sql.
Ouvrir Listes positives, choisir une version et cliquer « Préparer les articles de stock ».
Seuls les produits de lignes validées Station sont proposés, une seule fois par produit.
Sélectionner les produits, compléter fournisseur, unité, conditionnement et entrepôt.
Prix, référence fournisseur et seuil peuvent être renseignés. La confirmation est
globale et transactionnelle : une erreur annule toute la création et conserve le formulaire.

Un article existant est réutilisé ; ses informations ne sont pas écrasées.
L'affectation à un nouvel entrepôt crée une ligne à zéro. Une affectation déjà
existante conserve quantités et seuils. Une réexécution ne duplique aucun article.
La compatibilité d'unité est vérifiée en base à partir d'un usage actif ou d'un
usage provisoire lié à une ligne Station validée. Sans unité de dose connue,
compléter l'usage avant création. Aucune autorisation ONSSA n'est accordée.

Correction 106B incluse : un filtre entrepôt ne montre que ses articles affectés.
Un entrepôt neuf est vide. Un article explicitement affecté reste visible à zéro.

Vérification : contrôle syntaxique TypeScript, revue des contraintes et du périmètre client.
Recette base en attente : création multiple à zéro, réexécution sans doublons,
réutilisation article avec stock conservé, unité incompatible, fournisseur/entrepôt
d'un autre client refusés, rollback complet d'un lot invalide, filtre après affectation.
Prochain lot : 106D, transferts inter-entrepôts.
