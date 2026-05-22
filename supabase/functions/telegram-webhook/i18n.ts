// ============================================================
// i18n — Traductions du bot Telegram
// Langues supportées : fr (Français) | en (English) | ar (عربية فصحى) | darija (Darija marocaine en latin)
//
// Convention Darija : script latin (Arabizi) car les ouvriers tapent comme ça
// au quotidien sur Telegram. Mots empruntés au FR conservés (campagne, lot, etc.).
//
// Usage : t(lang, 'enroll_invalid', { code: 'AB12' })
// ============================================================

export type Lang = 'fr' | 'en' | 'ar' | 'darija'

export const SUPPORTED_LANGS: Lang[] = ['fr', 'en', 'ar', 'darija']

export function normalizeLang(raw: string | null | undefined): Lang {
  const v = (raw ?? 'fr').toLowerCase().trim()
  if (v === 'darija' || v === 'darja' || v === 'ma') return 'darija'
  if (v === 'ar' || v === 'arabic' || v === 'arab') return 'ar'
  if (v === 'en' || v === 'english') return 'en'
  return 'fr'
}

// ─── Bibliothèque de traductions ──────────────────────────────
// Chaque clé : { fr, en, ar, darija }
// Les placeholders {{name}} sont remplacés par t(lang, key, params)
type Translations = Record<string, Record<Lang, string>>

