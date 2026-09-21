# 107A — Disponibilité par occurrence

Code et migration préparés ; SQL et recette base en attente.
Prérequis : 106A et 106B. Appliquer 107a_treatment_occurrence_forecast.sql.

La prescription choisit son entrepôt. Les anciennes prescriptions sont rattachées
au principal, correspondant au comportement précédent. Le manque de stock ne bloque
ni la soumission ni la validation agronomique. Un article lié est nécessaire.

Les besoins sont cumulés chronologiquement par client, entrepôt et article
(date, création, identifiant pour départager). Les lignes d'un même produit sont
regroupées par occurrence. Les demandes soumises et approuvées sont prises en compte ;
les occurrences réalisées, rejetées, annulées et les plans annulés sont exclus.
L'allocation est prévisionnelle, pas une réservation physique opposable aux autres
sorties/transferts. Une occurrence insuffisante conserve sa demande dans les besoins futurs.

Affichage par occurrence : disponible, partiel ou non disponible, produit et quantité
manquante ; résumé des occurrences couvertes par plan. Le calcul est actualisé
à chaque chargement ou au bouton Actualiser la disponibilité. La surveillance et
les alertes automatiques après réception relèvent du lot 107B.

La confirmation réelle prélève dans l'entrepôt de la prescription. Les produits
doivent être confirmés exactement une fois. Le solde est vérifié à nouveau, en
préservant les besoins antérieurs à l'instant du contrôle. Une erreur annule
l'application et tous ses mouvements. Les prescriptions suivantes ne bloquent
pas l'exécution des premières couvertes. L'ancien point d'entrée
execute_treatment_request est retiré aux utilisateurs ; l'écran utilise
confirm_treatment_application, qui gère les quantités réelles.

Recette à exécuter après SQL : 5 occurrences de 2 L, stock source 8 L :
4 disponibles, dernière non disponible (manque 2 L). Confirmer la première :
stock 6 L, 3/4 restantes couvertes. Recevoir 2 L et actualiser : 4/4 couvertes.
Stock 9 L : dernière partiellement couverte. Vérifier aussi produit répété,
plusieurs produits, entrepôts/clients distincts, annulation/rejet, quantité réelle
modifiée, double confirmation et réception en transit non comptabilisée.
