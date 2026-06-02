// FramPilot - Présentation opérationnels
// 3 piliers : Production / Commerce / Finance
// Audience : chef de culture + chef station

const pptxgen = require("pptxgenjs")
const pres = new pptxgen()
pres.layout = "LAYOUT_WIDE"  // 13.3" x 7.5"
pres.author = "FramPilot"
pres.company = "Domaine BENHALIMA"
pres.title = "FramPilot — Pilotage Agricole Intelligent"

// ─── Palette ───
const C = {
  navy: "0F2E22",        // very dark green-navy (title backgrounds)
  dark: "1A3A2E",        // dark green
  green: "10B981",       // accent agricole
  greenLight: "D1FAE5",
  greenSoft: "ECFDF5",
  blue: "3B82F6",        // finance
  blueLight: "DBEAFE",
  blueSoft: "EFF6FF",
  purple: "8B5CF6",      // bordereaux/commerce
  purpleLight: "EDE9FE",
  purpleSoft: "F5F3FF",
  orange: "F59E0B",      // alertes
  orangeLight: "FED7AA",
  red: "EF4444",
  // neutres
  bg: "F8FAFC",
  bgCard: "FFFFFF",
  text: "1E293B",
  textMuted: "64748B",
  textLight: "94A3B8",
  border: "E2E8F0",
  white: "FFFFFF",
  darkText: "0F2E22",
}

const F = {
  title: "Calibri",
  body: "Calibri",
  mono: "Consolas",
}

const W = 13.3, H = 7.5

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function addFooter(slide, pageNum, totalPages, dark = false) {
  const c = dark ? C.textLight : C.textMuted
  slide.addText("Domaine BENHALIMA", {
    x: 0.5, y: H - 0.35, w: 4, h: 0.25,
    fontSize: 9, fontFace: F.body, color: c, italic: true, margin: 0,
  })
  slide.addText(`FramPilot · ${pageNum}/${totalPages}`, {
    x: W - 3, y: H - 0.35, w: 2.5, h: 0.25,
    fontSize: 9, fontFace: F.body, color: c, align: "right", margin: 0,
  })
}

function addCornerAccent(slide, color) {
  // Accent en haut à gauche : barre verticale
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.15, h: 1.6,
    fill: { color }, line: { type: "none" },
  })
}

function addTitle(slide, title, subtitle, accentColor) {
  slide.addText(title, {
    x: 0.5, y: 0.4, w: W - 1, h: 0.7,
    fontSize: 28, fontFace: F.title, color: C.text, bold: true, margin: 0,
  })
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 1.1, w: W - 1, h: 0.4,
      fontSize: 14, fontFace: F.body, color: C.textMuted, italic: true, margin: 0,
    })
  }
  // Petit carré accent à gauche du titre
  if (accentColor) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y: 0.5, w: 0.08, h: 0.5,
      fill: { color: accentColor }, line: { type: "none" },
    })
  }
}

function bullet(text, indent = 0) {
  return { text, options: { bullet: { code: indent === 0 ? "25A0" : "25CB" }, indentLevel: indent, breakLine: true, paraSpaceAfter: 6 } }
}

// ──────────────────────────────────────────────────────────────
// SLIDE 1 : TITRE
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.navy }

  // Bandeau vert accent à gauche
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.25, h: H, fill: { color: C.green }, line: { type: "none" } })
  // Cercle décoratif en bas droite
  s.addShape(pres.shapes.OVAL, { x: W - 2.5, y: H - 2.5, w: 4, h: 4, fill: { color: C.green, transparency: 85 }, line: { type: "none" } })

  // Marque "FramPilot"
  s.addText("FRAMPILOT", {
    x: 1, y: 1.5, w: 8, h: 0.5,
    fontSize: 14, fontFace: F.mono, color: C.green, bold: true, charSpacing: 8, margin: 0,
  })
  s.addText("Pilotage agricole intelligent", {
    x: 1, y: 2.1, w: 12, h: 1.5,
    fontSize: 52, fontFace: F.title, color: C.white, bold: true, margin: 0,
  })
  s.addText("De la récolte au cashflow, en un seul outil.", {
    x: 1, y: 3.6, w: 11, h: 0.6,
    fontSize: 22, fontFace: F.body, color: C.greenLight, italic: true, margin: 0,
  })

  // Trait horizontal
  s.addShape(pres.shapes.LINE, {
    x: 1, y: 4.7, w: 5, h: 0,
    line: { color: C.green, width: 2 },
  })

  // Sous-info
  s.addText([
    { text: "Présentation opérationnelle", options: { color: C.white, fontSize: 14, breakLine: true } },
    { text: "Chef de culture · Chef station", options: { color: C.textLight, fontSize: 12 } },
  ], { x: 1, y: 4.9, w: 8, h: 1, fontFace: F.body, margin: 0 })

  // Domaine
  s.addText("Domaine BENHALIMA · Maroc", {
    x: 1, y: H - 0.7, w: 8, h: 0.3,
    fontSize: 10, fontFace: F.body, color: C.textLight, italic: true, margin: 0,
  })
}

