# ItriX Technologies / ItriX Farm

Landing autonome en français. Ouvrir index.html ou http://localhost:3001/itrix-corporate/index.html avec le serveur local de l'application. Aucune page d'accueil existante n'est remplacée.

## Publication de test — 2026-10-03

Projet Vercel séparé : `itrix-technologies` (scope `obenhalimas-projects`). URL : https://itrix-technologies.vercel.app. La page et les assets CSS, JS et images répondent HTTP 200. Aucun déploiement du projet `agri-app` effectué.

Les domaines `itrixtechnologies.com` et `www.itrixtechnologies.com` sont associés au projet ; configuration DNS Cap Connect encore à effectuer. La CLI Vercel indique un A vers `76.76.21.21`. Le CNAME www déjà visible chez Cap Connect pointe vers le domaine racine. Ne pas changer les serveurs de noms ni les entrées mail/FTP pour ce test.

Déployer seulement le contenu de ce dossier depuis un répertoire isolé lié au projet corporate, jamais depuis la racine du dépôt liée à `agri-app`. `vercel.json` configure un site statique sans installation ni compilation. Aucun secret ou fichier d'environnement de l'application ne doit être copié.

Palette issue du branding fourni : #0B3D2E, #2E7D32, #88C34A, #D4A95C, #F6F4EB, #1F2937. Police Montserrat. Logo fourni, préservé.

Le formulaire télécharge seulement un brief TXT local, sans transmission ou réservation. Avant publication, définir un vrai contact et le traitement des demandes. Les résultats du POC et le ROI ne sont pas présentés comme acquis.

Fonctionnalités décrites à partir de README.md, app/recoltes/page.tsx, app/agronomie/dashboard/page.tsx, app/couts/performance/page.tsx et app/admin/initialisation/page.tsx. Durée POC : proposition du fondateur (3 à 6 mois).

## Visuel illustratif

Asset : greenhouse.png. Généré avec le moteur imagegen intégré ; ne représente pas une exploitation cliente. Le logo n'a pas été généré ou modifié.

Prompt exact :

```text
Use case: photorealistic-natural
Asset type: standalone landscape photo-style background for the ItriX Farm landing page and corporate slide cover.
Scene/backdrop: a credible modern tomato greenhouse, long parallel crop rows, structural roof framing and translucent glazing.
Subject: healthy trellised tomato plants with natural leaf textures and a few ripe red tomatoes, predominantly on the right half.
Style/medium: photorealistic natural premium editorial photography; illustrative scene, not a named actual farm.
Composition/framing: wide 16:9 landscape composition. Keep the left half clean, dark, low-detail forest-green negative space suitable for editable text overlaid later. Long rows recede naturally into depth on the right.
Lighting/mood: warm early-morning light filtering through the greenhouse roof, sophisticated and calm.
Color palette: deep forest green (#0B3D2E), natural greens (#2E7D32, #88C34A), subtle warm gold (#D4A95C), natural ripe tomato red.
Constraints: one standalone image; realistic greenhouse geometry and cultivation; no people, no text, no logos, no screen or mockup, no watermark.
```
