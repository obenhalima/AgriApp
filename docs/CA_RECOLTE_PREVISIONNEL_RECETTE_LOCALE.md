# CA à la date de récolte et prévisionnel — recette locale

Les calculs sont en lecture seule : aucune migration SQL ni modification des dates logistiques ou des factures.

## Règles

- Le CA tarifé est rattaché à la date de la récolte source, pas à celle de l’envoi, du bordereau, de la facture ou du paiement.
- Un envoi regroupé est ventilé entre les récoltes au prorata des kilos contribués, en conservant le total au centime. Un bordereau validé prime sur le montant miroir du lot ; aucune double comptabilisation.
- Sans récolte source datée, le montant reste à contrôler et est exclu des totaux mensuels. Aucune date n’est inventée.
- Par défaut, le compte affiche uniquement le réel tarifé. Sans prix enregistré, aucun CA réel n’est créé.
- L’option **Réel + CA prévisionnel (prix variété)** conserve le réel et estime les quantités restantes au prix moyen export ou local de la fiche variété. Les éventuelles dérogations de prix sur la plantation ne remplacent pas ce prix de référence.
- Pour un envoi trié, l’estimation utilise les kilos acceptés restant à tarifer. Avant tri, elle utilise la quantité pesée, sinon estimée. La ventilation prévisionnelle suit l’hypothèse des conditionnements : 10 kg = export, 25 kg = local, au prorata des kilos de chaque format sur les récoltes sources. Elle ne se base pas sur la catégorie 1, qui sert aussi de quantité brute avant tri. Les autres formats et les récoltes sans plateau sont signalés à contrôler et ne créent pas de montant prévisionnel. Les kilos déjà envoyés ne sont pas estimés une seconde fois comme stock de récolte.
- Une tarification partielle remplace uniquement l’estimation des kilos tarifés. Exemple : 90 kg acceptés, 30 kg tarifés à 10 MAD et prix variété 8 MAD → 300 MAD réels + 60 × 8 = 780 MAD prévisionnels au total, pas 1 020 MAD.
- Un prix variété vide ou zéro est signalé à compléter ; la ligne n’est pas artificiellement valorisée. Le zéro d’une tarification réelle confirmée reste valable.
- Le prévisionnel couvre les récoltes enregistrées. Les productions futures non récoltées restent dans le budget. L’option existante d’extrapolation des mois futurs depuis le budget est distincte.
- Les charges restent réelles. En mode prévisionnel, l’EBITDA et le résultat incluent le CA estimé et sont donc prévisionnels.

## Vérification sur DOMBEN501

1. Ouvrir http://localhost:3001/admin/compte-exploitation et choisir DOMBEN501 puis sa campagne.
2. Laisser **Base du CA → Réel tarifé uniquement**. Passer en **Mensuel** et vérifier les mois de récolte.
3. Choisir **Réel + CA prévisionnel (prix variété)**. Ouvrir **Détail du CA : récoltes, quantités et prix utilisés** pour voir, par récolte, les kilos, le prix utilisé, la part réelle ou estimée et les données manquantes.
4. Vérifier les vues Domaine, Ferme et Serre. La vue Ferme inclut les charges réparties sur ses serres.
5. Exporter le compte : la base choisie est inscrite dans les en-têtes, et l’onglet **Détail CA** explique les montants du domaine consolidé.
6. Dans Récoltes → **Envois tarifés · Récapitulatif**, vérifier les deux dates distinctes (récolte et envoi). Les filtres de date, ferme et serre portent sur les parts de récolte, pas sur tout l’envoi. Les factures liées restent dédoublonnées et affichent leurs montants entiers.
7. Après saisie et validation habituelle d’un prix/bordereau, actualiser le compte : la part tarifée remplace sa prévision et reste affectée au mois de récolte. Les règlements ne génèrent pas de CA supplémentaire.

## Vérifications techniques

- Tests unitaires : dates à cheval sur deux mois, prix reçus plus tard, tarification partielle, bordereaux annulés, arrondis, isolation client/ferme/serre, prix manquants, mix local/export et déchets.
- Test navigateur `scripts/test-harvest-revenue-browser.mjs` : données Supabase intégralement simulées, réel 1 000 MAD → réel + prévisionnel 1 720 MAD, montants mensuels et exports Excel cohérents, facture liée dédoublonnée.
- Vérification en lecture seule des relations Supabase sur DOMBEN501.
- Aucun déploiement GitHub/Vercel dans cette étape.