// ──────────────────────────────────────────────────────────────
// SLIDE 2 : LE DÉFI OPÉRATIONNEL
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.orange)
  addTitle(s, "Le défi quotidien", "Chef de culture & chef station : trop de papier, trop d'Excel.", C.orange)

  // 3 cartes problèmes
  const cards = [
    { icon: "📋", title: "Saisie multiple", desc: "Récoltes notées sur papier puis ressaisies sur Excel. Risque d'erreurs et de doublons.", color: C.orange },
    { icon: "⚖️", title: "Réconciliation manuelle", desc: "Bordereaux station vs envois : 5 à 10 heures par semaine à recouper les chiffres.", color: C.red },
    { icon: "📊", title: "Pilotage en retard", desc: "Le compte d'exploitation n'arrive qu'en fin de campagne. Trop tard pour réagir.", color: C.purple },
  ]
  cards.forEach((c, i) => {
    const x = 0.7 + i * 4.2
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 2.2, w: 3.9, h: 4.2,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
      shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.06 },
    })
    // Accent gauche
    s.addShape(pres.shapes.RECTANGLE, { x, y: 2.2, w: 0.1, h: 4.2, fill: { color: c.color }, line: { type: "none" } })
    s.addText(c.icon, { x: x + 0.3, y: 2.5, w: 1, h: 1, fontSize: 44, margin: 0 })
    s.addText(c.title, { x: x + 0.3, y: 3.7, w: 3.5, h: 0.5, fontSize: 18, fontFace: F.title, color: C.text, bold: true, margin: 0 })
    s.addText(c.desc, { x: x + 0.3, y: 4.3, w: 3.5, h: 2, fontSize: 13, fontFace: F.body, color: C.textMuted, margin: 0 })
  })

  // Statistique en bas
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 6.7, w: W - 1.4, h: 0.5,
    fill: { color: C.orange, transparency: 88 }, line: { color: C.orange, width: 0.5 },
  })
  s.addText([
    { text: "Réalité observée : ", options: { color: C.text, fontSize: 13, bold: true } },
    { text: "5 à 10 heures par semaine perdues en re-saisie et vérifications croisées.", options: { color: C.text, fontSize: 13 } },
  ], { x: 0.9, y: 6.72, w: W - 1.7, h: 0.46, fontFace: F.body, margin: 0, valign: "middle" })

  addFooter(s, 2, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 3 : VISION 3 PILIERS
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.green)
  addTitle(s, "Notre approche : 3 piliers, 1 outil", "Tout le cycle agricole, du sol à la facture, dans une seule application.", C.green)

  const pillars = [
    {
      title: "PRODUCTION", color: C.green, icon: "🌿",
      lines: ["Planning de culture", "Saisie récolte multicanal", "Cycle lot temps réel", "Alertes terrain"],
    },
    {
      title: "COMMERCE", color: C.purple, icon: "💼",
      lines: ["Envoi station", "Tri intelligent", "Bordereaux hebdo / mensuel", "Auto-facturation client"],
    },
    {
      title: "FINANCE", color: C.blue, icon: "📊",
      lines: ["Budget vs Réel mensuel", "Compte d'exploitation", "Amortissements auto", "Dashboard CEO IA"],
    },
  ]
  pillars.forEach((p, i) => {
    const x = 0.7 + i * 4.2
    // Card
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.9, w: 3.9, h: 5,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
      shadow: { type: "outer", color: "000000", blur: 10, offset: 2, angle: 90, opacity: 0.08 },
    })
    // Header colorée
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.9, w: 3.9, h: 1.2, fill: { color: p.color }, line: { type: "none" } })
    s.addText(p.icon, { x: x + 0.3, y: 2.05, w: 1, h: 0.9, fontSize: 38, color: C.white, margin: 0 })
    s.addText(p.title, {
      x: x + 1.3, y: 2.25, w: 2.5, h: 0.5,
      fontSize: 18, fontFace: F.title, color: C.white, bold: true, charSpacing: 3, margin: 0,
    })
    s.addText(`PILIER ${i + 1}`, {
      x: x + 1.3, y: 2.7, w: 2.5, h: 0.3,
      fontSize: 9, fontFace: F.mono, color: C.white, italic: true, margin: 0,
    })
    // Bullets
    s.addText(
      p.lines.map(l => ({ text: l, options: { bullet: { code: "25A0" }, breakLine: true, paraSpaceAfter: 8 } })),
      { x: x + 0.3, y: 3.4, w: 3.4, h: 3.4, fontSize: 14, fontFace: F.body, color: C.text, margin: 0 },
    )
  })

  addFooter(s, 3, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 4 : SECTION TITLE PRODUCTION
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.dark }
  // Bandeau vert vertical
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.4, h: H, fill: { color: C.green }, line: { type: "none" } })
  // Cercle décoratif
  s.addShape(pres.shapes.OVAL, { x: W - 4, y: -1, w: 6, h: 6, fill: { color: C.green, transparency: 88 }, line: { type: "none" } })

  s.addText("PILIER 1", {
    x: 1, y: 2.5, w: 6, h: 0.4,
    fontSize: 14, fontFace: F.mono, color: C.green, bold: true, charSpacing: 8, margin: 0,
  })
  s.addText("🌿  Production", {
    x: 1, y: 3.0, w: 11, h: 1.4,
    fontSize: 64, fontFace: F.title, color: C.white, bold: true, margin: 0,
  })
  s.addText("De la plantation à la récolte, le terrain piloté en temps réel.", {
    x: 1, y: 4.6, w: 11, h: 0.6,
    fontSize: 20, fontFace: F.body, color: C.greenLight, italic: true, margin: 0,
  })
  // Sous-thèmes
  s.addText("Planning  ·  Récolte  ·  Cycle de vie du lot  ·  Alertes terrain", {
    x: 1, y: 5.5, w: 11, h: 0.4,
    fontSize: 14, fontFace: F.body, color: C.textLight, margin: 0,
  })
}

