# Lot 126 — Envoi automatique des validations mobiles

14 septembre 2026.

## Réalisé

- Dispatcher Supabase Edge : push chiffré Web Push et Telegram privé pour les utilisateurs ayant activé le canal.
- Planificateur Supabase toutes les minutes ; aucun ordinateur local ne doit rester allumé. Migration 126 appliquée.
- Secrets VAPID dans les secrets Edge ; clé dédiée au planificateur dans Vault. Aucune clé privée dans le navigateur ni le dépôt.
- Relecture des habilitations, société, profil actif, demande encore validable et préférences avant chaque envoi. Les règles existantes par société/processus et les rappels restent applicables.
- File existante : lots de 20, verrouillage, dédoublonnage, reprises limitées et suppression des abonnements expirés. Une notification réseau peut exceptionnellement être reçue deux fois si son accusé de traitement est perdu ; aucune décision métier n’est prise par le dispatcher.
- Notification discrète, sans montant ni nom de produit sur l’écran verrouillé. Le clic ouvre le centre sécurisé `/validations` ; une session expirée nécessite une reconnexion.
- La validation sur téléphone conserve les cases Station et l’interdiction d’auto-validation. Ce n’est pas une approbation directement depuis l’écran verrouillé.

## Activation par personne

1. Se connecter à FarmPilot sur son téléphone avec son compte personnel habilité.
2. Ouvrir **Validations → Installer FarmPilot / Notifications**.
3. Installer l’application sur l’écran d’accueil puis ouvrir son icône, particulièrement sur iPhone.
4. Cliquer **Activer sur ce téléphone** et autoriser les notifications.
5. Facultatif : **Relier Telegram**, puis envoyer le code personnel au bot dans une conversation privée.
6. Faire soumettre une vraie demande par une autre personne et vérifier sa réception puis sa validation.

## Vérification et limites

- 81 tests unitaires ; TypeScript et compilation de production (64 pages) réussis ; recette navigateur mobile 390 px sur données simulées réussie, sans écriture métier.
- Publication GitHub : `757eaa6`. La tâche automatique a répondu HTTP 200 sur les trois premiers appels ; un POST sans secret valide est refusé (401). Les rôles anonyme et utilisateur ne peuvent ni configurer le service ni déclencher le planificateur.
- Premier appel authentifié du dispatcher : HTTP 200, zéro échec ; file vide et aucun appareil/compte Telegram relié au moment du déploiement.
- Réception physique Android/iPhone à confirmer après activation sur un appareil réel. Les notifications dépendent aussi du réseau et des réglages du système.
- Les alertes générales du lot 123 (stock, retard, absence de récolte) ne sont pas envoyées par ce lot : seuls les événements de validation existants sont concernés.
- Le projet Vercel principal est `agri-app` ; le projet secondaire `frampilot` n’est pas utilisé pour ce service.

## Exploitation

- Fonction Edge `mobile-dispatch`, tâche cron `farmpilot-mobile-dispatch`, migration `126_mobile_dispatch_scheduler.sql`.
- `scripts/configure-mobile-dispatch.mjs --bootstrap` est réservé au premier provisionnement et refuse de remplacer une clé publique déjà active. Ne pas faire tourner les clés VAPID sans plan de réinscription des téléphones.
- Pour suspendre : désactiver la tâche nommée dans Supabase Cron. Ne pas modifier les autres tâches.
- Les réponses HTTP du planificateur sont consultables dans `net._http_response` ; les résultats de livraison dans `mobile_notifications` (aucun secret à exporter).

Référence d’architecture : https://supabase.com/docs/guides/functions/schedule-functions