const T: Translations = {
  // ─── Onboarding / /start ───────────────────────────────────
  welcome_no_code: {
    fr: '👋 Salam ! Je suis le bot du Domaine BENHALIMA.\n\nPour t\'utiliser, tu dois être inscrit. Demande à ton responsable un <b>code d\'invitation</b>, puis envoie :\n\n<code>/start TONCODE</code>',
    en: '👋 Hi! I\'m the Domaine BENHALIMA bot.\n\nTo use me, you need to be enrolled. Ask your manager for an <b>invitation code</b>, then send:\n\n<code>/start YOURCODE</code>',
    ar: '👋 مرحباً! أنا روبوت ضيعة بنحليمة.\n\nلاستعمالي، يجب أن تكون مُسجَّلاً. اطلب من المسؤول <b>رمز الدعوة</b>، ثم أرسل:\n\n<code>/start كود</code>',
    darija: '👋 Salam ! Ana l-bot dyal Domaine BENHALIMA.\n\nBach tkhdem m\'ana, khassek tkoun mosajjal. Tlob mn responsable dyalek <b>code d\'invitation</b>, w mn b3d sift :\n\n<code>/start CODEDYALEK</code>',
  },
  enroll_invalid_code: {
    fr: '❌ Code invalide ou expiré. Contacte ton responsable.',
    en: '❌ Invalid or expired code. Contact your manager.',
    ar: '❌ الرمز غير صالح أو منتهي. تواصل مع المسؤول.',
    darija: '❌ Code khayb wlla tsala. 3ayyat l-responsable dyalek.',
  },
  welcome_enrolled: {
    fr: '✅ Bienvenue {{name}} !\nTu peux maintenant enregistrer tes récoltes par message.\n\nQue veux-tu faire ?',
    en: '✅ Welcome {{name}}!\nYou can now log your harvests by message.\n\nWhat would you like to do?',
    ar: '✅ مرحباً بك {{name}}!\nيمكنك الآن تسجيل المحاصيل عبر الرسائل.\n\nماذا تريد أن تفعل؟',
    darija: '✅ Marhba bik {{name}} !\nDaba t9der tsajjel les récoltes dyalek b message.\n\nAch bghiti tdir ?',
  },

  // ─── Menu principal ────────────────────────────────────────
  menu_voice_session: {
    fr: '🎙️ Saisie vocale groupée',
    en: '🎙️ Grouped voice input',
    ar: '🎙️ إدخال صوتي جماعي',
    darija: '🎙️ Sjjel b-sawt 3la marra',
  },
  menu_harvest: {
    fr: '📦 Nouvelle récolte',
    en: '📦 New harvest',
    ar: '📦 محصول جديد',
    darija: '📦 Récolte jdida',
  },
  menu_compose_dispatch: {
    fr: '🚚 Composer un envoi station',
    en: '🚚 Compose station dispatch',
    ar: '🚚 تجهيز إرسال إلى المحطة',
    darija: '🚚 Sayb sho7na l-station',
  },
  menu_tri: {
    fr: '🔬 Saisir tri (freinte/écart)',
    en: '🔬 Enter sorting (loss/discard)',
    ar: '🔬 إدخال الفرز (الفاقد/الانحراف)',
    darija: '🔬 Dakhel le tri (freinte/écart)',
  },
  menu_confirm_price: {
    fr: '💰 Confirmer un prix',
    en: '💰 Confirm a price',
    ar: '💰 تأكيد السعر',
    darija: '💰 Akkad l-prix',
  },
  menu_no_harvest: {
    fr: '🚨 Journée sans récolte',
    en: '🚨 Day without harvest',
    ar: '🚨 يوم بدون محصول',
    darija: '🚨 Nhar bla récolte',
  },
  menu_my_lots: {
    fr: '📊 Mes derniers lots',
    en: '📊 My latest lots',
    ar: '📊 آخر دفعاتي',
    darija: '📊 Lots dyali l-akhrayn',
  },
  menu_help: {
    fr: '❓ Aide',
    en: '❓ Help',
    ar: '❓ مساعدة',
    darija: '❓ Aide',
  },

  // ─── Récolte (flow texte) ──────────────────────────────────
  no_active_planting: {
    fr: '❌ Aucune plantation active trouvée. Contacte le responsable.',
    en: '❌ No active planting found. Contact your manager.',
    ar: '❌ لم يتم العثور على زراعة نشطة. تواصل مع المسؤول.',
    darija: '❌ Ma kayna 7etta plantation active. 3ayyat l-responsable.',
  },
  pick_planting: {
    fr: '📦 Choisis la plantation :',
    en: '📦 Choose the planting:',
    ar: '📦 اختر الزراعة:',
    darija: '📦 Khtar l-plantation :',
  },
  planting_not_found: {
    fr: '❌ Plantation introuvable.',
    en: '❌ Planting not found.',
    ar: '❌ الزراعة غير موجودة.',
    darija: '❌ Plantation maleknach.',
  },
  ask_quantity: {
    fr: '🌿 {{label}}\n\nQuelle quantité (en kg) ? Envoie juste le nombre.',
    en: '🌿 {{label}}\n\nWhat quantity (in kg)? Just send the number.',
    ar: '🌿 {{label}}\n\nما الكمية (بالكيلو)؟ أرسل الرقم فقط.',
    darija: '🌿 {{label}}\n\nCh7al d-l-kilo ? Sift ghir l-raqm.',
  },
  invalid_quantity: {
    fr: '❌ Quantité invalide. Envoie juste un nombre, ex: <code>150</code>',
    en: '❌ Invalid quantity. Just send a number, e.g.: <code>150</code>',
    ar: '❌ الكمية غير صحيحة. أرسل رقماً فقط، مثال: <code>150</code>',
    darija: '❌ L-kemmiya makhdamach. Sift raqm bark, mital : <code>150</code>',
  },
  session_lost: {
    fr: '❌ Session perdue. Recommence avec /start',
    en: '❌ Session lost. Restart with /start',
    ar: '❌ الجلسة ضاعت. ابدأ من جديد بـ /start',
    darija: '❌ Session twddrat. 3awd b /start',
  },
  harvest_saved: {
    fr: '✅ <b>Récolte enregistrée</b>\nLot : <code>{{lot}}</code>\nQté : {{qty}} kg\nDate : {{date}}',
    en: '✅ <b>Harvest saved</b>\nLot: <code>{{lot}}</code>\nQty: {{qty}} kg\nDate: {{date}}',
    ar: '✅ <b>تم تسجيل المحصول</b>\nالدفعة: <code>{{lot}}</code>\nالكمية: {{qty}} كغ\nالتاريخ: {{date}}',
    darija: '✅ <b>Récolte tsajjlat</b>\nLot : <code>{{lot}}</code>\nQté : {{qty}} kg\nNhar : {{date}}',
  },
  error_with_msg: {
    fr: '❌ Erreur : {{msg}}',
    en: '❌ Error: {{msg}}',
    ar: '❌ خطأ: {{msg}}',
    darija: '❌ Mochkil : {{msg}}',
  },

  // ─── Journée sans récolte ──────────────────────────────────
  ask_no_harvest_reason: {
    fr: '🚨 Quelle est la raison ?',
    en: '🚨 What\'s the reason?',
    ar: '🚨 ما السبب؟',
    darija: '🚨 Ach 3lach ?',
  },
  reason_panne_irrigation: {
    fr: '⚙️ Panne d\'irrigation',
    en: '⚙️ Irrigation breakdown',
    ar: '⚙️ عطل في السقي',
    darija: '⚙️ Panne d-l-irrigation',
  },
  reason_meteo: {
    fr: '🌧️ Météo défavorable',
    en: '🌧️ Bad weather',
    ar: '🌧️ طقس سيء',
    darija: '🌧️ L-jaw makhdamch',
  },
  reason_main_oeuvre: {
    fr: '👥 Manque de main d\'œuvre',
    en: '👥 Labor shortage',
    ar: '👥 نقص في اليد العاملة',
    darija: '👥 Ma kaynach l-3ommal',
  },
  reason_maladie: {
    fr: '🦠 Maladie / phytopathologie',
    en: '🦠 Disease / phytopathology',
    ar: '🦠 مرض / علم الأمراض النباتية',
    darija: '🦠 Mradd / maladie',
  },
  reason_maintenance: {
    fr: '🔧 Maintenance',
    en: '🔧 Maintenance',
    ar: '🔧 صيانة',
    darija: '🔧 Maintenance',
  },
  reason_other: {
    fr: '❓ Autre (préciser)',
    en: '❓ Other (specify)',
    ar: '❓ سبب آخر (حدد)',
    darija: '❓ Sbab akhor (wddh)',
  },
  cancel: {
    fr: '✖ Annuler',
    en: '✖ Cancel',
    ar: '✖ إلغاء',
    darija: '✖ Annuler',
  },
  no_harvest_saved: {
    fr: '✅ <b>Journée sans récolte signalée</b>\nDate : {{date}}\nMotif : {{reason}}{{noteLine}}',
    en: '✅ <b>No-harvest day reported</b>\nDate: {{date}}\nReason: {{reason}}{{noteLine}}',
    ar: '✅ <b>تم الإبلاغ عن يوم بدون محصول</b>\nالتاريخ: {{date}}\nالسبب: {{reason}}{{noteLine}}',
    darija: '✅ <b>Nhar bla récolte tsajjel</b>\nNhar : {{date}}\nSbab : {{reason}}{{noteLine}}',
  },

  // ─── Vocal ─────────────────────────────────────────────────
  voice_listening: {
    fr: '🎤 J\'écoute…',
    en: '🎤 Listening…',
    ar: '🎤 أنا أستمع…',
    darija: '🎤 Kanesm3…',
  },
  voice_transcription_error: {
    fr: '❌ Erreur transcription : {{msg}}',
    en: '❌ Transcription error: {{msg}}',
    ar: '❌ خطأ في النسخ: {{msg}}',
    darija: '❌ Mochkil f t-transcription : {{msg}}',
  },
  voice_qty_unclear: {
    fr: '❌ Quantité non comprise. Réessaye en disant un nombre clairement, ou utilise le clavier.',
    en: '❌ Quantity not understood. Try again saying a number clearly, or use the keyboard.',
    ar: '❌ لم أفهم الكمية. حاول مرة أخرى بقول رقم واضح، أو استعمل لوحة المفاتيح.',
    darija: '❌ Mafhmtch l-kemmiya. 3awd 9ol l-raqm bouddou7, wlla khdem b clavier.',
  },
  voice_pct_unclear: {
    fr: '❌ Pourcentage non compris. Tape un nombre entre 0 et 100, ou utilise les boutons.',
    en: '❌ Percentage not understood. Type a number between 0 and 100, or use the buttons.',
    ar: '❌ لم أفهم النسبة. اكتب رقماً بين 0 و 100، أو استعمل الأزرار.',
    darija: '❌ Mafhmtch l-pourcentage. Kteb raqm bin 0 w 100, wlla khdem b les boutons.',
  },
  voice_price_unclear: {
    fr: '❌ Prix non compris. Réessaye, ex: <code>8.50</code>.',
    en: '❌ Price not understood. Try again, e.g.: <code>8.50</code>.',
    ar: '❌ لم أفهم السعر. حاول مرة أخرى، مثال: <code>8.50</code>.',
    darija: '❌ Mafhmtch l-prix. 3awd, mital : <code>8.50</code>.',
  },
  voice_no_planting: {
    fr: '❌ Aucune plantation active. Contacte le responsable.',
    en: '❌ No active planting. Contact your manager.',
    ar: '❌ لا توجد زراعة نشطة. تواصل مع المسؤول.',
    darija: '❌ Ma kayna 7etta plantation active. 3ayyat l-responsable.',
  },
  voice_recap_title: {
    fr: '📋 <b>Récap de la session vocale</b>',
    en: '📋 <b>Voice session summary</b>',
    ar: '📋 <b>ملخص الجلسة الصوتية</b>',
    darija: '📋 <b>Récap dyal session vocale</b>',
  },
  voice_recap_total: {
    fr: '<b>Total : {{total}} kg</b> sur {{count}} lot(s)\n\nTout est correct ?',
    en: '<b>Total: {{total}} kg</b> on {{count}} lot(s)\n\nIs everything correct?',
    ar: '<b>المجموع: {{total}} كغ</b> في {{count}} دفعة\n\nهل كل شيء صحيح؟',
    darija: '<b>L-mjmou3 : {{total}} kg</b> 3la {{count}} lot(s)\n\nKolchi mzyan ?',
  },
  voice_save_all: {
    fr: '✅ Tout enregistrer',
    en: '✅ Save all',
    ar: '✅ حفظ الكل',
    darija: '✅ Sajjel kolchi',
  },
  voice_continue: {
    fr: '🔁 Continuer la dictée',
    en: '🔁 Continue dictating',
    ar: '🔁 متابعة الإملاء',
    darija: '🔁 Kemmel l-dicté',
  },
  voice_cancel_session: {
    fr: '✗ Annuler la session',
    en: '✗ Cancel session',
    ar: '✗ إلغاء الجلسة',
    darija: '✗ Annuler la session',
  },
  voice_extracted_unclear: {
    fr: '🎤 <i>"{{transcription}}"</i>\n\n❓ Je n\'ai pas pu extraire de récolte exploitable. Réessaye en disant clairement <b>quantité, serre et variété</b>.',
    en: '🎤 <i>"{{transcription}}"</i>\n\n❓ I couldn\'t extract a usable harvest. Try again saying clearly <b>quantity, greenhouse and variety</b>.',
    ar: '🎤 <i>"{{transcription}}"</i>\n\n❓ لم أستطع استخراج محصول صالح. حاول مرة أخرى بقول <b>الكمية، البيت والصنف</b> بوضوح.',
    darija: '🎤 <i>"{{transcription}}"</i>\n\n❓ Ma 9dertch nakhroj récolte mn li gulti. 3awd 9ol bouddou7 <b>l-kemmiya, serre w variété</b>.',
  },

  // ─── Compose dispatch ──────────────────────────────────────
  compose_no_harvest_available: {
    fr: '❌ Aucune récolte récente avec quantité disponible.',
    en: '❌ No recent harvest with available quantity.',
    ar: '❌ لا توجد محاصيل حديثة بكمية متوفرة.',
    darija: '❌ Ma kayna walou récolte jdida 3andha quantité dispo.',
  },
  compose_lot_unavailable: {
    fr: '❌ Lot indisponible.',
    en: '❌ Lot unavailable.',
    ar: '❌ الدفعة غير متاحة.',
    darija: '❌ L-lot ma dispo-ch.',
  },
  compose_lot_already_added: {
    fr: 'Ce lot est déjà ajouté. Annule via /menu pour recommencer.',
    en: 'This lot is already added. Cancel via /menu to restart.',
    ar: 'هذه الدفعة مضافة بالفعل. ألغي عبر /menu للبدء من جديد.',
    darija: 'L-lot dakhel deja. 3awd /menu bach tbda mn jdid.',
  },
  compose_qty_invalid_or_all: {
    fr: '❌ Quantité invalide. Envoie un nombre ou <code>tout</code>.',
    en: '❌ Invalid quantity. Send a number or <code>all</code>.',
    ar: '❌ الكمية غير صحيحة. أرسل رقماً أو <code>الكل</code>.',
    darija: '❌ L-kemmiya makhdamach. Sift raqm wlla <code>kollou</code>.',
  },
  compose_qty_exceeds: {
    fr: '❌ Dépasse le disponible ({{max}}kg max).',
    en: '❌ Exceeds available ({{max}}kg max).',
    ar: '❌ تتجاوز المتاح ({{max}}كغ كحد أقصى).',
    darija: '❌ Akter mn li dispo ({{max}}kg max).',
  },
  compose_no_lots: {
    fr: '❌ Aucun lot sélectionné.',
    en: '❌ No lot selected.',
    ar: '❌ لم يتم اختيار أي دفعة.',
    darija: '❌ Ma khtariti walou lot.',
  },
  compose_no_market: {
    fr: '❌ Aucun marché actif.',
    en: '❌ No active market.',
    ar: '❌ لا يوجد سوق نشط.',
    darija: '❌ Ma kayn 7etta marché active.',
  },

  // ─── Aide / Help ───────────────────────────────────────────
  help_text: {
    fr: '<b>Comment m\'utiliser :</b>\n\n• Envoie un <b>message vocal</b> en disant les récoltes\n• Ou utilise les <b>boutons</b> du menu\n• <code>/menu</code> pour revenir au menu\n• <code>/cancel</code> pour annuler une action\n\n💬 Tu peux écrire en français, arabe, darija ou anglais — je comprends tout.',
    en: '<b>How to use me:</b>\n\n• Send a <b>voice message</b> saying your harvests\n• Or use the menu <b>buttons</b>\n• <code>/menu</code> to return to the menu\n• <code>/cancel</code> to cancel an action\n\n💬 You can write in French, Arabic, Darija or English — I understand them all.',
    ar: '<b>كيفية استعمالي:</b>\n\n• أرسل <b>رسالة صوتية</b> تقول فيها المحاصيل\n• أو استعمل <b>أزرار</b> القائمة\n• <code>/menu</code> للعودة إلى القائمة\n• <code>/cancel</code> لإلغاء عملية\n\n💬 يمكنك الكتابة بالفرنسية، العربية، الدارجة أو الإنجليزية — أفهم كل اللغات.',
    darija: '<b>Kifach tkhdem m\'ana :</b>\n\n• Sift <b>message vocal</b> w 9ol les récoltes\n• Wlla khdem b <b>les boutons</b> dyal l-menu\n• <code>/menu</code> bach trj3 l-menu\n• <code>/cancel</code> bach t-annuli action\n\n💬 T9der tkteb b français, 3arabiya, darija wlla anglais — kanfhem kolchi.',
  },

  // ─── Indicateurs génériques ────────────────────────────────
  total_label: { fr: 'Total', en: 'Total', ar: 'المجموع', darija: 'L-mjmou3' },
  date_label:  { fr: 'Date',  en: 'Date',  ar: 'التاريخ', darija: 'Nhar' },
  quantity_label: { fr: 'Quantité', en: 'Quantity', ar: 'الكمية', darija: 'L-kemmiya' },
  reason_label: { fr: 'Motif', en: 'Reason', ar: 'السبب', darija: 'Sbab' },
  note_label:  { fr: 'Note', en: 'Note', ar: 'ملاحظة', darija: 'Mola7adha' },

  // ─── Compose (suite) ───────────────────────────────────────
  compose_session_empty: {
    fr: '❌ Session vide.',
    en: '❌ Empty session.',
    ar: '❌ الجلسة فارغة.',
    darija: '❌ Session khawya.',
  },
  compose_no_variety: {
    fr: '❌ Récolte {{lot}} sans variété — annulation.',
    en: '❌ Harvest {{lot}} has no variety — cancelled.',
    ar: '❌ المحصول {{lot}} بدون صنف — إلغاء.',
    darija: '❌ Récolte {{lot}} bla variété — tla8at.',
  },
  compose_lot_error: {
    fr: '❌ Erreur lot {{idx}} : {{msg}}',
    en: '❌ Lot {{idx}} error: {{msg}}',
    ar: '❌ خطأ في الدفعة {{idx}}: {{msg}}',
    darija: '❌ Mochkil f lot {{idx}} : {{msg}}',
  },

  // ─── Tri (sorting) ─────────────────────────────────────────
  tri_nothing_to_sort: {
    fr: '✅ Aucun envoi en attente de tri.',
    en: '✅ No dispatch waiting for sorting.',
    ar: '✅ لا يوجد إرسال بانتظار الفرز.',
    darija: '✅ Ma kayn 7etta sho7na kat-stnna le tri.',
  },
  tri_pick_dispatch: {
    fr: '🔬 Choisis l\'envoi à trier :',
    en: '🔬 Choose the dispatch to sort:',
    ar: '🔬 اختر الإرسال للفرز:',
    darija: '🔬 Khtar sho7na bach t-tri-ha :',
  },
  not_found: {
    fr: '❌ Introuvable.',
    en: '❌ Not found.',
    ar: '❌ غير موجود.',
    darija: '❌ Maleknach.',
  },
  invalid_input_pct: {
    fr: '❌ Saisie invalide. Nombre entre 0 et 100.',
    en: '❌ Invalid input. Number between 0 and 100.',
    ar: '❌ إدخال غير صحيح. رقم بين 0 و 100.',
    darija: '❌ Dakhalti khta. Raqm bin 0 w 100.',
  },

  // ─── Prix ──────────────────────────────────────────────────
  price_pick_dispatch: {
    fr: '💰 Choisis l\'envoi à tarifer :',
    en: '💰 Choose the dispatch to price:',
    ar: '💰 اختر الإرسال لتسعيره:',
    darija: '💰 Khtar sho7na bach t-akkad l-prix :',
  },
  price_invalid: {
    fr: '❌ Prix invalide. Tape juste un nombre, ex: <code>8.50</code>',
    en: '❌ Invalid price. Just type a number, e.g.: <code>8.50</code>',
    ar: '❌ السعر غير صحيح. اكتب رقماً فقط، مثال: <code>8.50</code>',
    darija: '❌ L-prix makhdamch. Kteb raqm bark, mital : <code>8.50</code>',
  },

  // ─── My lots ───────────────────────────────────────────────
  my_lots_empty: {
    fr: '📊 Aucune récolte sur les 7 derniers jours.',
    en: '📊 No harvest in the last 7 days.',
    ar: '📊 لا توجد محاصيل في الأيام السبعة الأخيرة.',
    darija: '📊 Ma kayna 7etta récolte f 7iyam l-fayta.',
  },
  my_lots_title: {
    fr: '📊 <b>Derniers lots (7j)</b>',
    en: '📊 <b>Latest lots (7d)</b>',
    ar: '📊 <b>آخر الدفعات (7 أيام)</b>',
    darija: '📊 <b>Lots l-akhrayn (7 iyyam)</b>',
  },

  // ─── Annulation / divers ───────────────────────────────────
  cancelled_what_to_do: {
    fr: 'Annulé. Que veux-tu faire ?',
    en: 'Cancelled. What do you want to do?',
    ar: 'تم الإلغاء. ماذا تريد أن تفعل؟',
    darija: 'Tla8at. Ach bghiti tdir ?',
  },
  what_to_do: {
    fr: 'Que veux-tu faire ?',
    en: 'What do you want to do?',
    ar: 'ماذا تريد أن تفعل؟',
    darija: 'Ach bghiti tdir ?',
  },
  voice_continue_dictating: {
    fr: '🎤 OK, continue à dicter. Dis "fini" quand tu as terminé.',
    en: '🎤 OK, keep dictating. Say "done" when finished.',
    ar: '🎤 حسناً، تابع الإملاء. قل "انتهيت" عندما تنتهي.',
    darija: '🎤 Wakha, kemmel l-dicté. 9ol "khlas" mli tsali.',
  },
  specify_reason: {
    fr: '✏️ Précise le motif (texte libre) :',
    en: '✏️ Specify the reason (free text):',
    ar: '✏️ حدد السبب (نص حر):',
    darija: '✏️ Wddh sbab (kteb li bghiti) :',
  },
  unknown_action: {
    fr: 'Action non reconnue.',
    en: 'Unknown action.',
    ar: 'إجراء غير معروف.',
    darija: 'Action ma 3reftha.',
  },
  voice_session_saved: {
    fr: '✅ <b>{{inserted}}/{{total}} récolte(s) enregistrée(s)</b>\nDate : {{date}}\nTotal : {{kg}} kg',
    en: '✅ <b>{{inserted}}/{{total}} harvest(s) saved</b>\nDate: {{date}}\nTotal: {{kg}} kg',
    ar: '✅ <b>{{inserted}}/{{total}} محصول تم تسجيله</b>\nالتاريخ: {{date}}\nالمجموع: {{kg}} كغ',
    darija: '✅ <b>{{inserted}}/{{total}} récolte(s) tsajjlou</b>\nNhar : {{date}}\nL-mjmou3 : {{kg}} kg',
  },
  voice_session_open: {
    fr: '🎙️ <b>Session vocale ouverte</b>\n\nDicte tes récoltes une par une OU plusieurs dans le même message.\nExemple : <i>"Cent cinquante kilos sur la serre 1 marquise, et deux quintaux sur la serre 3 cherry"</i>\n\nQuand tu as terminé, dis <b>"fini"</b> ou tape sur le bouton.',
    en: '🎙️ <b>Voice session open</b>\n\nDictate your harvests one by one OR several in the same message.\nExample: <i>"One hundred fifty kilos on greenhouse 1 marquise, and two quintals on greenhouse 3 cherry"</i>\n\nWhen you\'re done, say <b>"done"</b> or tap the button.',
    ar: '🎙️ <b>الجلسة الصوتية مفتوحة</b>\n\nأملِ محاصيلك واحداً تلو الآخر أو عدة في الرسالة نفسها.\nمثال: <i>"مئة وخمسون كيلو على البيت الأول مركيز، ومئتان على البيت الثالث شيري"</i>\n\nعندما تنتهي، قل <b>"انتهيت"</b> أو اضغط الزر.',
    darija: '🎙️ <b>Session vocale me7loula</b>\n\n9ol les récoltes dyalek wahda b wahda WLLA b zaaf f message wahed.\nMital : <i>"Miya w khamsin kilo f serre 1 marquise, w miyatayn f serre 3 cherry"</i>\n\nMli tsali, 9ol <b>"khlas"</b> wlla door 3la l-button.',
  },
  voice_show_recap: {
    fr: '✅ Terminer (afficher récap)',
    en: '✅ Finish (show summary)',
    ar: '✅ إنهاء (عرض الملخص)',
    darija: '✅ Sali (wri-li récap)',
  },
}