// ──────────────────────────────────────────────────────────────
// SLIDE 5 : Planning culture & campagnes
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.green)
  addTitle(s, "Planning de culture", "Une campagne, plusieurs serres, plusieurs variétés — orchestré en un seul écran.", C.green)

  // Bloc gauche : hiérarchie
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 1.9, w: 5.5, h: 5,
    fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
    shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.06 },
  })
  s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 1.9, w: 5.5, h: 0.6, fill: { color: C.greenSoft }, line: { type: "none" } })
  s.addText("HIÉRARCHIE", {
    x: 0.9, y: 1.95, w: 5, h: 0.5,
    fontSize: 11, fontFace: F.mono, color: C.green, bold: true, charSpacing: 4, margin: 0,
  })

  const hierarchy = [
    { label: "Domaine", desc: "1 entité juridique", indent: 0, color: C.dark },
    { label: "Ferme", desc: "ex : Ajana, Saïs", indent: 1, color: C.green },
    { label: "Serre", desc: "type, surface m²", indent: 2, color: C.blue },
    { label: "Plantation", desc: "variété × cycle", indent: 3, color: C.purple },
    { label: "Récolte", desc: "saisie quotidienne", indent: 4, color: C.orange },
  ]
  hierarchy.forEach((h, i) => {
    const y = 2.7 + i * 0.75
    const x = 0.9 + h.indent * 0.4
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.18, h: 0.55, fill: { color: h.color }, line: { type: "none" } })
    s.addText(h.label, {
      x: x + 0.3, y, w: 1.8, h: 0.35,
      fontSize: 15, fontFace: F.title, color: C.text, bold: true, margin: 0,
    })
    s.addText(h.desc, {
      x: x + 0.3, y: y + 0.3, w: 4, h: 0.3,
      fontSize: 11, fontFace: F.body, color: C.textMuted, margin: 0,
    })
  })

  // Bloc droite : 4 cards bénéfices
  const benefits = [
    { icon: "📅", title: "Dates clés", desc: "Plantation, début/fin récolte, fin campagne — toutes traçables." },
    { icon: "🎯", title: "Objectifs production", desc: "kg/m² cible par variété + budget MAD/m² associé." },
    { icon: "🔄", title: "Multi-campagnes", desc: "Comparer 2024-25 vs 2025-26 d'un clic." },
    { icon: "🚨", title: "Statut live", desc: "Préparation · Plantation · Récolte · Clôturée." },
  ]
  benefits.forEach((b, i) => {
    const x = 6.5 + (i % 2) * 3.2
    const y = 1.9 + Math.floor(i / 2) * 2.55
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 3.05, h: 2.4,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
    })
    s.addText(b.icon, { x: x + 0.2, y: y + 0.2, w: 0.8, h: 0.8, fontSize: 32, margin: 0 })
    s.addText(b.title, {
      x: x + 0.2, y: y + 1.05, w: 2.8, h: 0.4,
      fontSize: 14, fontFace: F.title, color: C.text, bold: true, margin: 0,
    })
    s.addText(b.desc, {
      x: x + 0.2, y: y + 1.45, w: 2.8, h: 0.9,
      fontSize: 11, fontFace: F.body, color: C.textMuted, margin: 0,
    })
  })

  addFooter(s, 5, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 6 : Saisie récolte multicanal
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.green)
  addTitle(s, "Saisir une récolte : 3 canaux", "Du terrain au système, en quelques secondes — chacun son outil préféré.", C.green)

  const channels = [
    {
      title: "Telegram Bot", subtitle: "100% mobile",
      lines: ["Multilingue : FR · AR · Darija (arabe)", "Photo + montant en kg", "Validation immédiate", "Idéal pour le terrain"],
      color: C.blue, icon: "💬", lang: "كتبت في تيليغرام بالدارجة",
    },
    {
      title: "Application Web", subtitle: "Saisie batch",
      lines: ["Tableau visuel par jour/semaine", "Édition rapide", "Filtres campagne / serre", "Pour les responsables"],
      color: C.green, icon: "🖥️", lang: "Multi-récoltes en un clic",
    },
    {
      title: "Import Excel", subtitle: "Historique",
      lines: ["Fichier existant", "Mapping automatique", "Reprise des campagnes passées", "Gain de temps initial"],
      color: C.purple, icon: "📊", lang: "Compatible legacy",
    },
  ]
  channels.forEach((c, i) => {
    const x = 0.7 + i * 4.2
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.9, w: 3.9, h: 4.7,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
      shadow: { type: "outer", color: "000000", blur: 10, offset: 2, angle: 90, opacity: 0.08 },
    })
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.9, w: 3.9, h: 1.3, fill: { color: c.color }, line: { type: "none" } })
    s.addText(c.icon, { x: x + 0.3, y: 2.05, w: 1, h: 1, fontSize: 42, color: C.white, margin: 0 })
    s.addText(c.title, {
      x: x + 1.3, y: 2.15, w: 2.5, h: 0.5,
      fontSize: 18, fontFace: F.title, color: C.white, bold: true, margin: 0,
    })
    s.addText(c.subtitle, {
      x: x + 1.3, y: 2.65, w: 2.5, h: 0.4,
      fontSize: 11, fontFace: F.mono, color: C.white, charSpacing: 3, margin: 0,
    })

    s.addText(
      c.lines.map(l => ({ text: l, options: { bullet: { code: "25A0" }, breakLine: true, paraSpaceAfter: 5 } })),
      { x: x + 0.3, y: 3.5, w: 3.4, h: 2.3, fontSize: 13, fontFace: F.body, color: C.text, margin: 0 },
    )

    // Tag exemple en bas
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: 6, w: 3.3, h: 0.45,
      fill: { color: c.color, transparency: 88 }, line: { color: c.color, width: 0.5 },
    })
    s.addText(c.lang, {
      x: x + 0.4, y: 6.04, w: 3.1, h: 0.42,
      fontSize: 11, fontFace: F.body, color: c.color, italic: true, bold: true, margin: 0, valign: "middle",
    })
  })

  // Sous-texte
  s.addText("Sources unifiées : tout converge vers la même base — pas de re-saisie.", {
    x: 0.7, y: 6.8, w: W - 1.4, h: 0.35,
    fontSize: 12, fontFace: F.body, color: C.textMuted, italic: true, align: "center", margin: 0,
  })

  addFooter(s, 6, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 7 : Cycle de vie du lot
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.green)
  addTitle(s, "Le cycle de vie d'un lot", "Du sol jusqu'à la facture — chaque étape traçable, sans rien perdre.", C.green)

  // Pipeline horizontal
  const steps = [
    { label: "Récolte", icon: "🌿", color: C.green, desc: "Saisie quantité brute" },
    { label: "À envoyer", icon: "🚚", color: "65A30D", desc: "En attente de chargement" },
    { label: "Envoyé", icon: "📦", color: C.orange, desc: "Vers station, en attente tri" },
    { label: "Trié", icon: "🔬", color: C.blue, desc: "Freinte / écart appliqués" },
    { label: "Tarifé", icon: "💰", color: C.purple, desc: "Prix MAD/kg confirmé" },
    { label: "Facturé", icon: "✅", color: "059669", desc: "Inclus dans bordereau ou direct" },
  ]
  const stepW = 2.0
  const stepGap = 0.05
  const totalW = steps.length * stepW + (steps.length - 1) * stepGap
  const startX = (W - totalW) / 2

  steps.forEach((st, i) => {
    const x = startX + i * (stepW + stepGap)
    // Cercle icône
    s.addShape(pres.shapes.OVAL, {
      x: x + (stepW - 1.1) / 2, y: 2.2, w: 1.1, h: 1.1,
      fill: { color: st.color }, line: { type: "none" },
    })
    s.addText(st.icon, {
      x: x + (stepW - 1.1) / 2, y: 2.25, w: 1.1, h: 1,
      fontSize: 32, align: "center", valign: "middle", margin: 0,
    })
    // Numéro
    s.addShape(pres.shapes.OVAL, {
      x: x + (stepW + 0.3) / 2, y: 2.05, w: 0.4, h: 0.4,
      fill: { color: C.white }, line: { color: st.color, width: 1.5 },
    })
    s.addText(`${i + 1}`, {
      x: x + (stepW + 0.3) / 2, y: 2.05, w: 0.4, h: 0.4,
      fontSize: 11, fontFace: F.title, color: st.color, bold: true, align: "center", valign: "middle", margin: 0,
    })
    // Label
    s.addText(st.label, {
      x, y: 3.5, w: stepW, h: 0.4,
      fontSize: 14, fontFace: F.title, color: C.text, bold: true, align: "center", margin: 0,
    })
    // Desc
    s.addText(st.desc, {
      x, y: 3.95, w: stepW, h: 0.8,
      fontSize: 10, fontFace: F.body, color: C.textMuted, align: "center", margin: 0,
    })
    // Flèche
    if (i < steps.length - 1) {
      s.addShape(pres.shapes.LINE, {
        x: x + stepW - 0.05, y: 2.75, w: stepGap + 0.1, h: 0,
        line: { color: C.textLight, width: 1.5, endArrowType: "triangle" },
      })
    }
  })

  // Bloc info en bas : statut traçable
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 5.3, w: W - 1.4, h: 1.5,
    fill: { color: C.greenSoft }, line: { color: C.green, width: 0.5 },
  })
  s.addText("📍", { x: 0.9, y: 5.5, w: 0.6, h: 0.8, fontSize: 32, margin: 0 })
  s.addText([
    { text: "Statut visible en temps réel pour chaque lot", options: { color: C.darkText, fontSize: 16, bold: true, breakLine: true } },
    { text: "Chef de culture, chef station et direction voient le même statut, en live. Plus de questions du type ‘où en est ce lot ?'", options: { color: C.text, fontSize: 12 } },
  ], { x: 1.6, y: 5.5, w: W - 2.5, h: 1.1, fontFace: F.body, margin: 0, valign: "middle" })

  addFooter(s, 7, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 8 : SECTION TITLE COMMERCE
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.dark }
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.4, h: H, fill: { color: C.purple }, line: { type: "none" } })
  s.addShape(pres.shapes.OVAL, { x: W - 4, y: -1, w: 6, h: 6, fill: { color: C.purple, transparency: 88 }, line: { type: "none" } })

  s.addText("PILIER 2", {
    x: 1, y: 2.5, w: 6, h: 0.4,
    fontSize: 14, fontFace: F.mono, color: C.purple, bold: true, charSpacing: 8, margin: 0,
  })
  s.addText("💼  Commerce", {
    x: 1, y: 3.0, w: 11, h: 1.4,
    fontSize: 64, fontFace: F.title, color: C.white, bold: true, margin: 0,
  })
  s.addText("Du tri à la facture, sans Excel — bordereaux et factures par marché.", {
    x: 1, y: 4.6, w: 11, h: 0.6,
    fontSize: 20, fontFace: F.body, color: C.purpleLight, italic: true, margin: 0,
  })
  s.addText("Envoi station  ·  Tri  ·  Bordereaux  ·  Factures par client", {
    x: 1, y: 5.5, w: 11, h: 0.4,
    fontSize: 14, fontFace: F.body, color: C.textLight, margin: 0,
  })
}

