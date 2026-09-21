# Menus par profil et client

Développé en local. Migration 140 préparée, non appliquée. Aucun déploiement GitHub/Vercel.

## Activation

Appliquer `supabase/migrations/140_profile_navigation.sql` après accord pour la base partagée, puis recharger l’application.
Administration → Rôles & Permissions → sélectionner un rôle → Menu du profil.

- Configuration séparée pour chaque société et rôle (pas pour chaque fonction opérationnelle).
- Visibilité, ordre des rubriques et entrées, rubriques dépliées par défaut, accueil.
- Aperçu standard intersecté avec les permissions affichées ; les menus plateforme ne figurent pas dans cet aperçu.
- Les permissions se sauvegardent séparément, avec leur bouton existant.
- La restauration du menu standard nécessite un enregistrement explicite.
- La sidebar, la recherche rapide et l’accueil utilisent la configuration. Un lien direct reste soumis aux contrôles métier existants : masquer n’est pas interdire.
- Accès Rôles & Permissions préservé pour les profils habilités, pour éviter de masquer l’éditeur lui-même.
- Une page d’accueil non autorisée ou masquée est ignorée au profit de l’accueil automatique ; `/` permet le dashboard classique.
- Couleurs métier inchangées. Aucun réglage ne confère un droit.
- Le navigateur qui enregistre recharge les réglages immédiatement ; les autres utilisateurs rechargent la page.
- Schéma manquant ou erreur de lecture : menu standard filtré par droits. L’éditeur signale l’indisponibilité, sans simuler de sauvegarde.

## Vérifications

TypeScript réussi, quatre tests unitaires (permissions, masquage, ordre, restriction plateforme).
Recette connectée après application SQL : enregistrer deux configurations distinctes pour le même rôle dans deux clients, tester avec leurs utilisateurs, contrôler l’accueil, les ordres et le retour au standard. Vérifier le refus RPC avec un non-administrateur et l’isolation RLS. Recette SQL et interface connectée de sauvegarde non encore exécutées.
