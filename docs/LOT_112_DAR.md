# Lot 3A / 112 — Blocage DAR des récoltes

Préparé, non appliqué en base. Exécuter 112_harvest_dar_guard.sql après 111. Recette connectée indispensable avant validation du lot.

## Règles

- Seules les applications réellement réalisées/partielles comptent ; les prescriptions planifiées ou non réalisées ne bloquent pas.
- Copie figée produit, DAR et serres lors de l'application, après contrôle de conformité. Une modification ultérieure d'usage ou de cible ne déplace pas les restrictions.
- Toutes les plantations d'une serre traitée sont contrôlées. Chaque produit bloque jusqu'à son échéance : la date la plus tardive doit être respectée.
- Référence : fin réelle d'application si renseignée, sinon début réel. Les récoltes étant datées sans heure, échéance après minuit reportée au jour suivant, fuseau Africa/Casablanca. DAR explicitement nul (0) : pas de délai supplémentaire ; DAR inconnu : blocage.
- Anciennes applications : reconstitution à partir des sources encore identifiables ; données insuffisantes laissées inconnues, pas de zéro fabriqué. Aucun historique de récolte supprimé ou réécrit.
- Contrôle sur INSERT/UPDATE de harvests : écran, import, bot et appels SQL passent par le même trigger. Les lots d'expédition ne constituent pas une nouvelle saisie de récolte dans ce lot.
- L'aperçu du formulaire n'est pas une autorisation définitive ; le serveur recontrôle à l'enregistrement.
- Le réglage du délai de rentrée n'affecte pas le DAR. Aucune dérogation ni privilège super-admin ne contourne ce lot. Dérogations : prochain lot 3B.
- Les applications antidatées peuvent révéler une non-conformité dans des récoltes déjà enregistrées : le rapport SQL final permet leur examen. Ce lot n'implémente pas de notification automatique de ces cas.

## Vérifications

Tests de calcul SQL inclus dans la transaction : échéance en journée, minuit, zéro explicite, inconnu. Ils seront exécutés lors de l'application du script. Syntaxe TSX contrôlée localement.

Recette restante : traitement multi-serres/multi-produits, absence d'application, non-réalisation, DAR inconnu, jour avant/à/après échéance, autre ferme/client, modification de date et quantité, import, appel direct, modification ultérieure du référentiel sans changement de copie, audit historique, droits de lecture du RPC.

Ne pas marquer le lot terminé avant recette en base. Les cas historiques à DAR inconnu nécessitent une régularisation explicite avec preuve avant de pouvoir lever leur blocage.