// ──────────────────────────────────────────────────────────────
// SLIDE 9 : Du tri à la facture
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.purple)
  addTitle(s, "Du tri à la facture, sans Excel", "Pipeline automatisé : la station communique, le système calcule, la facture sort.", C.purple)

  const flow = [
    { title: "📦  Envoi station", desc: "Pesage brut + référence", time: "J" },
    { title: "🔬  Tri par la station", desc: "Freinte + écart + qty acceptée", time: "J+1 à J+3" },
    { title: "📑  Bordereau station", desc: "Hebdomadaire (Export) ou mensuel (Local)", time: "J+7 / fin de mois" },
    { title: "💰  Facture automatique", desc: "1 par marché × client paramétré", time: "instantané" },
    { title: "📅  Calendrier d'encaissement", desc: "Échéance prévue + relances", time: "30 à 45 j" },
  ]
  flow.forEach((f, i) => {
    const y = 2 + i * 0.85
    // Card
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y, w: W - 1.4, h: 0.75,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
    })
    // Accent gauche
    s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y, w: 0.1, h: 0.75, fill: { color: C.purple }, line: { type: "none" } })
    // Step number
    s.addShape(pres.shapes.OVAL, {
      x: 1, y: y + 0.13, w: 0.5, h: 0.5,
      fill: { color: C.purpleSoft }, line: { color: C.purple, width: 1 },
    })
    s.addText(`${i + 1}`, {
      x: 1, y: y + 0.13, w: 0.5, h: 0.5,
      fontSize: 14, fontFace: F.title, color: C.purple, bold: true, align: "center", valign: "middle", margin: 0,
    })
    // Title
    s.addText(f.title, {
      x: 1.7, y: y + 0.1, w: 6, h: 0.5,
      fontSize: 16, fontFace: F.title, color: C.text, bold: true, margin: 0,
    })
    s.addText(f.desc, {
      x: 1.7, y: y + 0.4, w: 7, h: 0.4,
      fontSize: 11, fontFace: F.body, color: C.textMuted, margin: 0,
    })
    // Time badge
    s.addShape(pres.shapes.RECTANGLE, {
      x: W - 2.8, y: y + 0.18, w: 1.9, h: 0.4,
      fill: { color: C.purpleSoft }, line: { color: C.purple, width: 0.5 },
    })
    s.addText(f.time, {
      x: W - 2.8, y: y + 0.18, w: 1.9, h: 0.4,
      fontSize: 10, fontFace: F.mono, color: C.purple, bold: true, align: "center", valign: "middle", margin: 0,
    })
  })

  // Sous-titre en bas
  s.addText("Tout est connecté : un envoi se transforme automatiquement en cash attendu.", {
    x: 0.7, y: 6.7, w: W - 1.4, h: 0.4,
    fontSize: 12, fontFace: F.body, color: C.textMuted, italic: true, align: "center", margin: 0,
  })

  addFooter(s, 9, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 10 : Tri intelligent — Freinte vs Écart
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.purple)
  addTitle(s, "Tri intelligent : freinte vs écart", "Distinguer la perte physique de la marchandise récupérable.", C.purple)

  // Diagramme : 1000 kg envoyés → trier
  // Schéma 3 colonnes
  const blocks = [
    {
      title: "FREINTE", icon: "🗑️", color: C.red,
      pct: "≈ 2%", kg: "20 kg",
      desc: "Pertes physiques (déshydratation, abîmé). Détruite — pas de récupération.",
    },
    {
      title: "ÉCART", icon: "🤝", color: C.orange,
      pct: "≈ 8%", kg: "78 kg",
      desc: "Pieces hors-1ère cat. Récupérée et VENDUE au client écart sur marché local.",
    },
    {
      title: "ACCEPTÉE", icon: "✅", color: C.green,
      pct: "≈ 90%", kg: "902 kg",
      desc: "1ère catégorie — destinée à l'Export ou marché premium.",
    },
  ]

  // Header : 1000 kg envoyés
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 1.9, w: W - 1.4, h: 0.7,
    fill: { color: C.purpleSoft }, line: { color: C.purple, width: 0.5 },
  })
  s.addText("📦  1 000 kg envoyés à la station", {
    x: 0.7, y: 1.9, w: W - 1.4, h: 0.7,
    fontSize: 18, fontFace: F.title, color: C.purple, bold: true, align: "center", valign: "middle", margin: 0,
  })

  blocks.forEach((b, i) => {
    const x = 0.7 + i * 4.2
    const y = 2.9
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 3.9, h: 3.6,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
      shadow: { type: "outer", color: "000000", blur: 10, offset: 2, angle: 90, opacity: 0.06 },
    })
    // Header colored
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 3.9, h: 0.7, fill: { color: b.color }, line: { type: "none" } })
    s.addText(b.icon, { x: x + 0.2, y: y + 0.08, w: 0.7, h: 0.55, fontSize: 26, color: C.white, margin: 0 })
    s.addText(b.title, {
      x: x + 0.9, y: y + 0.1, w: 2.8, h: 0.5,
      fontSize: 17, fontFace: F.title, color: C.white, bold: true, charSpacing: 3, margin: 0, valign: "middle",
    })
    // % big number
    s.addText(b.pct, {
      x, y: y + 0.9, w: 3.9, h: 0.7,
      fontSize: 42, fontFace: F.title, color: b.color, bold: true, align: "center", margin: 0,
    })
    s.addText(b.kg, {
      x, y: y + 1.7, w: 3.9, h: 0.4,
      fontSize: 14, fontFace: F.mono, color: C.text, align: "center", margin: 0,
    })
    s.addText(b.desc, {
      x: x + 0.3, y: y + 2.2, w: 3.4, h: 1.3,
      fontSize: 11, fontFace: F.body, color: C.textMuted, margin: 0, align: "center",
    })
  })

  // Info bas
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 6.7, w: W - 1.4, h: 0.5,
    fill: { color: C.orange, transparency: 88 }, line: { color: C.orange, width: 0.5 },
  })
  s.addText([
    { text: "Nouveau : ", options: { color: C.darkText, fontSize: 12, bold: true } },
    { text: "client écart paramétrable (un seul actif), avec marché dédié auto-créé. L'écart devient une vraie recette, plus une perte.", options: { color: C.text, fontSize: 12 } },
  ], { x: 0.9, y: 6.72, w: W - 1.7, h: 0.46, fontFace: F.body, margin: 0, valign: "middle" })

  addFooter(s, 10, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 11 : Bordereaux — fréquence par marché
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.purple)
  addTitle(s, "Bordereaux station par marché", "Adapté à chaque flux : hebdo pour l'export, mensuel pour le local.", C.purple)

  const types = [
    {
      title: "HEBDOMADAIRE",
      subtitle: "Export · Grande distribution",
      icon: "🌍",
      color: C.green,
      example: "Carrefour France, Salad Time",
      code: "SET-2027-S21",
      details: ["Lundi → dimanche ISO", "Validation FIFO automatique", "1 facture par marché", "Échéance 30-45 j"],
    },
    {
      title: "MENSUEL",
      subtitle: "Local · Souks · Industrie",
      icon: "🏪",
      color: C.blue,
      example: "Marché Agadir, Industrie tomate",
      code: "SET-2026-M07",
      details: ["1er → fin du mois", "Regroupe tous les envois du mois", "1 facture cumul", "Échéance 7-15 j"],
    },
    {
      title: "SANS BORDEREAU",
      subtitle: "Vente cash · Marché de gros",
      icon: "💵",
      color: C.orange,
      example: "Vendeurs ambulants, ventes directes",
      code: "Facture directe",
      details: ["Tarif appliqué au dispatch", "Facture immédiate", "Pas de regroupement", "Encaissement rapide"],
    },
  ]

  types.forEach((t, i) => {
    const x = 0.7 + i * 4.2
    const y = 1.9
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 3.9, h: 5,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
      shadow: { type: "outer", color: "000000", blur: 10, offset: 2, angle: 90, opacity: 0.06 },
    })
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 3.9, h: 1.4, fill: { color: t.color }, line: { type: "none" } })
    s.addText(t.icon, { x: x + 0.3, y: y + 0.2, w: 1, h: 1, fontSize: 42, color: C.white, margin: 0 })
    s.addText(t.title, {
      x: x + 1.3, y: y + 0.3, w: 2.5, h: 0.4,
      fontSize: 15, fontFace: F.title, color: C.white, bold: true, charSpacing: 3, margin: 0,
    })
    s.addText(t.subtitle, {
      x: x + 1.3, y: y + 0.7, w: 2.5, h: 0.5,
      fontSize: 10, fontFace: F.body, color: C.white, italic: true, margin: 0,
    })

    // Exemple
    s.addText("EXEMPLE", {
      x: x + 0.3, y: y + 1.6, w: 3.4, h: 0.3,
      fontSize: 9, fontFace: F.mono, color: t.color, bold: true, charSpacing: 3, margin: 0,
    })
    s.addText(t.example, {
      x: x + 0.3, y: y + 1.85, w: 3.4, h: 0.3,
      fontSize: 12, fontFace: F.body, color: C.text, bold: true, margin: 0,
    })

    // Code
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: y + 2.25, w: 3.3, h: 0.4,
      fill: { color: "F1F5F9" }, line: { color: C.border, width: 0.5 },
    })
    s.addText(t.code, {
      x: x + 0.3, y: y + 2.25, w: 3.3, h: 0.4,
      fontSize: 11, fontFace: F.mono, color: t.color, bold: true, align: "center", valign: "middle", margin: 0,
    })

    // Bullets
    s.addText(
      t.details.map(l => ({ text: l, options: { bullet: { code: "25A0" }, breakLine: true, paraSpaceAfter: 5 } })),
      { x: x + 0.3, y: y + 2.85, w: 3.4, h: 2, fontSize: 11, fontFace: F.body, color: C.text, margin: 0 },
    )
  })

  addFooter(s, 11, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 12 : Auto-facturation par marché × client
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.purple)
  addTitle(s, "Une facture par marché — auto-générée", "Le bordereau est validé, les factures sortent avec le bon client.", C.purple)

  // Schéma : 1 bordereau → N factures
  // Bordereau bloc gauche
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 2.0, w: 4.2, h: 4.4,
    fill: { color: C.purpleSoft }, line: { color: C.purple, width: 1 },
  })
  s.addText("📑", { x: 0.7, y: 2.1, w: 4.2, h: 0.8, fontSize: 40, align: "center", margin: 0 })
  s.addText("BORDEREAU VALIDÉ", {
    x: 0.7, y: 2.9, w: 4.2, h: 0.3,
    fontSize: 11, fontFace: F.mono, color: C.purple, bold: true, charSpacing: 3, align: "center", margin: 0,
  })
  s.addText("SET-2027-S21", {
    x: 0.7, y: 3.2, w: 4.2, h: 0.4,
    fontSize: 18, fontFace: F.title, color: C.darkText, bold: true, align: "center", margin: 0,
  })

  // Lignes bordereau (3 marchés)
  const lines = [
    { market: "Carrefour FR", qty: "850 kg", price: "12 MAD", total: "10 200" },
    { market: "Salad Time", qty: "320 kg", price: "12 MAD", total: "3 840" },
    { market: "Souk Local", qty: "120 kg", price: "3 MAD", total: "360" },
  ]
  lines.forEach((l, i) => {
    const y = 3.85 + i * 0.55
    s.addShape(pres.shapes.RECTANGLE, {
      x: 1, y, w: 3.6, h: 0.45,
      fill: { color: C.white }, line: { color: C.border, width: 0.5 },
    })
    s.addText(l.market, { x: 1.1, y: y + 0.04, w: 2, h: 0.4, fontSize: 11, fontFace: F.body, color: C.text, bold: true, margin: 0, valign: "middle" })
    s.addText(l.total, { x: 3, y: y + 0.04, w: 1.5, h: 0.4, fontSize: 11, fontFace: F.mono, color: C.purple, align: "right", margin: 0, valign: "middle" })
  })

  // Flèche au milieu
  s.addShape(pres.shapes.LINE, {
    x: 5.1, y: 4.2, w: 0.8, h: 0,
    line: { color: C.purple, width: 3, endArrowType: "triangle" },
  })
  s.addText("auto", {
    x: 5.1, y: 3.9, w: 0.8, h: 0.3,
    fontSize: 10, fontFace: F.mono, color: C.purple, bold: true, align: "center", italic: true, margin: 0,
  })

  // 3 factures bloc droite
  const invs = [
    { num: "FB-2027-S21-1", client: "Carrefour France SAS", amount: "10 200 MAD", due: "05/08/2027", color: C.green },
    { num: "FB-2027-S21-2", client: "Salad Time Maroc", amount: "3 840 MAD", due: "20/07/2027", color: C.blue },
    { num: "FB-2027-S21-3", client: "Coopérative Souk", amount: "360 MAD", due: "07/07/2027", color: C.orange },
  ]
  invs.forEach((inv, i) => {
    const x = 6.5
    const y = 2.0 + i * 1.55
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 6, h: 1.4,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
    })
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.1, h: 1.4, fill: { color: inv.color }, line: { type: "none" } })
    s.addText("📄", { x: x + 0.3, y: y + 0.3, w: 0.8, h: 0.8, fontSize: 32, margin: 0 })
    s.addText(inv.num, {
      x: x + 1.2, y: y + 0.2, w: 3, h: 0.35,
      fontSize: 12, fontFace: F.mono, color: inv.color, bold: true, margin: 0,
    })
    s.addText(inv.client, {
      x: x + 1.2, y: y + 0.55, w: 3, h: 0.35,
      fontSize: 13, fontFace: F.title, color: C.text, bold: true, margin: 0,
    })
    s.addText(`Échéance : ${inv.due}`, {
      x: x + 1.2, y: y + 0.9, w: 3, h: 0.35,
      fontSize: 10, fontFace: F.body, color: C.textMuted, margin: 0,
    })
    s.addText(inv.amount, {
      x: x + 4.3, y: y + 0.45, w: 1.6, h: 0.55,
      fontSize: 16, fontFace: F.title, color: inv.color, bold: true, align: "right", valign: "middle", margin: 0,
    })
  })

  // Note bas
  s.addText("Chaque client a son propre échéancier — fini les factures groupées difficiles à expliquer.", {
    x: 0.7, y: 6.7, w: W - 1.4, h: 0.4,
    fontSize: 12, fontFace: F.body, color: C.textMuted, italic: true, align: "center", margin: 0,
  })

  addFooter(s, 12, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 13 : SECTION TITLE FINANCE
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.dark }
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.4, h: H, fill: { color: C.blue }, line: { type: "none" } })
  s.addShape(pres.shapes.OVAL, { x: W - 4, y: -1, w: 6, h: 6, fill: { color: C.blue, transparency: 88 }, line: { type: "none" } })

  s.addText("PILIER 3", {
    x: 1, y: 2.5, w: 6, h: 0.4,
    fontSize: 14, fontFace: F.mono, color: C.blue, bold: true, charSpacing: 8, margin: 0,
  })
  s.addText("📊  Finance", {
    x: 1, y: 3.0, w: 11, h: 1.4,
    fontSize: 64, fontFace: F.title, color: C.white, bold: true, margin: 0,
  })
  s.addText("Budget vs Réel chaque mois — la marge se pilote, ne se subit pas.", {
    x: 1, y: 4.6, w: 11, h: 0.6,
    fontSize: 20, fontFace: F.body, color: C.blueLight, italic: true, margin: 0,
  })
  s.addText("Budget  ·  Compte d'exploitation  ·  Amortissements  ·  Dashboard CEO IA", {
    x: 1, y: 5.5, w: 11, h: 0.4,
    fontSize: 14, fontFace: F.body, color: C.textLight, margin: 0,
  })
}