/**
 * Récupère une traduction.
 * @param lang langue cible
 * @param key  clé de la traduction
 * @param params remplacement des {{placeholders}}
 */
export function t(lang: string | null | undefined, key: string, params?: Record<string, string | number>): string {
  const L = normalizeLang(lang)
  const entry = T[key]
  if (!entry) {
    console.warn(`[i18n] Missing key: ${key}`)
    return key
  }
  let txt = entry[L] ?? entry.fr
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      txt = txt.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v))
    }
  }
  return txt
}

/**
 * Instructions de langue à injecter dans les prompts Gemini pour qu'il réponde
 * dans la langue de l'utilisateur (transcription + extraction).
 */
export function langInstructionForGemini(lang: string | null | undefined): string {
  const L = normalizeLang(lang)
  switch (L) {
    case 'darija':
      return 'IMPORTANT: Reply in Moroccan Darija using Latin script (Arabizi style: "wakha", "safi", "yallah", "ghadi", numbers in Latin). Keep French loanwords for technical terms (lot, station, marché, variété).'
    case 'ar':
      return 'IMPORTANT: Reply in Modern Standard Arabic (الفصحى).'
    case 'en':
      return 'IMPORTANT: Reply in English.'
    default:
      return 'IMPORTANT: Reply in French.'
  }
}

