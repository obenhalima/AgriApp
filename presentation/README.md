# FramPilot — Présentation opérationnelle

Présentation PowerPoint de l'application FramPilot, orientée chef de culture + chef station.

## Structure (19 slides)

| # | Slide | Pilier |
|---|---|---|
| 1 | Titre | — |
| 2 | Le défi quotidien | — |
| 3 | Vision 3 piliers | — |
| 4 | Section : Production | 🌿 Production |
| 5 | Planning de culture | 🌿 |
| 6 | Saisie récolte multicanal | 🌿 |
| 7 | Cycle de vie d'un lot | 🌿 |
| 8 | Section : Commerce | 💼 Commerce |
| 9 | Du tri à la facture | 💼 |
| 10 | Freinte vs Écart | 💼 |
| 11 | Bordereaux par marché | 💼 |
| 12 | Auto-facturation par client | 💼 |
| 13 | Section : Finance | 📊 Finance |
| 14 | Budget vs Réel | 📊 |
| 15 | Compte d'exploitation multi-niveaux | 📊 |
| 16 | Amortissements + Dashboard IA | 📊 |
| 17 | ROI (3 KPI) | — |
| 18 | Roadmap (P0/P1/P2/P3) | — |
| 19 | CTA final | — |

## Régénérer la présentation

```bash
cd presentation
npm install        # première fois uniquement
node generate_pres.js
```

→ Le fichier `FramPilot_Presentation.pptx` est créé/écrasé dans ce dossier.

## Personnaliser

Tout est dans `generate_pres.js` :
- **Palette** : objet `C` au début (vert, bleu, violet, orange...)
- **Polices** : objet `F`
- **Slides** : un bloc `{ ... }` par slide, dans l'ordre

Modifier un titre, un bullet, une stat → re-run `node generate_pres.js`.

## Format

- LAYOUT_WIDE (13.3" × 7.5")
- Compatible PowerPoint, Keynote, Google Slides, LibreOffice Impress