// ──────────────────────────────────────────────────────────────
// SLIDE 14 : Budget vs Réel
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.blue)
  addTitle(s, "Budget vs Réel — mois par mois", "Voir la dérive avant qu'elle coûte cher.", C.blue)

  // 4 KPI cards
  const kpis = [
    { label: "PRODUITS", b: "5 366 173", a: "5 368 430", v: "+0,04%", color: C.green },
    { label: "CHARGES VAR.", b: "459 999", a: "284 781", v: "−38%", color: C.green },
    { label: "CHARGES FIXES", b: "310 000", a: "211 097", v: "−32%", color: C.green },
    { label: "AMORTISSEMENTS", b: "100 000", a: "100 000", v: "0%", color: C.textMuted },
  ]
  kpis.forEach((k, i) => {
    const x = 0.7 + i * 3.15
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.9, w: 3.0, h: 1.7,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
    })
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.9, w: 3.0, h: 0.08, fill: { color: k.color }, line: { type: "none" } })
    s.addText(k.label, {
      x: x + 0.2, y: 2.05, w: 2.6, h: 0.3,
      fontSize: 10, fontFace: F.mono, color: C.textMuted, charSpacing: 2, margin: 0,
    })
    s.addText(k.a, {
      x: x + 0.2, y: 2.4, w: 2.6, h: 0.6,
      fontSize: 22, fontFace: F.title, color: C.text, bold: true, margin: 0,
    })
    s.addText(`Bud : ${k.b}`, {
      x: x + 0.2, y: 3.05, w: 1.7, h: 0.3,
      fontSize: 10, fontFace: F.body, color: C.textMuted, margin: 0,
    })
    s.addText(k.v, {
      x: x + 1.9, y: 3.05, w: 1, h: 0.3,
      fontSize: 11, fontFace: F.mono, color: k.color, bold: true, align: "right", margin: 0,
    })
  })

  // Graphique tendance
  s.addText("Évolution Budget vs Réel · Juin 2026 → Mai 2027", {
    x: 0.7, y: 3.9, w: W - 1.4, h: 0.4,
    fontSize: 14, fontFace: F.title, color: C.text, bold: true, margin: 0,
  })

  const chartData = [
    {
      name: "Budget",
      labels: ["Jun","Jul","Aoû","Sep","Oct","Nov","Déc","Jan","Fév","Mar","Avr","Mai"],
      values: [-200000, 850000, 870000, 845000, 870000, 845000, 870000, 870000, 790000, 840000, 845000, 840000],
    },
    {
      name: "Réel",
      labels: ["Jun","Jul","Aoû","Sep","Oct","Nov","Déc","Jan","Fév","Mar","Avr","Mai"],
      values: [-180000, 870000, 860000, 855000, 880000, 855000, 880000, 880000, 800000, 845000, 850000, 845000],
    },
  ]
  s.addChart(pres.charts.LINE, chartData, {
    x: 0.7, y: 4.3, w: W - 1.4, h: 2.4,
    chartColors: [C.blue, C.green],
    lineSmooth: true, lineSize: 2.5,
    showLegend: true, legendPos: "b", legendFontSize: 10,
    catAxisLabelColor: C.textMuted, catAxisLabelFontSize: 9,
    valAxisLabelColor: C.textMuted, valAxisLabelFontSize: 9,
    valGridLine: { color: "E2E8F0", size: 0.5 },
    catGridLine: { style: "none" },
    chartArea: { fill: { color: C.bgCard } },
  })

  addFooter(s, 14, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 15 : Compte d'exploitation multi-niveaux
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.blue)
  addTitle(s, "Compte d'exploitation multi-niveaux", "De la vue Domaine jusqu'à la serre individuelle — d'un clic.", C.blue)

  // 3 niveaux en cartes
  const levels = [
    {
      icon: "🌐",
      title: "DOMAINE",
      subtitle: "Vue consolidée",
      audience: "Direction",
      lines: ["Toutes fermes confondues", "Tous types de marchés", "P&L global", "Trésorerie consolidée"],
      color: C.blue,
    },
    {
      icon: "🏡",
      title: "FERME",
      subtitle: "Par exploitation",
      audience: "Chef de ferme",
      lines: ["Ferme Ajana, Ferme Saïs", "Production + marges propres", "Sous-totaux par catégorie", "Comparaison inter-fermes"],
      color: C.green,
    },
    {
      icon: "🌱",
      title: "SERRE",
      subtitle: "Détail opérationnel",
      audience: "Chef de culture",
      lines: ["1 serre = 1 micro-CPC", "Rendement kg/m²", "Coût variable serre", "Marge nette unité"],
      color: C.purple,
    },
  ]

  levels.forEach((l, i) => {
    const x = 0.7 + i * 4.2
    const y = 2.0
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 3.9, h: 4.7,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
      shadow: { type: "outer", color: "000000", blur: 10, offset: 2, angle: 90, opacity: 0.08 },
    })
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 3.9, h: 1.3, fill: { color: l.color }, line: { type: "none" } })
    s.addText(l.icon, { x: x + 0.3, y: y + 0.2, w: 1, h: 0.9, fontSize: 38, color: C.white, margin: 0 })
    s.addText(l.title, {
      x: x + 1.3, y: y + 0.25, w: 2.5, h: 0.4,
      fontSize: 18, fontFace: F.title, color: C.white, bold: true, charSpacing: 3, margin: 0,
    })
    s.addText(l.subtitle, {
      x: x + 1.3, y: y + 0.7, w: 2.5, h: 0.4,
      fontSize: 11, fontFace: F.body, color: C.white, italic: true, margin: 0,
    })

    // Audience
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: y + 1.5, w: 3.3, h: 0.45,
      fill: { color: l.color, transparency: 90 }, line: { color: l.color, width: 0.5 },
    })
    s.addText(`Pour : ${l.audience}`, {
      x: x + 0.4, y: y + 1.52, w: 3.1, h: 0.42,
      fontSize: 11, fontFace: F.body, color: l.color, bold: true, margin: 0, valign: "middle",
    })

    s.addText(
      l.lines.map(li => ({ text: li, options: { bullet: { code: "25A0" }, breakLine: true, paraSpaceAfter: 5 } })),
      { x: x + 0.3, y: y + 2.2, w: 3.4, h: 2.3, fontSize: 12, fontFace: F.body, color: C.text, margin: 0 },
    )
  })

  // Info bas : extrapolation futur
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 6.9, w: W - 1.4, h: 0.3,
    fill: { color: C.blueSoft }, line: { color: C.blue, width: 0.5 },
  })
  s.addText([
    { text: "💡  Bonus : ", options: { color: C.blue, fontSize: 11, bold: true } },
    { text: "extrapolation auto pour les mois futurs (mois sans réel = budget projeté). Tu vois où tu vas, pas où tu étais.", options: { color: C.text, fontSize: 11 } },
  ], { x: 0.9, y: 6.9, w: W - 1.7, h: 0.3, fontFace: F.body, margin: 0, valign: "middle" })

  addFooter(s, 15, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 16 : Amortissements + Dashboard CEO IA
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.blue)
  addTitle(s, "Amortissements + Dashboard IA", "Les chiffres calculés tout seuls, les décisions assistées par l'IA.", C.blue)

  // Bloc gauche : Amortissements
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 2.0, w: 5.8, h: 4.8,
    fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
    shadow: { type: "outer", color: "000000", blur: 10, offset: 2, angle: 90, opacity: 0.06 },
  })
  s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 2.0, w: 5.8, h: 0.7, fill: { color: C.blue }, line: { type: "none" } })
  s.addText("🏗️", { x: 0.9, y: 2.1, w: 0.7, h: 0.55, fontSize: 28, color: C.white, margin: 0 })
  s.addText("AMORTISSEMENTS AUTOMATIQUES", {
    x: 1.6, y: 2.1, w: 4.8, h: 0.5,
    fontSize: 14, fontFace: F.title, color: C.white, bold: true, charSpacing: 2, margin: 0, valign: "middle",
  })

  // Exemple actif
  s.addText("Exemple — Serre 06", {
    x: 1, y: 2.95, w: 5, h: 0.35,
    fontSize: 12, fontFace: F.title, color: C.text, bold: true, margin: 0,
  })
  const amortRows = [
    { label: "Coût d'acquisition", value: "1 000 000 MAD" },
    { label: "Durée d'amortissement", value: "10 ans" },
    { label: "Dotation mensuelle", value: "8 333 MAD/mois", highlight: true },
    { label: "Période campagne", value: "13 mois (juin 26 → juin 27)" },
    { label: "Amortissement campagne", value: "108 333 MAD", highlight: true },
  ]
  amortRows.forEach((r, i) => {
    const y = 3.4 + i * 0.5
    s.addShape(pres.shapes.RECTANGLE, {
      x: 1, y, w: 5.2, h: 0.42,
      fill: { color: r.highlight ? C.blueSoft : C.bg }, line: { color: C.border, width: 0.3 },
    })
    s.addText(r.label, {
      x: 1.1, y, w: 3, h: 0.42,
      fontSize: 11, fontFace: F.body, color: C.textMuted, valign: "middle", margin: 0,
    })
    s.addText(r.value, {
      x: 4.1, y, w: 2, h: 0.42,
      fontSize: 12, fontFace: F.mono, color: r.highlight ? C.blue : C.text, bold: r.highlight, align: "right", valign: "middle", margin: 0,
    })
  })

  s.addText("→ Pas de tableau Excel à maintenir : l'app calcule pour chaque mois de la campagne.", {
    x: 1, y: 6.05, w: 5.2, h: 0.6,
    fontSize: 10, fontFace: F.body, color: C.textMuted, italic: true, margin: 0,
  })

  // Bloc droite : Dashboard CEO IA
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.8, y: 2.0, w: 5.8, h: 4.8,
    fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
    shadow: { type: "outer", color: "000000", blur: 10, offset: 2, angle: 90, opacity: 0.06 },
  })
  s.addShape(pres.shapes.RECTANGLE, { x: 6.8, y: 2.0, w: 5.8, h: 0.7, fill: { color: C.purple }, line: { type: "none" } })
  s.addText("🤖", { x: 7, y: 2.1, w: 0.7, h: 0.55, fontSize: 28, color: C.white, margin: 0 })
  s.addText("DASHBOARD CEO + IA", {
    x: 7.7, y: 2.1, w: 4.8, h: 0.5,
    fontSize: 14, fontFace: F.title, color: C.white, bold: true, charSpacing: 2, margin: 0, valign: "middle",
  })

  const aiInsights = [
    { icon: "🟢", text: "Marge brute 25% — dans le budget", color: C.green },
    { icon: "🟡", text: "3 factures Carrefour en retard 12 j — relancer", color: C.orange },
    { icon: "🔴", text: "Serre 04 : rendement −18% vs cible", color: C.red },
    { icon: "💡", text: "Prix Local Salad Time +8% ce mois → maintenir", color: C.blue },
  ]
  aiInsights.forEach((ins, i) => {
    const y = 3.2 + i * 0.7
    s.addShape(pres.shapes.RECTANGLE, {
      x: 7, y, w: 5.4, h: 0.6,
      fill: { color: ins.color, transparency: 90 }, line: { color: ins.color, width: 0.5 },
    })
    s.addText(ins.icon, { x: 7.1, y: y + 0.1, w: 0.5, h: 0.45, fontSize: 16, margin: 0 })
    s.addText(ins.text, {
      x: 7.7, y, w: 4.6, h: 0.6,
      fontSize: 12, fontFace: F.body, color: C.text, valign: "middle", margin: 0,
    })
  })

  s.addText("→ L'IA détecte les écarts et propose les bonnes actions.", {
    x: 7, y: 6.05, w: 5.4, h: 0.6,
    fontSize: 10, fontFace: F.body, color: C.textMuted, italic: true, margin: 0,
  })

  addFooter(s, 16, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 17 : ROI / Synthèse
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.green)
  addTitle(s, "Le retour sur investissement", "3 chiffres qui changent le quotidien du chef station.", C.green)

  const stats = [
    {
      number: "−70%",
      label: "TEMPS DE RÉCONCILIATION",
      desc: "De 8h à 2h par semaine — bordereaux validés en FIFO automatique, plus de calculs manuels.",
      color: C.green,
    },
    {
      number: "100%",
      label: "TRAÇABILITÉ",
      desc: "Chaque lot tracé de la récolte à la facture. Aucun kg ne disparaît, aucune ligne sans source.",
      color: C.blue,
    },
    {
      number: "0",
      label: "ERREUR DE SAISIE",
      desc: "Plus de double-saisie Excel. Bot Telegram + Web = même base, source unique.",
      color: C.purple,
    },
  ]

  stats.forEach((st, i) => {
    const x = 0.7 + i * 4.2
    const y = 1.9
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 3.9, h: 4.8,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
      shadow: { type: "outer", color: "000000", blur: 12, offset: 3, angle: 90, opacity: 0.1 },
    })
    // Bandeau couleur top
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 3.9, h: 0.08, fill: { color: st.color }, line: { type: "none" } })

    // Big number
    s.addText(st.number, {
      x, y: y + 0.6, w: 3.9, h: 2,
      fontSize: 88, fontFace: F.title, color: st.color, bold: true, align: "center", margin: 0,
    })
    // Label
    s.addText(st.label, {
      x: x + 0.3, y: y + 2.8, w: 3.3, h: 0.4,
      fontSize: 12, fontFace: F.mono, color: C.text, bold: true, align: "center", charSpacing: 2, margin: 0,
    })
    // Description
    s.addText(st.desc, {
      x: x + 0.3, y: y + 3.3, w: 3.3, h: 1.4,
      fontSize: 12, fontFace: F.body, color: C.textMuted, align: "center", margin: 0,
    })
  })

  s.addText("Au final : le chef station récupère 6 heures par semaine pour piloter sa station, pas pour faire des additions.", {
    x: 0.7, y: 6.9, w: W - 1.4, h: 0.4,
    fontSize: 12, fontFace: F.body, color: C.darkText, bold: true, italic: true, align: "center", margin: 0,
  })

  addFooter(s, 17, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 18 : Roadmap
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.bg }
  addCornerAccent(s, C.green)
  addTitle(s, "Là où on est, et là où on va", "Une feuille de route claire — P1 livré, P2-P3 à venir.", C.green)

  const phases = [
    {
      title: "P0 — FONDATIONS",
      status: "✅  LIVRÉ",
      color: C.green,
      items: ["Multi-fermes, multi-serres, multi-variétés", "Saisie récolte Web + Telegram", "Cycle de vie lot complet", "Compte d'exploitation multi-niveaux"],
    },
    {
      title: "P1 — STATION & FACTURATION",
      status: "✅  LIVRÉ",
      color: C.green,
      items: ["Tri freinte/écart + client écart", "Bordereaux hebdo/mensuel", "Auto-facturation par marché", "Bot Telegram multilingue arabe"],
    },
    {
      title: "P2 — INTELLIGENCE",
      status: "🚧  EN COURS",
      color: C.orange,
      items: ["Dashboard CEO IA prédictif", "Alertes proactives (yield, marge)", "Conseil prix dynamique", "Notifications mobiles"],
    },
    {
      title: "P3 — ÉCOSYSTÈME",
      status: "🔜  ROADMAP",
      color: C.purple,
      items: ["Connexion banque (paiements auto)", "EDI Carrefour, Salad Time", "Module RH paie", "API publique tiers"],
    },
  ]

  phases.forEach((p, i) => {
    const x = 0.7 + (i % 2) * 6.1
    const y = 1.9 + Math.floor(i / 2) * 2.5
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 5.8, h: 2.3,
      fill: { color: C.bgCard }, line: { color: C.border, width: 0.5 },
    })
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.1, h: 2.3, fill: { color: p.color }, line: { type: "none" } })

    s.addText(p.title, {
      x: x + 0.3, y: y + 0.15, w: 4, h: 0.4,
      fontSize: 14, fontFace: F.title, color: C.text, bold: true, margin: 0,
    })
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 4.3, y: y + 0.18, w: 1.4, h: 0.4,
      fill: { color: p.color, transparency: 85 }, line: { color: p.color, width: 0.5 },
    })
    s.addText(p.status, {
      x: x + 4.3, y: y + 0.18, w: 1.4, h: 0.4,
      fontSize: 9, fontFace: F.mono, color: p.color, bold: true, align: "center", valign: "middle", margin: 0,
    })

    s.addText(
      p.items.map(it => ({ text: it, options: { bullet: { code: "25A0" }, breakLine: true, paraSpaceAfter: 3 } })),
      { x: x + 0.3, y: y + 0.65, w: 5.4, h: 1.6, fontSize: 11, fontFace: F.body, color: C.text, margin: 0 },
    )
  })

  addFooter(s, 18, 19)
}