/** Construit le menu principal traduit. */
export function buildMainMenu(lang: string | null | undefined) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'menu_voice_session'), callback_data: 'menu:voice_session' }],
      [{ text: t(lang, 'menu_harvest'), callback_data: 'menu:harvest' }],
      [{ text: t(lang, 'menu_compose_dispatch'), callback_data: 'menu:compose_dispatch' }],
      [{ text: t(lang, 'menu_tri'), callback_data: 'menu:tri' }],
      [{ text: t(lang, 'menu_confirm_price'), callback_data: 'menu:confirm_price' }],
      [{ text: t(lang, 'menu_no_harvest'), callback_data: 'menu:no_harvest' }],
      [{ text: t(lang, 'menu_my_lots'), callback_data: 'menu:my_lots' }],
      [{ text: t(lang, 'menu_help'), callback_data: 'menu:help' }],
    ],
  }
}

/** Map des labels de raisons (no-harvest) traduits. */
export function reasonLabel(lang: string | null | undefined, reasonKey: string): string {
  const map: Record<string, string> = {
    panne_irrigation: 'reason_panne_irrigation',
    meteo: 'reason_meteo',
    main_oeuvre: 'reason_main_oeuvre',
    maladie: 'reason_maladie',
    maintenance: 'reason_maintenance',
    autre: 'reason_other',
  }
  const k = map[reasonKey]
  return k ? t(lang, k) : reasonKey
}
