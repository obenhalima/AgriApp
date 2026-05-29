# Roadmap FramPilot / AgriApp

> Backlog des évolutions produit pour le pilotage de production agricole
> du Domaine BENHALIMA (tomates serres, Maroc).
>
> Format : **🔥 P1 (urgent)** · **⚡ P2 (important)** · **💡 P3 (nice-to-have)**

---

## 📦 MODULE TRI / DISPATCHES / RÉCOLTES

### 🔥 P1 — Destination du rejet (freinte / écart)

**Contexte** : actuellement, quand l'opérateur saisit le tri à la station
(freinte % + écart %), les kg rejetés sont implicitement considérés
comme perdus. En réalité, une partie peut être :

- **Détruite** (perte sèche, vraie freinte sanitaire)
- **Retournée au stock** pour ré-envoi vers un autre marché (souk local,
  industrie, transformation)

**À faire** :

- [ ] Ajouter pour chaque ligne de tri un champ `destination_rejet` :
  - `destruction` (défaut)
  - `retour_stock` → nouvelle qty disponible pour un nouvel envoi
  - `vente_industrie` → vendu direct à prix réduit
  - `dons` (banque alimentaire, etc.)
- [ ] Si `retour_stock` : créer automatiquement un `harvest_lot` enfant
  catégorie `'stock_retour'` avec `quantity_kg = ecart_kg`
- [ ] Ce nouveau lot devient disponible dans le flow "Composer un envoi"
  pour un marché alternatif
- [ ] Mettre à jour le calcul du CA : pas seulement
  `qty_acceptee × prix_principal`, mais aussi
  `qty_rejet × prix_marche_secondaire` quand applicable
- [ ] Traçabilité : `harvest_lot_sources` lier le retour-stock au dispatch
  d'origine pour audit complet
- [ ] UI tri (Telegram + Web) : ajouter le sélecteur de destination juste
  après la saisie du % rejet

**Impact** : permet de récupérer 5-15% du CA en valorisant les rejets
au lieu de les jeter. Aligne aussi sur la réalité opérationnelle.

---

## 🤖 MODULE CHATBOT TELEGRAM

### ⚡ P2 — TTS (text-to-speech) pour les réponses du bot
Permettre aux ouvriers ne lisant pas de recevoir les confirmations en
audio (synthèse vocale via Google Cloud TTS ou ElevenLabs).

### ⚡ P2 — Intégration WhatsApp Business
En plus de Telegram, supporter WhatsApp via WhatsApp Business API.
Workflow identique mais via Twilio ou Meta API directe.

### 💡 P3 — Reconnaissance vocale offline (Vosk)
Pour les zones sans réseau stable, fallback de transcription locale
sur le téléphone via Vosk (modèles compacts arabe/français).

---

## 📊 DASHBOARD CEO & ANALYTIQUE

### ⚡ P2 — Bench mark inter-fermes automatique
Comparaison automatique des fermes sur indicateurs filière :
- kg/m² vs objectif
- Coût/kg produit
- % qualité Cat. 1
- Délai de rotation Plantation → 1ère récolte

### 💡 P3 — Prédiction du yield via ML
Modèle simple (régression) basé sur historique campagne, variété,
type de serre, mois de plantation → prédiction kg total.

### 💡 P3 — Alertes intelligentes proactives
Email/Telegram quotidien quand :
- Yield diverge de >20% vs prévision
- Stock intrants critique sous le seuil de sécurité
- Facture client en retard > 30j

---

## 🚜 MODULE PRODUCTION

### ⚡ P2 — Carnet de bord agronomique
Pour chaque plantation, log quotidien :
- EC / pH de l'eau d'irrigation
- T°C jour/nuit
- HR (humidité relative)
- Stade phéno (BBCH)
- Observations sanitaires (maladies, ravageurs)

### 💡 P3 — Intégration capteurs IoT
Si la ferme s'équipe : ingestion automatique des données capteurs
(stations météo, sondes substrat) via MQTT.

---

## 💰 MODULE FINANCE

### ⚡ P2 — Multi-devises (EUR / MAD / USD)
Tableau de bord avec conversion automatique au taux du jour.
Particulièrement utile pour le CA Export (EUR) vs charges locales (MAD).

### ⚡ P2 — Gestion des taxes export
TVA exonérée Export, droits de douane par destination, ATR/EUR.1.

### 💡 P3 — Forecasting cash flow rolling 90j
Vue glissante 90 jours encaissements prévus vs décaissements prévus.

---

## 👥 MODULE RH

### ⚡ P2 — Pointage par chatbot Telegram
Les ouvriers déclarent leur arrivée/départ via Telegram (au lieu
de la pointeuse physique).

### 💡 P3 — Calcul payroll automatique CNSS Maroc complet
Génération des bordereaux CNSS officiels (BDS) prêts pour soumission.

---

## 🛡️ ADMINISTRATION & SÉCURITÉ

### ⚡ P2 — Logs d'audit centralisés
Table `audit_logs` pour tracer qui a fait quoi (modifications
critiques : suppression campagne, changement de prix, etc.).

### ⚡ P2 — Export/Import de configuration complète
Permettre à un admin de sauvegarder/restaurer toute la config
métier (workflows, comptes comptables, paramètres) en JSON.

### 💡 P3 — Mode multi-tenant (multi-domaines agricoles)
Architecture qui permet à plusieurs domaines indépendants d'utiliser
la même instance avec isolation totale.

---

## 🎨 UX / UI

### ⚡ P2 — Mode mobile-first complet
Audit page par page pour assurer une bonne expérience sur smartphone
(actuellement plutôt tablet/desktop friendly).

### 💡 P3 — Thèmes personnalisables par utilisateur
Au-delà du dark/light, permettre des thèmes de couleur custom (utile
pour daltoniens ou préférences visuelles).

---

## 📅 HISTORIQUE DES SPRINTS RÉCENTS (mai 2026)

- ✅ Refonte UI complète + design system (Card / Badge / KPICard / DataTable)
- ✅ Module Plan de culture (Dashboard + Plan + Volumes + Gantt)
- ✅ Assistant IA + insights Dashboard CEO
- ✅ Bot Telegram multilingue (FR / Darija arabe / Arabe / EN)
- ✅ Export Excel formaté multi-onglets (Compte d'exploitation + Budgets)
- ✅ Page admin /demo-reset (Nuclear / Reset / Wizard / Générateur récoltes)
- ✅ Migration 036 (RPC admin défensives) + 037 (Reseed workflows)
- ✅ Générateur Commerce (dispatches + tri + prix + factures)
- ✅ Dashboard CEO aligné sur logique récoltes × prix variété
- ✅ Vue Budget Multi-fermes avec sous-totaux par ferme

---

*Dernière mise à jour : voir `git log ROADMAP.md` pour l'historique.*