// ──────────────────────────────────────────────────────────────
// SLIDE 19 : Final / CTA
// ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: C.navy }

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.25, h: H, fill: { color: C.green }, line: { type: "none" } })
  s.addShape(pres.shapes.OVAL, { x: -1, y: H - 3, w: 4, h: 4, fill: { color: C.green, transparency: 88 }, line: { type: "none" } })
  s.addShape(pres.shapes.OVAL, { x: W - 3, y: -1, w: 4, h: 4, fill: { color: C.blue, transparency: 88 }, line: { type: "none" } })

  s.addText("PRÊT POUR LA DÉMO ?", {
    x: 1, y: 1.8, w: 11, h: 0.5,
    fontSize: 16, fontFace: F.mono, color: C.green, bold: true, charSpacing: 8, margin: 0,
  })
  s.addText("FramPilot vous attend.", {
    x: 1, y: 2.4, w: 11, h: 1.2,
    fontSize: 56, fontFace: F.title, color: C.white, bold: true, margin: 0,
  })
  s.addText("Découvrez l'outil sur 3 canaux : bot Telegram, web app, bordereau imprimable.", {
    x: 1, y: 3.8, w: 11, h: 0.6,
    fontSize: 18, fontFace: F.body, color: C.greenLight, italic: true, margin: 0,
  })

  // 3 cartes CTA
  const ctas = [
    { icon: "💬", title: "Bot Telegram", desc: "Saisie terrain mobile — français, arabe, darija", color: C.blue },
    { icon: "🖥️", title: "Application Web", desc: "Pilotage complet, tous écrans", color: C.green },
    { icon: "🖨️", title: "Bordereau PDF", desc: "Édition et impression, signature station", color: C.purple },
  ]
  ctas.forEach((c, i) => {
    const x = 1 + i * 3.85
    const y = 5.0
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 3.6, h: 1.6,
      fill: { color: "FFFFFF", transparency: 92 }, line: { color: c.color, width: 1 },
    })
    s.addText(c.icon, { x: x + 0.2, y: y + 0.3, w: 1, h: 1, fontSize: 36, margin: 0 })
    s.addText(c.title, {
      x: x + 1.3, y: y + 0.3, w: 2.2, h: 0.4,
      fontSize: 15, fontFace: F.title, color: C.white, bold: true, margin: 0,
    })
    s.addText(c.desc, {
      x: x + 1.3, y: y + 0.75, w: 2.2, h: 0.75,
      fontSize: 10, fontFace: F.body, color: C.greenLight, margin: 0,
    })
  })

  // Signature
  s.addText("Domaine BENHALIMA · Maroc · 2026", {
    x: 1, y: H - 0.7, w: 8, h: 0.3,
    fontSize: 10, fontFace: F.body, color: C.textLight, italic: true, margin: 0,
  })
  s.addText("FramPilot · 19/19", {
    x: W - 4, y: H - 0.7, w: 3, h: 0.3,
    fontSize: 10, fontFace: F.body, color: C.textLight, italic: true, align: "right", margin: 0,
  })
}

// ──────────────────────────────────────────────────────────────
// GÉNÉRATION
// ──────────────────────────────────────────────────────────────
const outputPath = "FramPilot_Presentation.pptx"
pres.writeFile({ fileName: outputPath }).then(fn => {
  console.log(`✅ Présentation générée : ${fn}`)
  console.log(`   ${pres.slides.length} slides`)
})
