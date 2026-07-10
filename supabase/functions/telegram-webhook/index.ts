// ============================================================
// TELEGRAM WEBHOOK — saisie des récoltes par message
// V1 : texte + boutons (récoltes + journées sans récolte)
// V2 : message vocal → Gemini 2.5 Flash (transcription + extraction) → confirmation
//
// Setup :
//   1. Créer un bot via @BotFather → récupérer le BOT_TOKEN
//   2. Définir secrets Supabase :
//        supabase secrets set TELEGRAM_BOT_TOKEN=...
//        supabase secrets set TELEGRAM_WEBHOOK_SECRET=...
//        supabase secrets set GEMINI_API_KEY=...   # déjà fait
//   3. Déployer : supabase functions deploy telegram-webhook --no-verify-jwt
//   4. Configurer le webhook côté Telegram :
//        curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//          -d "url=https://<projet>.supabase.co/functions/v1/telegram-webhook" \
//          -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================
// ═══════ i18n — Traductions multilingues (inline) ══════════
// Langues : fr (Français) | en (English) | ar (عربية فصحى) | darija (دارجة بالحروف العربية)
// ============================================================

type Lang = 'fr' | 'en' | 'ar' | 'darija'

function normalizeLang(raw: string | null | undefined): Lang {
  const v = (raw ?? 'fr').toLowerCase().trim()
  if (v === 'darija' || v === 'darja' || v === 'ma') return 'darija'
  if (v === 'ar' || v === 'arabic' || v === 'arab') return 'ar'
  if (v === 'en' || v === 'english') return 'en'
  return 'fr'
}

type Translations = Record<string, Record<Lang, string>>

const T: Translations = {
  welcome_no_code: {
    fr: '👋 Salam ! Je suis le bot du Domaine BENHALIMA.\n\nPour t\'utiliser, tu dois être inscrit. Demande à ton responsable un <b>code d\'invitation</b>, puis envoie :\n\n<code>/start TONCODE</code>',
    en: '👋 Hi! I\'m the Domaine BENHALIMA bot.\n\nTo use me, you need to be enrolled. Ask your manager for an <b>invitation code</b>, then send:\n\n<code>/start YOURCODE</code>',
    ar: '👋 مرحباً! أنا روبوت ضيعة بنحليمة.\n\nلاستعمالي، يجب أن تكون مُسجَّلاً. اطلب من المسؤول <b>رمز الدعوة</b>، ثم أرسل:\n\n<code>/start كود</code>',
    darija: '👋 سلام ! أنا البوط ديال ضيعة بنحليمة.\n\nباش تخدم معايا، خاصك تكون مسجل. طلب من المسؤول ديالك <b>كود الدعوة</b>، ومن بعد صيفط :\n\n<code>/start الكودديالك</code>',
  },
  enroll_invalid_code: {
    fr: '❌ Code invalide ou expiré. Contacte ton responsable.',
    en: '❌ Invalid or expired code. Contact your manager.',
    ar: '❌ الرمز غير صالح أو منتهي. تواصل مع المسؤول.',
    darija: '❌ الكود خايب ولا تسالا. عيط للمسؤول ديالك.',
  },
  welcome_enrolled: {
    fr: '✅ Bienvenue {{name}} !\nTu peux maintenant enregistrer tes récoltes par message.\n\nQue veux-tu faire ?',
    en: '✅ Welcome {{name}}!\nYou can now log your harvests by message.\n\nWhat would you like to do?',
    ar: '✅ مرحباً بك {{name}}!\nيمكنك الآن تسجيل المحاصيل عبر الرسائل.\n\nماذا تريد أن تفعل؟',
    darija: '✅ مرحبا بيك {{name}} !\nدابا تقدر تسجل المحاصيل ديالك بالمسج.\n\nآش بغيتي تدير ؟',
  },
  menu_voice_session: { fr: '🎙️ Saisie vocale groupée', en: '🎙️ Grouped voice input', ar: '🎙️ إدخال صوتي جماعي', darija: '🎙️ سجل بالصوت على مرة' },
  menu_harvest:        { fr: '📦 Nouvelle récolte', en: '📦 New harvest', ar: '📦 محصول جديد', darija: '📦 ركولت جديدة' },
  menu_compose_dispatch: { fr: '🚚 Composer un envoi station', en: '🚚 Compose station dispatch', ar: '🚚 تجهيز إرسال إلى المحطة', darija: '🚚 صيب شحنة للستاسيون' },
  menu_tri:            { fr: '🔬 Saisir tri (freinte/écart)', en: '🔬 Enter sorting (loss/discard)', ar: '🔬 إدخال الفرز (الفاقد/الانحراف)', darija: '🔬 دخل التري (فرانت/إيكار)' },
  menu_confirm_price:  { fr: '💰 Confirmer un prix', en: '💰 Confirm a price', ar: '💰 تأكيد السعر', darija: '💰 أكد التومان' },
  menu_no_harvest:     { fr: '🚨 Journée sans récolte', en: '🚨 Day without harvest', ar: '🚨 يوم بدون محصول', darija: '🚨 نهار بلا ركولت' },
  menu_my_lots:        { fr: '📊 Mes derniers lots', en: '📊 My latest lots', ar: '📊 آخر دفعاتي', darija: '📊 اللوطاجات ديالي الأخرين' },
  menu_help:           { fr: '❓ Aide', en: '❓ Help', ar: '❓ مساعدة', darija: '❓ مساعدة' },
  no_active_planting:  { fr: '❌ Aucune plantation active trouvée. Contacte le responsable.', en: '❌ No active planting found. Contact your manager.', ar: '❌ لم يتم العثور على زراعة نشطة. تواصل مع المسؤول.', darija: '❌ ما كاينة حتى زراعة خدامة. عيط للمسؤول.' },
  pick_planting:       { fr: '📦 Choisis la plantation :', en: '📦 Choose the planting:', ar: '📦 اختر الزراعة:', darija: '📦 ختار الزراعة :' },
  planting_not_found:  { fr: '❌ Plantation introuvable.', en: '❌ Planting not found.', ar: '❌ الزراعة غير موجودة.', darija: '❌ الزراعة ما لقيتهاش.' },
  ask_quantity:        { fr: '🌿 {{label}}\n\nQuelle quantité (en kg) ? Envoie juste le nombre.', en: '🌿 {{label}}\n\nWhat quantity (in kg)? Just send the number.', ar: '🌿 {{label}}\n\nما الكمية (بالكيلو)؟ أرسل الرقم فقط.', darija: '🌿 {{label}}\n\nشحال د الكيلو ؟ صيفط غير الرقم.' },
  invalid_quantity:    { fr: '❌ Quantité invalide. Envoie juste un nombre, ex: <code>150</code>', en: '❌ Invalid quantity. Just send a number, e.g.: <code>150</code>', ar: '❌ الكمية غير صحيحة. أرسل رقماً فقط، مثال: <code>150</code>', darija: '❌ الكمية ماخدماش. صيفط رقم برك، مثال : <code>150</code>' },
  session_lost:        { fr: '❌ Session perdue. Recommence avec /start', en: '❌ Session lost. Restart with /start', ar: '❌ الجلسة ضاعت. ابدأ من جديد بـ /start', darija: '❌ السيسيون توضرات. عاود بـ /start' },
  harvest_saved:       { fr: '✅ <b>Récolte enregistrée</b>\nLot : <code>{{lot}}</code>\nQté : {{qty}} kg\nDate : {{date}}', en: '✅ <b>Harvest saved</b>\nLot: <code>{{lot}}</code>\nQty: {{qty}} kg\nDate: {{date}}', ar: '✅ <b>تم تسجيل المحصول</b>\nالدفعة: <code>{{lot}}</code>\nالكمية: {{qty}} كغ\nالتاريخ: {{date}}', darija: '✅ <b>الركولت تسجلات</b>\nاللوطاج : <code>{{lot}}</code>\nالكمية : {{qty}} كيلو\nالنهار : {{date}}' },
  error_with_msg:      { fr: '❌ Erreur : {{msg}}', en: '❌ Error: {{msg}}', ar: '❌ خطأ: {{msg}}', darija: '❌ مشكل : {{msg}}' },
  ask_no_harvest_reason: { fr: '🚨 Quelle est la raison ?', en: '🚨 What\'s the reason?', ar: '🚨 ما السبب؟', darija: '🚨 آش علاش ؟' },
  reason_panne_irrigation: { fr: '⚙️ Panne d\'irrigation', en: '⚙️ Irrigation breakdown', ar: '⚙️ عطل في السقي', darija: '⚙️ بان فالسقي' },
  reason_meteo:        { fr: '🌧️ Météo défavorable', en: '🌧️ Bad weather', ar: '🌧️ طقس سيء', darija: '🌧️ الجو ماخدامش' },
  reason_main_oeuvre:  { fr: '👥 Manque de main d\'œuvre', en: '👥 Labor shortage', ar: '👥 نقص في اليد العاملة', darija: '👥 ما كايناش العمال' },
  reason_maladie:      { fr: '🦠 Maladie / phytopathologie', en: '🦠 Disease / phytopathology', ar: '🦠 مرض / علم الأمراض النباتية', darija: '🦠 مرض / فيتوباطولوجي' },
  reason_maintenance:  { fr: '🔧 Maintenance', en: '🔧 Maintenance', ar: '🔧 صيانة', darija: '🔧 صيانة' },
  reason_other:        { fr: '❓ Autre (préciser)', en: '❓ Other (specify)', ar: '❓ سبب آخر (حدد)', darija: '❓ سبب آخر (وضح)' },
  cancel:              { fr: '✖ Annuler', en: '✖ Cancel', ar: '✖ إلغاء', darija: '✖ إلغاء' },
  no_harvest_saved:    { fr: '✅ <b>Journée sans récolte signalée</b>\nDate : {{date}}\nMotif : {{reason}}{{noteLine}}', en: '✅ <b>No-harvest day reported</b>\nDate: {{date}}\nReason: {{reason}}{{noteLine}}', ar: '✅ <b>تم الإبلاغ عن يوم بدون محصول</b>\nالتاريخ: {{date}}\nالسبب: {{reason}}{{noteLine}}', darija: '✅ <b>نهار بلا ركولت تسجل</b>\nالنهار : {{date}}\nالسبب : {{reason}}{{noteLine}}' },
  voice_listening:     { fr: '🎤 J\'écoute…', en: '🎤 Listening…', ar: '🎤 أنا أستمع…', darija: '🎤 كانسمع…' },
  voice_transcription_error: { fr: '❌ Erreur transcription : {{msg}}', en: '❌ Transcription error: {{msg}}', ar: '❌ خطأ في النسخ: {{msg}}', darija: '❌ مشكل فالترانسكريبسيون : {{msg}}' },
  voice_qty_unclear:   { fr: '❌ Quantité non comprise. Réessaye en disant un nombre clairement, ou utilise le clavier.', en: '❌ Quantity not understood. Try again saying a number clearly, or use the keyboard.', ar: '❌ لم أفهم الكمية. حاول مرة أخرى بقول رقم واضح، أو استعمل لوحة المفاتيح.', darija: '❌ مافهمتش الكمية. عاود قول الرقم بوضوح، ولا خدم بالكلافي.' },
  voice_pct_unclear:   { fr: '❌ Pourcentage non compris. Tape un nombre entre 0 et 100, ou utilise les boutons.', en: '❌ Percentage not understood. Type a number between 0 and 100, or use the buttons.', ar: '❌ لم أفهم النسبة. اكتب رقماً بين 0 و 100، أو استعمل الأزرار.', darija: '❌ مافهمتش البورسانتاج. كتب رقم بين 0 و 100، ولا خدم بالبوطون.' },
  voice_price_unclear: { fr: '❌ Prix non compris. Réessaye, ex: <code>8.50</code>.', en: '❌ Price not understood. Try again, e.g.: <code>8.50</code>.', ar: '❌ لم أفهم السعر. حاول مرة أخرى، مثال: <code>8.50</code>.', darija: '❌ مافهمتش التومان. عاود، مثال : <code>8.50</code>.' },
  voice_no_planting:   { fr: '❌ Aucune plantation active. Contacte le responsable.', en: '❌ No active planting. Contact your manager.', ar: '❌ لا توجد زراعة نشطة. تواصل مع المسؤول.', darija: '❌ ما كاينة حتى زراعة خدامة. عيط للمسؤول.' },
  voice_recap_title:   { fr: '📋 <b>Récap de la session vocale</b>', en: '📋 <b>Voice session summary</b>', ar: '📋 <b>ملخص الجلسة الصوتية</b>', darija: '📋 <b>ركاب ديال السيسيون فوكال</b>' },
  voice_recap_total:   { fr: '<b>Total : {{total}} kg</b> sur {{count}} lot(s)\n\nTout est correct ?', en: '<b>Total: {{total}} kg</b> on {{count}} lot(s)\n\nIs everything correct?', ar: '<b>المجموع: {{total}} كغ</b> في {{count}} دفعة\n\nهل كل شيء صحيح؟', darija: '<b>المجموع : {{total}} كيلو</b> على {{count}} لوطاج\n\nكولشي مزيان ؟' },
  voice_save_all:      { fr: '✅ Tout enregistrer', en: '✅ Save all', ar: '✅ حفظ الكل', darija: '✅ سجل كولشي' },
  voice_continue:      { fr: '🔁 Continuer la dictée', en: '🔁 Continue dictating', ar: '🔁 متابعة الإملاء', darija: '🔁 كمل الديكتي' },
  voice_cancel_session:{ fr: '✗ Annuler la session', en: '✗ Cancel session', ar: '✗ إلغاء الجلسة', darija: '✗ إلغاء السيسيون' },
  voice_extracted_unclear: { fr: '🎤 <i>"{{transcription}}"</i>\n\n❓ Je n\'ai pas pu extraire de récolte exploitable. Réessaye en disant clairement <b>quantité, serre et variété</b>.', en: '🎤 <i>"{{transcription}}"</i>\n\n❓ I couldn\'t extract a usable harvest. Try again saying clearly <b>quantity, greenhouse and variety</b>.', ar: '🎤 <i>"{{transcription}}"</i>\n\n❓ لم أستطع استخراج محصول صالح. حاول مرة أخرى بقول <b>الكمية، البيت والصنف</b> بوضوح.', darija: '🎤 <i>"{{transcription}}"</i>\n\n❓ ما قدرتش نخرج ركولت من لي قلتي. عاود قول بوضوح <b>الكمية، السير والصنف</b>.' },
  compose_no_harvest_available: { fr: '❌ Aucune récolte récente avec quantité disponible.', en: '❌ No recent harvest with available quantity.', ar: '❌ لا توجد محاصيل حديثة بكمية متوفرة.', darija: '❌ ما كاينة والو ركولت جديدة عندها كمية ديسبو.' },
  compose_lot_unavailable: { fr: '❌ Lot indisponible.', en: '❌ Lot unavailable.', ar: '❌ الدفعة غير متاحة.', darija: '❌ اللوطاج ما ديسبوش.' },
  compose_lot_already_added: { fr: 'Ce lot est déjà ajouté. Annule via /menu pour recommencer.', en: 'This lot is already added. Cancel via /menu to restart.', ar: 'هذه الدفعة مضافة بالفعل. ألغي عبر /menu للبدء من جديد.', darija: 'اللوطاج داخل ديجا. عاود /menu باش تبدا من جديد.' },
  compose_qty_invalid_or_all: { fr: '❌ Quantité invalide. Envoie un nombre ou <code>tout</code>.', en: '❌ Invalid quantity. Send a number or <code>all</code>.', ar: '❌ الكمية غير صحيحة. أرسل رقماً أو <code>الكل</code>.', darija: '❌ الكمية ماخدماش. صيفط رقم ولا <code>كولو</code>.' },
  compose_qty_exceeds: { fr: '❌ Dépasse le disponible ({{max}}kg max).', en: '❌ Exceeds available ({{max}}kg max).', ar: '❌ تتجاوز المتاح ({{max}}كغ كحد أقصى).', darija: '❌ كتر من لي ديسبو ({{max}} كيلو ماكس).' },
  compose_no_lots:     { fr: '❌ Aucun lot sélectionné.', en: '❌ No lot selected.', ar: '❌ لم يتم اختيار أي دفعة.', darija: '❌ ما ختاريتي والو لوطاج.' },
  compose_no_market:   { fr: '❌ Aucun marché actif.', en: '❌ No active market.', ar: '❌ لا يوجد سوق نشط.', darija: '❌ ما كاين حتى مرشي خدام.' },
  help_text:           { fr: '<b>Comment m\'utiliser :</b>\n\n• Envoie un <b>message vocal</b> en disant les récoltes\n• Ou utilise les <b>boutons</b> du menu\n• <code>/menu</code> pour revenir au menu\n• <code>/cancel</code> pour annuler une action\n\n💬 Tu peux écrire en français, arabe, darija ou anglais — je comprends tout.', en: '<b>How to use me:</b>\n\n• Send a <b>voice message</b> saying your harvests\n• Or use the menu <b>buttons</b>\n• <code>/menu</code> to return to the menu\n• <code>/cancel</code> to cancel an action\n\n💬 You can write in French, Arabic, Darija or English — I understand them all.', ar: '<b>كيفية استعمالي:</b>\n\n• أرسل <b>رسالة صوتية</b> تقول فيها المحاصيل\n• أو استعمل <b>أزرار</b> القائمة\n• <code>/menu</code> للعودة إلى القائمة\n• <code>/cancel</code> لإلغاء عملية\n\n💬 يمكنك الكتابة بالفرنسية، العربية، الدارجة أو الإنجليزية — أفهم كل اللغات.', darija: '<b>كيفاش تخدم معايا :</b>\n\n• صيفط <b>مساج فوكال</b> وقول الركولتات\n• ولا خدم بـ <b>البوطون</b> ديال المنيو\n• <code>/menu</code> باش ترجع للمنيو\n• <code>/cancel</code> باش تلغي أكسيون\n\n💬 تقدر تكتب بالفرنسية، العربية، الدارجة ولا الأنجليزية — كانفهم كولشي.' },
  note_label:          { fr: 'Note', en: 'Note', ar: 'ملاحظة', darija: 'ملاحظة' },
  compose_session_empty: { fr: '❌ Session vide.', en: '❌ Empty session.', ar: '❌ الجلسة فارغة.', darija: '❌ السيسيون خاوية.' },
  compose_no_variety:  { fr: '❌ Récolte {{lot}} sans variété — annulation.', en: '❌ Harvest {{lot}} has no variety — cancelled.', ar: '❌ المحصول {{lot}} بدون صنف — إلغاء.', darija: '❌ الركولت {{lot}} بلا صنف — تلغات.' },
  compose_lot_error:   { fr: '❌ Erreur lot {{idx}} : {{msg}}', en: '❌ Lot {{idx}} error: {{msg}}', ar: '❌ خطأ في الدفعة {{idx}}: {{msg}}', darija: '❌ مشكل فاللوطاج {{idx}} : {{msg}}' },
  tri_nothing_to_sort: { fr: '✅ Aucun envoi en attente de tri.', en: '✅ No dispatch waiting for sorting.', ar: '✅ لا يوجد إرسال بانتظار الفرز.', darija: '✅ ما كاين حتى شحنة كاتستنا التري.' },
  tri_pick_dispatch:   { fr: '🔬 Choisis l\'envoi à trier :', en: '🔬 Choose the dispatch to sort:', ar: '🔬 اختر الإرسال للفرز:', darija: '🔬 ختار الشحنة باش تتريها :' },
  not_found:           { fr: '❌ Introuvable.', en: '❌ Not found.', ar: '❌ غير موجود.', darija: '❌ ما لقيتوش.' },
  invalid_input_pct:   { fr: '❌ Saisie invalide. Nombre entre 0 et 100.', en: '❌ Invalid input. Number between 0 and 100.', ar: '❌ إدخال غير صحيح. رقم بين 0 و 100.', darija: '❌ دخلتي خطأ. رقم بين 0 و 100.' },
  price_pick_dispatch: { fr: '💰 Choisis l\'envoi à tarifer :', en: '💰 Choose the dispatch to price:', ar: '💰 اختر الإرسال لتسعيره:', darija: '💰 ختار الشحنة باش تأكد التومان :' },
  price_invalid:       { fr: '❌ Prix invalide. Tape juste un nombre, ex: <code>8.50</code>', en: '❌ Invalid price. Just type a number, e.g.: <code>8.50</code>', ar: '❌ السعر غير صحيح. اكتب رقماً فقط، مثال: <code>8.50</code>', darija: '❌ التومان ماخدماش. كتب رقم برك، مثال : <code>8.50</code>' },
  my_lots_empty:       { fr: '📊 Aucune récolte sur les 7 derniers jours.', en: '📊 No harvest in the last 7 days.', ar: '📊 لا توجد محاصيل في الأيام السبعة الأخيرة.', darija: '📊 ما كاينة حتى ركولت ف 7 إيام لي فايتين.' },
  my_lots_title:       { fr: '📊 <b>Derniers lots (7j)</b>', en: '📊 <b>Latest lots (7d)</b>', ar: '📊 <b>آخر الدفعات (7 أيام)</b>', darija: '📊 <b>اللوطاجات الأخرين (7 إيام)</b>' },
  cancelled_what_to_do:{ fr: 'Annulé. Que veux-tu faire ?', en: 'Cancelled. What do you want to do?', ar: 'تم الإلغاء. ماذا تريد أن تفعل؟', darija: 'تلغات. آش بغيتي تدير ؟' },
  what_to_do:          { fr: 'Que veux-tu faire ?', en: 'What do you want to do?', ar: 'ماذا تريد أن تفعل؟', darija: 'آش بغيتي تدير ؟' },
  voice_continue_dictating: { fr: '🎤 OK, continue à dicter. Dis "fini" quand tu as terminé.', en: '🎤 OK, keep dictating. Say "done" when finished.', ar: '🎤 حسناً، تابع الإملاء. قل "انتهيت" عندما تنتهي.', darija: '🎤 واخا، كمل الديكتي. قول "خلاص" ملي تسالي.' },
  specify_reason:      { fr: '✏️ Précise le motif (texte libre) :', en: '✏️ Specify the reason (free text):', ar: '✏️ حدد السبب (نص حر):', darija: '✏️ وضح السبب (كتب لي بغيتي) :' },
  unknown_action:      { fr: 'Action non reconnue.', en: 'Unknown action.', ar: 'إجراء غير معروف.', darija: 'الأكسيون ما عرفتهاش.' },
  ask_destination_rejet: { fr: 'Que faire de ce rejet ?', en: 'What to do with this reject?', ar: 'ماذا نفعل بهذا الفاقد؟', darija: 'آش ندير بهاد الرجاي ?' },
  dest_destruction:    { fr: 'Destruction (perte)', en: 'Destroyed (loss)', ar: 'إتلاف (خسارة)', darija: 'كحلتو (خسارة)' },
  dest_retour_stock:   { fr: 'Retour stock (autre marché)', en: 'Return to stock (other market)', ar: 'إرجاع للمخزون (سوق آخر)', darija: 'رجعو للستوك (مرشي آخور)' },
  dest_vente_industrie:{ fr: 'Vente industrie (prix réduit)', en: 'Industrial sale (reduced price)', ar: 'بيع للصناعة (سعر مخفض)', darija: 'بيعو ل-industrie (تومان قليل)' },
  dest_dons:           { fr: 'Dons / banque alimentaire', en: 'Donation / food bank', ar: 'تبرع / بنك الغذاء', darija: 'تبرع / بنك الماكلة' },
  voice_session_saved: { fr: '✅ <b>{{inserted}}/{{total}} récolte(s) enregistrée(s)</b>\nDate : {{date}}\nTotal : {{kg}} kg', en: '✅ <b>{{inserted}}/{{total}} harvest(s) saved</b>\nDate: {{date}}\nTotal: {{kg}} kg', ar: '✅ <b>{{inserted}}/{{total}} محصول تم تسجيله</b>\nالتاريخ: {{date}}\nالمجموع: {{kg}} كغ', darija: '✅ <b>{{inserted}}/{{total}} ركولت تسجلوا</b>\nالنهار : {{date}}\nالمجموع : {{kg}} كيلو' },
  voice_session_open:  { fr: '🎙️ <b>Session vocale ouverte</b>\n\nDicte tes récoltes une par une OU plusieurs dans le même message.\nExemple : <i>"Cent cinquante kilos sur la serre 1 marquise, et deux quintaux sur la serre 3 cherry"</i>\n\nQuand tu as terminé, dis <b>"fini"</b> ou tape sur le bouton.', en: '🎙️ <b>Voice session open</b>\n\nDictate your harvests one by one OR several in the same message.\nExample: <i>"One hundred fifty kilos on greenhouse 1 marquise, and two quintals on greenhouse 3 cherry"</i>\n\nWhen you\'re done, say <b>"done"</b> or tap the button.', ar: '🎙️ <b>الجلسة الصوتية مفتوحة</b>\n\nأملِ محاصيلك واحداً تلو الآخر أو عدة في الرسالة نفسها.\nمثال: <i>"مئة وخمسون كيلو على البيت الأول مركيز، ومئتان على البيت الثالث شيري"</i>\n\nعندما تنتهي، قل <b>"انتهيت"</b> أو اضغط الزر.', darija: '🎙️ <b>السيسيون فوكال محلولة</b>\n\nقول الركولتات ديالك وحدة بوحدة ولا بزاف ف مساج واحد.\nمثال : <i>"مية و خمسين كيلو ف السير 1 مركيز، و ميتاين ف السير 3 شيري"</i>\n\nملي تسالي، قول <b>"خلاص"</b> ولا دور على البوطون.' },
  voice_show_recap:    { fr: '✅ Terminer (afficher récap)', en: '✅ Finish (show summary)', ar: '✅ إنهاء (عرض الملخص)', darija: '✅ سالي (وريلي ركاب)' },
  voice_partial_error: { fr: '⚠️ <b>{{ok}}/{{total}} récolte(s) enregistrée(s)</b>\nLes autres ont été refusées :\n{{reasons}}', en: '⚠️ <b>{{ok}}/{{total}} harvest(s) saved</b>\nThe others were rejected:\n{{reasons}}', ar: '⚠️ <b>{{ok}}/{{total}} محصول تم تسجيله</b>\nالباقي مرفوض:\n{{reasons}}', darija: '⚠️ <b>{{ok}}/{{total}} ركولت تسجلات</b>\nالباقي متردات :\n{{reasons}}' },
  // ─── Récolte en plateaux (Lot 3) ───
  pick_tray_type:      { fr: '📦 Choisis un type de plateau (puis dis combien).', en: '📦 Choose a tray type (then how many).', ar: '📦 اختر نوع الصندوق (ثم كم عددها).', darija: '📦 ختار نوع د البلاطو (ومن بعد شحال).' },
  ask_tray_count:      { fr: '🔢 Combien de « {{label}} » ({{poids}} kg/plateau) ? Envoie juste le nombre.', en: '🔢 How many "{{label}}" ({{poids}} kg each)? Just send the number.', ar: '🔢 كم عدد « {{label}} » ({{poids}} كغ للواحد)؟ أرسل الرقم فقط.', darija: '🔢 شحال د « {{label}} » ({{poids}} كيلو للواحد) ؟ صيفط غير الرقم.' },
  invalid_tray_count:  { fr: '❌ Nombre invalide. Envoie un entier, ex : <code>12</code>', en: '❌ Invalid number. Send a whole number, e.g.: <code>12</code>', ar: '❌ العدد غير صحيح. أرسل رقماً صحيحاً، مثال: <code>12</code>', darija: '❌ العدد ماخدماش. صيفط رقم صحيح، مثال : <code>12</code>' },
  tray_line_added:     { fr: '➕ Ajouté : {{nb}} × {{label}}', en: '➕ Added: {{nb}} × {{label}}', ar: '➕ أُضيف: {{nb}} × {{label}}', darija: '➕ تزاد : {{nb}} × {{label}}' },
  tray_total:          { fr: '<b>Total estimé : {{total}} kg</b>', en: '<b>Estimated total: {{total}} kg</b>', ar: '<b>المجموع التقديري: {{total}} كغ</b>', darija: '<b>المجموع تقديري : {{total}} كيلو</b>' },
  trays_done_btn:      { fr: '✅ Terminer & enregistrer', en: '✅ Finish & save', ar: '✅ إنهاء وحفظ', darija: '✅ سالي و سجل' },
  trays_empty:         { fr: '❌ Aucun plateau saisi. Ajoute au moins un type.', en: '❌ No tray entered. Add at least one type.', ar: '❌ لم تُدخل أي صندوق. أضف نوعاً واحداً على الأقل.', darija: '❌ ما دخلتي حتى بلاطو. زيد على الأقل نوع واحد.' },
  harvest_saved_est:   { fr: '✅ <b>Récolte enregistrée (plateaux)</b>\nLot : <code>{{lot}}</code>\nPoids estimé : {{qty}} kg\nDate : {{date}}\n\n⚖️ Le poids réel sera confirmé à la pesée station.', en: '✅ <b>Harvest saved (trays)</b>\nLot: <code>{{lot}}</code>\nEstimated weight: {{qty}} kg\nDate: {{date}}\n\n⚖️ Real weight will be confirmed at station weighing.', ar: '✅ <b>تم تسجيل المحصول (صناديق)</b>\nالدفعة: <code>{{lot}}</code>\nالوزن التقديري: {{qty}} كغ\nالتاريخ: {{date}}\n\n⚖️ سيتم تأكيد الوزن الحقيقي عند وزن المحطة.', darija: '✅ <b>الركولت تسجلات (بلاطوات)</b>\nاللوطاج : <code>{{lot}}</code>\nالوزن تقديري : {{qty}} كيلو\nالنهار : {{date}}\n\n⚖️ الوزن الحقيقي غادي يتأكد فالبيصاج ديال الستاسيون.' },
}

function t(lang: string | null | undefined, key: string, params?: Record<string, string | number>): string {
  const L = normalizeLang(lang)
  const entry = T[key]
  if (!entry) { console.warn(`[i18n] Missing key: ${key}`); return key }
  let txt = entry[L] ?? entry.fr
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      txt = txt.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v))
    }
  }
  return txt
}

function langInstructionForGemini(lang: string | null | undefined): string {
  const L = normalizeLang(lang)
  switch (L) {
    case 'darija': return 'IMPORTANT: Reply in Moroccan Darija using ARABIC SCRIPT (NOT Latin/Arabizi). Use natural Moroccan dialect words written in Arabic letters: واخا، صافي، خلاص، باش، ديالك، عيط، بغيتي، شحال، كاين، دابا. Numbers in Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) OR Western digits both acceptable. Keep technical French loanwords transliterated to Arabic if natural (ستاسيون، لوطاج، فرانت) or in Latin/French if commonly written that way.'
    case 'ar':     return 'IMPORTANT: Reply in Modern Standard Arabic (الفصحى).'
    case 'en':     return 'IMPORTANT: Reply in English.'
    default:       return 'IMPORTANT: Reply in French.'
  }
}

function buildMainMenu(lang: string | null | undefined) {
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

function reasonLabel(lang: string | null | undefined, reasonKey: string): string {
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

// ════════════════ Fin du module i18n inline ════════════════

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

// ─── Helpers Voice / Gemini ──────────────────────────────────

/** Télécharge un fichier audio Telegram et retourne base64 + mime. */
async function downloadTelegramAudio(fileId: string): Promise<{ data: string; mime: string }> {
  const fileInfo = await fetch(`${TG_API}/getFile?file_id=${fileId}`).then(r => r.json())
  if (!fileInfo.ok) throw new Error('Telegram getFile failed: ' + JSON.stringify(fileInfo))
  const filePath = fileInfo.result.file_path
  const r = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`)
  if (!r.ok) throw new Error('Telegram audio download failed: ' + r.status)
  const buf = await r.arrayBuffer()
  // Encode base64 (Deno-safe pour fichiers <20MB)
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
  }
  return { data: btoa(binary), mime: 'audio/ogg' }
}

/** Transcription simple d'un audio en texte (pour les flows non-harvest).
 *  La transcription reste fidèle à la langue parlée (FR/AR/Darija/EN sont tous gérés). */
async function transcribeAudioOnly(audioB64: string, mime: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY non configurée')
  const body = {
    contents: [{
      parts: [
        { text: 'Transcris exactement ce que dit cette personne. Le locuteur peut parler en français, darija marocaine, arabe classique ou anglais. Garde la langue d\'origine. Pour la darija, utilise OBLIGATOIREMENT l\'alphabet arabe (الحروف العربية), pas la translittération latine. Exemples : واخا، صافي، خلاص، باش. Réponds UNIQUEMENT avec la transcription, sans explication ni formattage.' },
        { inline_data: { mime_type: mime, data: audioB64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
  }
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']
  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const j = await r.json()
      if (!r.ok || j.error) continue
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (text) return text
    } catch {}
  }
  throw new Error('Transcription Gemini échouée')
}

/** Convertit un texte FR (chiffres ou mots) en nombre. Ex: "cinq" → 5, "deux cents" → 200,
 *  "huit cinquante" → 850 (interprété comme un nombre composé), "8,50" → 8.5. */
function parseNumberFromText(text: string): number | null {
  const lower = text.toLowerCase().trim()
  // 1) Recherche directe d'un nombre avec décimales (priorité)
  const m = lower.match(/(\d+(?:[.,]\d+)?)/)
  if (m) {
    const v = Number(m[1].replace(',', '.'))
    if (Number.isFinite(v)) return v
  }
  // 2) Composition mots-nombres FR (gère 0-9999)
  const units: Record<string, number> = {
    'zero': 0, 'zéro': 0, 'un': 1, 'une': 1, 'deux': 2, 'trois': 3,
    'quatre': 4, 'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9,
    'dix': 10, 'onze': 11, 'douze': 12, 'treize': 13, 'quatorze': 14,
    'quinze': 15, 'seize': 16,
  }
  const tens: Record<string, number> = {
    'vingt': 20, 'trente': 30, 'quarante': 40, 'cinquante': 50,
    'soixante': 60, 'soixante-dix': 70, 'septante': 70,
    'quatre-vingt': 80, 'quatre-vingts': 80, 'huitante': 80, 'octante': 80,
    'quatre-vingt-dix': 90, 'nonante': 90,
  }
  // Tokenize: split sur espaces et tirets
  const tokens = lower.replace(/[,;.]/g, ' ').split(/[\s\-]+/).filter(Boolean)
  let total = 0
  let group = 0   // accumulateur < 1000 en cours
  let saw = false
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    // "et" est un connecteur, on ignore
    if (t === 'et') continue
    if (t === 'cent' || t === 'cents') {
      group = (group === 0 ? 1 : group) * 100
      saw = true; continue
    }
    if (t === 'mille' || t === 'milles') {
      total += (group === 0 ? 1 : group) * 1000
      group = 0
      saw = true; continue
    }
    if (units[t] !== undefined) { group += units[t]; saw = true; continue }
    if (tens[t] !== undefined) { group += tens[t]; saw = true; continue }
    // mot non reconnu → on ignore
  }
  if (saw) return total + group
  return null
}

/** Type d'extraction conversationnelle (V3 : multi-récoltes + intention de fin).
 *  V4 : saisie en PLATEAUX (nb_trays + poids/plateau). qty_kg = fallback si
 *  l'ouvrier dicte un poids total direct au lieu de compter des plateaux. */
type ExtractedHarvest = {
  planting_id: string | null
  nb_trays: number | null       // nombre de plateaux comptés
  tray_poids_kg: number | null  // poids/plateau mentionné (ex. « de 25 » → 25)
  qty_kg: number | null         // fallback : poids total dicté directement en kg
  notes: string | null
}
type VoiceExtraction = {
  transcription: string
  intent: 'harvest' | 'no_harvest' | 'done' | 'unknown'
  harvests: ExtractedHarvest[]
  reply_hint: string | null   // suggestion de réponse en français pour le bot
  confidence: number
}

/** Envoie l'audio à Gemini 2.5 Flash : transcription + extraction structurée (V3 conversationnel).
 *  La langue de l'ouvrier (FR/EN/AR/Darija) est passée pour adapter le reply_hint. */
async function transcribeAndExtract(audioB64: string, mime: string, plantings: any[], pendingCount: number = 0, userLang: string = 'fr', trayTypes: Array<{ code: string; label: string; poids: number }> = []): Promise<VoiceExtraction & {
  // legacy fields pour compat V2 single-harvest
  planting_id: string | null
  qty_kg: number | null
  notes: string | null
}> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY non configurée')

  const plantingsList = plantings.map((p: any) => {
    const ferme = p.greenhouses?.farms?.code ?? '?'
    const serre = p.greenhouses?.code ?? '?'
    const variete = p.varieties?.code ?? '?'
    const nom = p.varieties?.commercial_name ?? '?'
    return `- planting_id="${p.id}" — ferme=${ferme}, serre=${serre}, variété=${variete} (${nom})`
  }).join('\n')

  const trayList = trayTypes.length > 0
    ? trayTypes.map(ty => `- ${ty.label} → poids/plateau = ${ty.poids} kg`).join('\n')
    : '(aucun type de plateau configuré)'

  const sessionContext = pendingCount > 0
    ? `\n\nL'ouvrier est dans une session de saisie groupée et a déjà dicté ${pendingCount} récolte(s). Il peut en ajouter d'autres OU dire qu'il a terminé.`
    : ''

  const langInstruction = langInstructionForGemini(userLang)

  const prompt = `Tu es l'assistant vocal d'une ferme au Maroc. Un ouvrier dicte ses récoltes en français, darija marocaine, arabe classique ou anglais. Au champ, l'ouvrier compte des PLATEAUX (contenants), pas des kilos. Ton rôle : transcrire fidèlement, extraire UNE OU PLUSIEURS récoltes du même message, ou détecter la fin de saisie.${sessionContext}

${langInstruction}

PLANTATIONS ACTIVES :
${plantingsList}

TYPES DE PLATEAUX (contenants) :
${trayList}

INSTRUCTIONS :
1. Transcris exactement ce que dit l'ouvrier dans sa langue d'origine. Pour la darija marocaine ET pour l'arabe classique, utilise OBLIGATOIREMENT l'alphabet arabe (الحروف العربية), JAMAIS la translittération latine.
2. Détermine intent :
   - "harvest" : il annonce 1+ récolte(s) (plateaux ou poids + serre/variété)
   - "no_harvest" : il signale qu'il n'y a pas de récolte (panne, maladie, météo, etc.)
   - "done" : il signale qu'il a terminé sa saisie. Mots clés multilingues :
     · FR : "fini", "c'est tout", "voilà", "termine", "j'ai terminé", "rien d'autre", "non c'est tout"
     · Darija (arabe) : "خلاص", "صافي", "بركة الله", "واخا هاداك الشي", "غير هادي"
     · Arabe classique : "انتهيت", "هذا كل شيء", "خلاص"
     · EN : "done", "that's all", "finished", "nothing else"
   - "unknown" : ambigu ou pas exploitable
3. Si "harvest" : remplis le tableau "harvests" avec autant d'éléments que de récoltes mentionnées (le message peut en contenir plusieurs : "10 plateaux sur S1 marquise et 5 caisses sur S3 cherry").
   - planting_id : matche serre + variété aux plantations actives
   - PRIORITÉ AUX PLATEAUX. Si l'ouvrier compte des plateaux / plateau / caisses / cageots / cagettes / paniers (darija : "طبلية", "طبالي", "كيسة", "قفة", "بلاطو") :
     · nb_trays : le NOMBRE de plateaux (ex. "dix plateaux" = 10, "عشر طبالي" = 10)
     · tray_poids_kg : le poids/plateau SEULEMENT s'il est mentionné (ex. "plateaux de 25" = 25 ; "caisse de vingt" = 20). Sinon null (le système prendra le type par défaut).
     · qty_kg : null
   - SINON, s'il dicte un POIDS TOTAL direct en kilos/quintaux SANS parler de plateaux :
     · qty_kg : le poids ("cent cinquante" = 150, "deux quintaux" = 200 ; darija "مية" = 100, "ميتين" = 200)
     · nb_trays : null, tray_poids_kg : null
   - notes : observations qualitatives (variété, déchets, etc.)
4. reply_hint : une réponse courte ADAPTÉE À LA LANGUE DE L'UTILISATEUR. Exemples :
   · FR après acquittement : "Noté ! D'autres récoltes ?"
   · Darija (en lettres arabes) après acquittement : "واخا ! ركولتات أخرين ؟"
   · AR après acquittement : "تم! محاصيل أخرى؟"
   · EN après acquittement : "Got it! Other harvests?"
5. confidence : ta confiance entre 0 et 1.`

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mime, data: audioB64 } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          transcription: { type: 'string' },
          intent: { type: 'string', enum: ['harvest', 'no_harvest', 'done', 'unknown'] },
          harvests: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                planting_id: { type: 'string', nullable: true },
                nb_trays: { type: 'number', nullable: true },
                tray_poids_kg: { type: 'number', nullable: true },
                qty_kg: { type: 'number', nullable: true },
                notes: { type: 'string', nullable: true },
              },
            },
          },
          reply_hint: { type: 'string', nullable: true },
          confidence: { type: 'number' },
        },
        required: ['transcription', 'intent', 'harvests', 'confidence'],
      },
      temperature: 0.2,
    },
  }

  // Tente plusieurs modèles en cascade (tolérance aux changements de quota)
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']
  let lastErr: any = null
  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const j = await r.json()
      if (!r.ok || j.error) { lastErr = j.error ?? j; continue }
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) { lastErr = 'no text in response'; continue }
      const raw = JSON.parse(text)
      // Normalise + ajoute les champs legacy (1ère récolte, pour compat V2 callers)
      const harvests = Array.isArray(raw.harvests) ? raw.harvests : []
      const first = harvests[0] ?? {}
      return {
        transcription: raw.transcription ?? '',
        intent: raw.intent ?? 'unknown',
        harvests,
        reply_hint: raw.reply_hint ?? null,
        confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
        // legacy
        planting_id: first.planting_id ?? null,
        qty_kg: first.qty_kg ?? null,
        notes: first.notes ?? null,
      }
    } catch (e) { lastErr = e }
  }
  throw new Error('Gemini failed for all models: ' + JSON.stringify(lastErr))
}

// ─── Helpers Telegram ────────────────────────────────────────
async function sendMessage(chatId: number | string, text: string, replyMarkup?: any) {
  const r = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    }),
  })
  return r.json()
}

async function answerCallbackQuery(callbackId: string, text?: string) {
  return fetch(`${TG_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  })
}

// Boutons inline (fallback FR — utilisé seulement quand on n'a pas le contexte user.
// Préférer buildMainMenu(user.language) dès qu'on a accès au user enrôlé).
const mainMenuKeyboard = buildMainMenu('fr')

// ─── Logging des messages ────────────────────────────────────
async function logMessage(opts: {
  chatbot_user_id: string | null
  direction: 'in' | 'out'
  content: string
  intent?: string
  parsed_data?: any
  created_harvest_id?: string
  created_alert_id?: string
  raw_update?: any
}) {
  await supabase.from('chatbot_messages').insert({
    chatbot_user_id: opts.chatbot_user_id,
    direction: opts.direction,
    content: opts.content,
    intent: opts.intent,
    parsed_data: opts.parsed_data,
    created_harvest_id: opts.created_harvest_id,
    created_alert_id: opts.created_alert_id,
    raw_update: opts.raw_update,
  })
}

// ─── Handlers ────────────────────────────────────────────────

/** /start [code] : enrôle l'utilisateur si code valide, sinon affiche aide. */
async function handleStart(chatId: string, args: string[], from: any): Promise<string> {
  const code = args[0]?.trim().toUpperCase()
  if (code) {
    // Cherche un chatbot_user pré-créé avec ce code
    const { data: pending } = await supabase
      .from('chatbot_users').select('*, workers(first_name, last_name, matricule)')
      .eq('enrollment_code', code)
      .gt('enrollment_code_expires_at', new Date().toISOString())
      .maybeSingle()

    if (!pending) {
      // Code invalide → on n'a pas la langue du user, fallback FR
      await sendMessage(chatId, t('fr', 'enroll_invalid_code'))
      return 'enroll_failed'
    }

    const lang = normalizeLang((pending as any).language)
    const w: any = pending.workers
    const greet = w ? `${w.first_name} ${w.last_name}` : ''

    await supabase.from('chatbot_users').update({
      channel_user_id: chatId,
      channel_username: from.username ?? null,
      enrolled_at: new Date().toISOString(),
      enrollment_code: null,
      enrollment_code_expires_at: null,
      session_state: {},
    }).eq('id', pending.id)

    await sendMessage(chatId,
      t(lang, 'welcome_enrolled', { name: greet }),
      buildMainMenu(lang)
    )
    return 'enroll_success'
  }
  // Pas de code → on ne connaît pas la langue, on envoie en FR (défaut)
  await sendMessage(chatId, t('fr', 'welcome_no_code'))
  return 'enroll_request'
}

/** Identifie l'utilisateur authentifié (déjà enrôlé). La langue est normalisée. */
async function authUser(chatId: string) {
  const { data } = await supabase.from('chatbot_users')
    .select('*, workers(*)')
    .eq('channel', 'telegram')
    .eq('channel_user_id', chatId)
    .maybeSingle()
  if (data) {
    // Normalise la langue à 'fr' | 'en' | 'ar' | 'darija' pour tous les handlers
    ;(data as any).language = normalizeLang((data as any).language)
  }
  return data
}

/** Met à jour l'état conversationnel + last_message_at. */
async function updateSession(userId: string, state: any) {
  await supabase.from('chatbot_users').update({
    session_state: state,
    last_message_at: new Date().toISOString(),
  }).eq('id', userId)
}

/** Liste les plantings actifs (dernières 20) + ferme. */
async function listPlantings() {
  const { data } = await supabase.from('campaign_plantings')
    .select('id, planted_area, campaigns(code, name), greenhouses(code, name, farms(code, name)), varieties(code, commercial_name)')
    .order('planting_date', { ascending: false })
    .limit(20)
  return data ?? []
}

/** Démarre le flow "nouvelle récolte". */
async function startHarvestFlow(user: any) {
  const lang = user.language
  const plantings = await listPlantings()
  if (plantings.length === 0) {
    await sendMessage(user.channel_user_id, t(lang, 'no_active_planting'))
    return
  }
  await updateSession(user.id, { intent: 'new_harvest', step: 'pick_planting' })
  const buttons = plantings.map((p: any) => ([{
    text: `${p.greenhouses?.code ?? '?'} — ${p.varieties?.code ?? '?'}`,
    callback_data: `harvest:planting:${p.id}`,
  }]))
  buttons.push([{ text: t(lang, 'cancel'), callback_data: 'cancel' }])
  await sendMessage(user.channel_user_id, t(lang, 'pick_planting'), { inline_keyboard: buttons })
}

/** Liste les types de plateaux actifs (référentiel no-code 'tray_type').
 *  Le poids théorique est dans metadata.poids_kg (cf. migration 054). */
type TrayType = { code: string; label: string; poids: number; is_default: boolean }
async function listTrayTypes(): Promise<TrayType[]> {
  const { data } = await supabase.from('reference_values')
    .select('code, label, metadata, order_idx, is_active, is_default')
    .eq('list_key', 'tray_type')
    .eq('is_active', true)
    .order('order_idx', { ascending: true })
  return (data ?? []).map((v: any) => ({
    code: v.code,
    label: v.label ?? v.code,
    poids: Number(v?.metadata?.poids_kg) || 0,
    is_default: v.is_default === true,
  }))
}

/** Résout le type de plateau dicté vocalement : par poids mentionné (le plus proche),
 *  sinon le type par défaut (is_default), sinon le premier. Retourne null si aucun type. */
function resolveTrayType(types: TrayType[], poidsHint: number | null): TrayType | null {
  if (types.length === 0) return null
  if (poidsHint && poidsHint > 0) {
    // Match exact d'abord, sinon le poids le plus proche
    const exact = types.find(t => t.poids === poidsHint)
    if (exact) return exact
    return types.slice().sort((a, b) => Math.abs(a.poids - poidsHint) - Math.abs(b.poids - poidsHint))[0]
  }
  return types.find(t => t.is_default) ?? types[0]
}

/** Total estimé (kg) des lignes de plateaux accumulées en session. */
function trayLinesTotal(lines: any[]): number {
  return (Array.isArray(lines) ? lines : [])
    .reduce((s, l) => s + (Number(l?.nb) || 0) * (Number(l?.poids) || 0), 0)
}

/** Ré-affiche le menu des types de plateaux + récap courant + bouton Terminer.
 *  Lit `user.session_state.tray_lines` (doit être à jour localement). */
async function showTrayMenu(user: any, note?: string) {
  const lang = user.language
  const state = (user.session_state ?? {}) as any
  const lines = Array.isArray(state.tray_lines) ? state.tray_lines : []
  const types = await listTrayTypes()
  const buttons = types.map((ty) => ([{
    text: `${ty.label}`,
    callback_data: `harvest:tray:${ty.code}`,
  }]))
  if (lines.length > 0) {
    buttons.push([{ text: t(lang, 'trays_done_btn'), callback_data: 'harvest:trays_done' }])
  }
  buttons.push([{ text: t(lang, 'cancel'), callback_data: 'cancel' }])

  let recap = ''
  if (lines.length > 0) {
    const rows = lines.map((l: any) =>
      `• ${Number(l.nb)} × ${l.label} = ${(Number(l.nb) || 0) * (Number(l.poids) || 0)} kg`).join('\n')
    recap = `${rows}\n${t(lang, 'tray_total', { total: trayLinesTotal(lines) })}\n\n`
  }
  const msg = `${note ? note + '\n\n' : ''}${recap}${t(lang, 'pick_tray_type')}`
  await sendMessage(user.channel_user_id, msg, { inline_keyboard: buttons })
}

/** Continue le flow récolte après choix planting.
 *  Réalité terrain : le caporal compte des PLATEAUX (pas des kg). On saisit
 *  type + nombre → poids estimé (Lot 3, cohérent avec le web Lot 1).
 *  Si aucun type de plateau n'est configuré, on retombe sur la saisie kg. */
async function continueHarvestPickPlanting(user: any, plantingId: string) {
  const lang = user.language
  const { data: planting } = await supabase.from('campaign_plantings')
    .select('id, campaigns(name), greenhouses(code, name), varieties(code, commercial_name)')
    .eq('id', plantingId)
    .maybeSingle()
  if (!planting) {
    await sendMessage(user.channel_user_id, t(lang, 'planting_not_found'))
    return
  }
  const p: any = planting
  const label = `${p.greenhouses?.code} / ${p.varieties?.commercial_name}`

  const types = await listTrayTypes()
  if (types.length === 0) {
    // Fallback : aucun type de plateau configuré → saisie directe en kg (legacy).
    await updateSession(user.id, { intent: 'new_harvest', step: 'ask_qty', planting_id: plantingId })
    await sendMessage(user.channel_user_id, t(lang, 'ask_quantity', { label }))
    return
  }

  const newState = {
    intent: 'new_harvest', step: 'pick_tray',
    planting_id: plantingId, planting_label: label, tray_lines: [],
  }
  await updateSession(user.id, newState)
  user.session_state = newState   // miroir local pour showTrayMenu
  await showTrayMenu(user, `🌿 ${label}`)
}

/** L'utilisateur a choisi un type de plateau → on demande le nombre. */
async function continueHarvestPickTray(user: any, code: string) {
  const lang = user.language
  const state = (user.session_state ?? {}) as any
  if (state.intent !== 'new_harvest') {
    await sendMessage(user.channel_user_id, t(lang, 'session_lost'))
    return
  }
  const types = await listTrayTypes()
  const ty = types.find((x) => x.code === code)
  if (!ty) {
    await sendMessage(user.channel_user_id, t(lang, 'not_found'))
    return
  }
  const newState = { ...state, step: 'ask_tray_count', current_tray: ty }
  await updateSession(user.id, newState)
  user.session_state = newState
  await sendMessage(user.channel_user_id, t(lang, 'ask_tray_count', { label: ty.label, poids: ty.poids }))
}

/** Reçoit le nombre de plateaux pour le type courant → ajoute la ligne, ré-affiche le menu. */
async function continueHarvestSaveTrayCount(user: any, text: string) {
  const lang = user.language
  const state = (user.session_state ?? {}) as any
  const ty = state.current_tray
  if (!ty) {
    await sendMessage(user.channel_user_id, t(lang, 'session_lost'))
    return
  }
  const nb = Math.floor(Number(String(text).replace(',', '.').replace(/[^\d.]/g, '')))
  if (!Number.isFinite(nb) || nb <= 0) {
    await sendMessage(user.channel_user_id, t(lang, 'invalid_tray_count'))
    return
  }
  const lines = Array.isArray(state.tray_lines) ? state.tray_lines.slice() : []
  // Fusionne si le même type est déjà présent
  const existing = lines.find((l: any) => l.code === ty.code)
  if (existing) existing.nb = (Number(existing.nb) || 0) + nb
  else lines.push({ code: ty.code, label: ty.label, poids: ty.poids, nb })

  const newState = { ...state, step: 'pick_tray', tray_lines: lines, current_tray: null }
  await updateSession(user.id, newState)
  user.session_state = newState
  await showTrayMenu(user, t(lang, 'tray_line_added', { nb, label: ty.label }))
}

/** Finalise : calcule le poids estimé, crée la récolte + les lignes de plateaux. */
async function continueHarvestSaveTrays(user: any) {
  const lang = user.language
  const state = (user.session_state ?? {}) as any
  const plantingId = state.planting_id
  const lines = Array.isArray(state.tray_lines) ? state.tray_lines : []
  if (!plantingId) {
    await sendMessage(user.channel_user_id, t(lang, 'session_lost'))
    return null
  }
  if (lines.length === 0) {
    await sendMessage(user.channel_user_id, t(lang, 'trays_empty'))
    return null
  }
  const estimated = trayLinesTotal(lines)
  const today = new Date().toISOString().slice(0, 10)
  const lot = `LOT-${today.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
  const workerName = `${user.workers?.first_name ?? '?'} ${user.workers?.last_name ?? ''}`.trim()

  const { data: harvest, error } = await supabase.from('harvests').insert({
    campaign_planting_id: plantingId,
    harvest_date: today,
    estimated_kg: estimated,
    qty_category_1: estimated,        // pont : source de vérité avant pesée station (cf. web Lot 1)
    qty_category_2: 0, qty_category_3: 0, qty_waste: 0,
    lot_number: lot,
    recorded_by_name: workerName,
    notes: `Saisie via Telegram (plateaux) par ${workerName}`,
  }).select('id, lot_number').single()

  if (error) {
    await sendMessage(user.channel_user_id, t(lang, 'error_with_msg', { msg: error.message }))
    return null
  }

  // Lignes de plateaux (snapshot type + poids théorique figé)
  const rows = lines.map((l: any) => ({
    harvest_id: harvest!.id,
    tray_type_code: l.code,
    tray_type_label: l.label,
    nb_trays: Number(l.nb),
    poids_unitaire_kg: Number(l.poids),
  }))
  const { error: e2 } = await supabase.from('harvest_tray_lines').insert(rows)
  if (e2) console.error('[harvest-trays] tray lines insert error:', e2.message)

  await updateSession(user.id, {})
  user.session_state = {}
  await sendMessage(user.channel_user_id,
    t(lang, 'harvest_saved_est', { lot: harvest!.lot_number, qty: String(estimated), date: today }),
    buildMainMenu(lang)
  )
  return harvest!.id
}

/** Reçoit la quantité, crée la récolte. */
async function continueHarvestSaveQty(user: any, text: string) {
  const lang = user.language
  const qty = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(qty) || qty <= 0) {
    await sendMessage(user.channel_user_id, t(lang, 'invalid_quantity'))
    return null
  }
  const plantingId = user.session_state?.planting_id
  if (!plantingId) {
    await sendMessage(user.channel_user_id, t(lang, 'session_lost'))
    return null
  }
  // Création de la récolte
  const today = new Date().toISOString().slice(0, 10)
  const lot = `LOT-${today.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
  const { data: harvest, error } = await supabase.from('harvests').insert({
    campaign_planting_id: plantingId,
    harvest_date: today,
    qty_category_1: qty,
    qty_category_2: 0, qty_category_3: 0, qty_waste: 0,
    lot_number: lot,
    notes: `Saisie via Telegram par ${user.workers?.first_name ?? '?'} ${user.workers?.last_name ?? ''}`,
  }).select('id, lot_number').single()

  if (error) {
    await sendMessage(user.channel_user_id, t(lang, 'error_with_msg', { msg: error.message }))
    return null
  }
  // Reset session
  await updateSession(user.id, {})
  await sendMessage(user.channel_user_id,
    t(lang, 'harvest_saved', { lot: harvest!.lot_number, qty: String(qty), date: today }),
    buildMainMenu(lang)
  )
  return harvest!.id
}

/** Démarre flow "journée sans récolte". */
async function startNoHarvestFlow(user: any) {
  const lang = user.language
  await updateSession(user.id, { intent: 'no_harvest', step: 'pick_reason' })
  await sendMessage(user.channel_user_id, t(lang, 'ask_no_harvest_reason'), {
    inline_keyboard: [
      [{ text: t(lang, 'reason_panne_irrigation'), callback_data: 'no_harvest:reason:panne_irrigation' }],
      [{ text: t(lang, 'reason_meteo'), callback_data: 'no_harvest:reason:meteo' }],
      [{ text: t(lang, 'reason_main_oeuvre'), callback_data: 'no_harvest:reason:main_oeuvre' }],
      [{ text: t(lang, 'reason_maladie'), callback_data: 'no_harvest:reason:maladie' }],
      [{ text: t(lang, 'reason_maintenance'), callback_data: 'no_harvest:reason:maintenance' }],
      [{ text: t(lang, 'reason_other'), callback_data: 'no_harvest:reason:autre' }],
      [{ text: t(lang, 'cancel'), callback_data: 'cancel' }],
    ],
  })
}

/** Sauvegarde l'alerte journée sans récolte. */
async function saveNoHarvest(user: any, reason: string, notes: string | null = null) {
  const lang = user.language
  const today = new Date().toISOString().slice(0, 10)
  const rLabel = reasonLabel(lang, reason)
  // Le label en clair pour l'admin (toujours en FR pour cohérence DB/dashboard)
  const reasonFR = reasonLabel('fr', reason)
  const { data: alert, error } = await supabase.from('alerts').insert({
    type: 'no_harvest', severity: 'warning',
    title: `Journée sans récolte — ${today}`,
    message: `Motif: ${reasonFR}${notes ? ' — ' + notes : ''}\nSignalé via Telegram par ${user.workers?.first_name ?? '?'} ${user.workers?.last_name ?? ''}`,
    entity_type: 'harvest', is_read: false, is_resolved: false,
  }).select('id').single()
  if (error) {
    await sendMessage(user.channel_user_id, t(lang, 'error_with_msg', { msg: error.message }))
    return null
  }
  await updateSession(user.id, {})
  const noteLine = notes ? `\n${t(lang, 'note_label')} : ${notes}` : ''
  await sendMessage(user.channel_user_id,
    t(lang, 'no_harvest_saved', { date: today, reason: rLabel, noteLine }),
    buildMainMenu(lang)
  )
  return alert!.id
}

/** Type pour récolte en attente dans une session vocale. */
type PendingHarvest = {
  planting_id: string
  qty_kg: number          // poids estimé (= nb × poids/plateau) OU poids direct si dicté en kg
  planting_label: string  // "F01-S01 / Marquise"
  notes?: string | null
  transcription?: string
  tray?: { code: string; label: string; poids: number; nb: number } | null  // détail plateaux si saisi ainsi
}

/** Affiche le récap final de la session vocale + boutons confirm/cancel. */
async function showVoiceSessionRecap(chatId: string, pending: PendingHarvest[], lang: string = 'fr') {
  if (pending.length === 0) {
    await sendMessage(chatId,
      // Pas de strings i18n pour ce cas marginal — réutilise help/menu
      t(lang, 'menu_help'),
      buildMainMenu(lang)
    )
    return
  }
  const lines = pending.map((h, i) => {
    const main = h.tray
      ? `<b>${h.tray.nb} × ${h.tray.label}</b> ≈ ${h.qty_kg} kg`
      : `<b>${h.qty_kg} kg</b>`
    return `<b>${i + 1}.</b> ${h.planting_label} — ${main}${h.notes ? ` <i>(${h.notes})</i>` : ''}`
  }).join('\n')
  const total = pending.reduce((s, h) => s + h.qty_kg, 0)
  await sendMessage(chatId,
    `${t(lang, 'voice_recap_title')}\n\n${lines}\n` +
    `─────────────\n` +
    t(lang, 'voice_recap_total', { total: total.toLocaleString('fr-FR'), count: String(pending.length) }),
    {
      inline_keyboard: [
        [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:confirm_all' }],
        [{ text: t(lang, 'voice_continue'), callback_data: 'voice:continue' }],
        [{ text: t(lang, 'voice_cancel_session'), callback_data: 'cancel' }],
      ],
    }
  )
}

/** Voix contextuelle : si l'utilisateur est dans un flow compose/tri/prix, on transcrit
 *  et on route comme du texte. Retourne true si traité. */
async function handleContextualVoice(user: any, voice: any): Promise<boolean> {
  const lang = user.language
  const state = (user.session_state ?? {}) as any
  const chatId = user.channel_user_id
  const contextual = (state.intent === 'compose_dispatch' && state.step === 'ask_qty_for_harvest')
    || (state.intent === 'tri' && (state.step === 'ask_freinte' || state.step === 'ask_ecart'))
    || (state.intent === 'confirm_price' && (state.step === 'ask_price' || state.step === 'ask_station_ref'))
  console.log('[ctx-voice] intent=', state.intent, 'step=', state.step, 'contextual=', contextual)
  if (!contextual) return false

  await sendMessage(chatId, t(lang, 'voice_listening'))
  let text: string
  try {
    const audio = await downloadTelegramAudio(voice.file_id)
    text = await transcribeAudioOnly(audio.data, audio.mime)
    console.log('[ctx-voice] transcription:', text)
  } catch (e: any) {
    console.error('[ctx-voice] transcription error:', e)
    await sendMessage(chatId, t(lang, 'voice_transcription_error', { msg: e?.message ?? '?' }))
    return true
  }
  await sendMessage(chatId, `🎤 <i>"${text}"</i>`)

  // Compose : qty à contribuer
  if (state.intent === 'compose_dispatch' && state.step === 'ask_qty_for_harvest') {
    // Détecte "tout" (FR) / "all" (EN) / "kollou/kolha" (darija) / "الكل" (AR)
    if (/\b(tout|toute|kollou|kolha|all|الكل|كولو)\b/i.test(text)) {
      await continueComposeSaveQty(user, 'tout')
    } else {
      const n = parseNumberFromText(text)
      if (n == null || n <= 0) {
        await sendMessage(chatId, t(lang, 'voice_qty_unclear'))
        return true
      }
      await continueComposeSaveQty(user, String(n))
    }
    return true
  }

  // Tri : freinte
  if (state.intent === 'tri' && state.step === 'ask_freinte') {
    const v = parseNumberFromText(text)
    if (v == null || v < 0 || v > 100) {
      await sendMessage(chatId, t(lang, 'voice_pct_unclear'))
      return true
    }
    await continueTriSaveFreinte(user, v)
    return true
  }

  // Tri : écart
  if (state.intent === 'tri' && state.step === 'ask_ecart') {
    const v = parseNumberFromText(text)
    if (v == null || v < 0 || v > 100) {
      await sendMessage(chatId, t(lang, 'voice_pct_unclear'))
      return true
    }
    await continueTriFinalize(user, v)
    return true
  }

  // Confirm price : prix /kg
  if (state.intent === 'confirm_price' && state.step === 'ask_price') {
    const v = parseNumberFromText(text)
    if (v == null || v <= 0) {
      await sendMessage(chatId, t(lang, 'voice_price_unclear'))
      return true
    }
    await continuePriceSavePrice(user, String(v))
    return true
  }

  // Confirm price : station_ref (texte libre)
  if (state.intent === 'confirm_price' && state.step === 'ask_station_ref') {
    await continuePriceFinalize(user, text)
    return true
  }

  return false
}

/** Handler conversationnel d'un message vocal (V3 multi-récoltes). */
async function handleVoiceMessage(user: any, voice: any): Promise<void> {
  const chatId = user.channel_user_id
  const lang = user.language

  // Voix contextuelle : si dans un flow compose/tri/prix, on transcrit + route
  if (await handleContextualVoice(user, voice)) return

  await sendMessage(chatId, t(lang, 'voice_listening'))

  // Récupère ou initialise la session vocale
  const state = (user.session_state ?? {}) as any
  const pending: PendingHarvest[] = state.intent === 'voice_session' && Array.isArray(state.pending) ? state.pending : []

  const trayTypes = await listTrayTypes()
  let payload: any
  try {
    const audio = await downloadTelegramAudio(voice.file_id)
    const plantings = await listPlantings()
    if (plantings.length === 0) {
      await sendMessage(chatId, t(lang, 'voice_no_planting'))
      return
    }
    payload = await transcribeAndExtract(audio.data, audio.mime, plantings, pending.length, lang, trayTypes)
  } catch (e: any) {
    console.error('[voice] error:', e)
    await sendMessage(chatId, t(lang, 'voice_transcription_error', { msg: e?.message ?? '?' }), buildMainMenu(lang))
    return
  }

  console.log('[voice] result:', JSON.stringify(payload))

  // ─── INTENT : journée sans récolte ──────────────────
  if (payload.intent === 'no_harvest') {
    if (pending.length > 0) {
      // Si une session avait commencé, demander quoi faire (utilise reply_hint Gemini si dispo)
      const ack = payload.reply_hint ?? ''
      await sendMessage(chatId,
        `🎤 <i>"${payload.transcription}"</i>${ack ? '\n\n' + ack : ''}`,
        {
          inline_keyboard: [
            [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:confirm_then_no_harvest' }],
            [{ text: t(lang, 'voice_cancel_session'), callback_data: 'cancel' }],
          ],
        })
      return
    }
    await sendMessage(chatId, `🎤 <i>"${payload.transcription}"</i>${payload.reply_hint ? '\n\n' + payload.reply_hint : ''}`)
    await startNoHarvestFlow(user)
    return
  }

  // ─── INTENT : done → afficher récap ─────────────────
  if (payload.intent === 'done') {
    if (pending.length === 0) {
      await sendMessage(chatId,
        `🎤 <i>"${payload.transcription}"</i>${payload.reply_hint ? '\n\n' + payload.reply_hint : ''}`,
        buildMainMenu(lang)
      )
      await updateSession(user.id, {})
      return
    }
    await showVoiceSessionRecap(chatId, pending, lang)
    return
  }

  // ─── INTENT : harvest → ajouter à la session ────────
  if (payload.intent === 'harvest' && Array.isArray(payload.harvests) && payload.harvests.length > 0) {
    // Filtre les récoltes valides (planting_id + qty_kg > 0)
    const valid: PendingHarvest[] = []
    const rejected: any[] = []
    for (const h of payload.harvests) {
      const nbTrays = Number(h.nb_trays) || 0
      const directKg = Number(h.qty_kg) || 0
      const hasTrays = nbTrays > 0
      const hasKg = directKg > 0
      if (h.planting_id && (hasTrays || hasKg)) {
        // Vérifie le planting et récupère le label
        const { data: p } = await supabase.from('campaign_plantings')
          .select('id, greenhouses(code), varieties(code, commercial_name)')
          .eq('id', h.planting_id)
          .maybeSingle()
        if (p) {
          const pa: any = p
          // Priorité aux plateaux : résout le type (poids dicté sinon défaut), poids estimé = nb × poids
          let qty = directKg
          let tray: PendingHarvest['tray'] = null
          if (hasTrays) {
            const ty = resolveTrayType(trayTypes, Number(h.tray_poids_kg) || null)
            if (ty) {
              tray = { code: ty.code, label: ty.label, poids: ty.poids, nb: nbTrays }
              qty = nbTrays * ty.poids
            } else if (!hasKg) {
              rejected.push(h); continue   // plateaux dictés mais aucun type configuré ni poids direct
            }
          }
          valid.push({
            planting_id: h.planting_id,
            qty_kg: qty,
            planting_label: `${pa.greenhouses?.code ?? '?'} / ${pa.varieties?.commercial_name ?? '?'}`,
            notes: h.notes ?? null,
            transcription: payload.transcription,
            tray,
          })
        } else { rejected.push(h) }
      } else { rejected.push(h) }
    }

    const merged = [...pending, ...valid]
    await updateSession(user.id, { intent: 'voice_session', pending: merged })

    if (valid.length === 0) {
      // Aucune récolte exploitée
      await sendMessage(chatId,
        t(lang, 'voice_extracted_unclear', { transcription: payload.transcription }),
        merged.length > 0 ? {
          inline_keyboard: [
            [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:show_recap' }],
            [{ text: t(lang, 'cancel'), callback_data: 'cancel' }],
          ],
        } : buildMainMenu(lang)
      )
      return
    }

    // Acquittement : liste des saisies de ce message + reply_hint Gemini (déjà dans la langue du user)
    const ackLines = valid.map(h => {
      const main = h.tray ? `<b>${h.tray.nb} × ${h.tray.label}</b> ≈ ${h.qty_kg} kg` : `<b>${h.qty_kg} kg</b>`
      return `✓ ${h.planting_label} — ${main}${h.notes ? ` <i>(${h.notes})</i>` : ''}`
    }).join('\n')
    // Gemini renvoie reply_hint adapté à la langue → on le garde tel quel
    const replyHint = payload.reply_hint ?? ''
    await sendMessage(chatId,
      `🎤 <i>"${payload.transcription}"</i>\n\n` +
      `${ackLines}` +
      (replyHint ? `\n\n💬 ${replyHint}` : ''),
      {
        inline_keyboard: [
          [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:show_recap' }],
          [{ text: t(lang, 'voice_cancel_session'), callback_data: 'cancel' }],
        ],
      }
    )
    return
  }

  // ─── INTENT : unknown ───────────────────────────────
  await sendMessage(chatId,
    `🎤 <i>"${payload.transcription}"</i>` +
    (payload.reply_hint ? `\n\n❓ ${payload.reply_hint}` : `\n\n${t(lang, 'voice_extracted_unclear', { transcription: '' }).split('\n\n')[1] ?? ''}`),
    pending.length > 0 ? {
      inline_keyboard: [
        [{ text: t(lang, 'voice_save_all'), callback_data: 'voice:show_recap' }],
        [{ text: t(lang, 'cancel'), callback_data: 'cancel' }],
      ],
    } : buildMainMenu(lang)
  )
}

/** Confirme la session vocale : crée toutes les récoltes en batch. */
async function confirmVoiceSession(user: any): Promise<{ inserted: number; lots: string[] }> {
  const lang = user.language
  const state = (user.session_state ?? {}) as any
  const pending: PendingHarvest[] = Array.isArray(state.pending) ? state.pending : []
  if (pending.length === 0) {
    await sendMessage(user.channel_user_id, t(lang, 'compose_no_lots'), buildMainMenu(lang))
    return { inserted: 0, lots: [] }
  }
  const today = new Date().toISOString().slice(0, 10)
  const ts = String(Date.now())
  const workerName = `${user.workers?.first_name ?? '?'} ${user.workers?.last_name ?? ''}`.trim()
  const noteAuthor = `Saisie vocale via Telegram par ${workerName}`

  const inserted: string[] = []
  const errorMsgs: string[] = []
  for (let i = 0; i < pending.length; i++) {
    const h = pending[i]
    const lot = `LOT-${today.replace(/-/g, '')}-${ts.slice(-4)}-${String(i + 1).padStart(2, '0')}`
    const notes = noteAuthor +
      (h.transcription ? `\nTranscription : "${h.transcription}"` : '') +
      (h.notes ? `\nNote : ${h.notes}` : '')
    const { error, data } = await supabase.from('harvests').insert({
      campaign_planting_id: h.planting_id,
      harvest_date: today,
      estimated_kg: h.tray ? h.qty_kg : null,   // poids estimé si saisie en plateaux
      qty_category_1: h.qty_kg,                  // pont (source de vérité avant pesée station)
      qty_category_2: 0, qty_category_3: 0, qty_waste: 0,
      lot_number: lot,
      recorded_by_name: workerName,
      notes,
    }).select('id, lot_number').single()
    if (error) {
      console.error('[voice] insert error:', error)
      errorMsgs.push(`${h.planting_label} : ${error.message}`)
      continue
    }
    // Ligne de plateaux si la récolte a été dictée en plateaux
    if (h.tray) {
      const { error: e2 } = await supabase.from('harvest_tray_lines').insert({
        harvest_id: data!.id,
        tray_type_code: h.tray.code,
        tray_type_label: h.tray.label,
        nb_trays: h.tray.nb,
        poids_unitaire_kg: h.tray.poids,
      })
      if (e2) console.error('[voice] tray line insert error:', e2.message)
    }
    inserted.push(data!.lot_number)
  }

  // Ne pas échouer en silence : si des insertions ont été rejetées (ex. garde-fou
  // de date hors plage), on affiche la vraie raison à l'utilisateur.
  if (errorMsgs.length > 0) {
    await sendMessage(user.channel_user_id,
      t(lang, 'voice_partial_error', {
        ok: String(inserted.length),
        total: String(pending.length),
        reasons: errorMsgs.map(m => `• ${m}`).join('\n'),
      }),
      buildMainMenu(lang)
    )
    if (inserted.length === 0) { await updateSession(user.id, {}); return { inserted: 0, lots: [] } }
  }

  await updateSession(user.id, {})
  const total = pending.slice(0, inserted.length).reduce((s, h) => s + h.qty_kg, 0)
  await sendMessage(user.channel_user_id,
    t(lang, 'voice_session_saved', {
      inserted: String(inserted.length),
      total: String(pending.length),
      date: today,
      kg: total.toLocaleString('fr-FR'),
    }) +
    '\n\n' +
    inserted.map(l => `• <code>${l}</code>`).join('\n'),
    buildMainMenu(lang)
  )
  return { inserted: inserted.length, lots: inserted }
}

// ─── COMPOSE DISPATCH (multi-récoltes → 1 envoi station) ─────

/** Récupère les récoltes des 7 derniers jours avec qté restante. */
async function listHarvestsAvailable(): Promise<any[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const { data: harvests } = await supabase.from('harvests')
    .select('id, lot_number, harvest_date, total_qty, campaign_planting_id, campaign_plantings(variety_id, greenhouse_id, greenhouses(code), varieties(commercial_name, code))')
    .gte('harvest_date', since)
    .order('harvest_date', { ascending: false })
    .limit(30)
  const hList = (harvests ?? []) as any[]
  if (hList.length === 0) return []
  // Calcule la quantité déjà engagée dans des envois (sources)
  const ids = hList.map(h => h.id)
  const { data: sources } = await supabase.from('harvest_lot_sources')
    .select('harvest_id, qty_contributed_kg')
    .in('harvest_id', ids)
  const usedByH = new Map<string, number>()
  ;(sources ?? []).forEach((s: any) => usedByH.set(s.harvest_id, (usedByH.get(s.harvest_id) ?? 0) + Number(s.qty_contributed_kg || 0)))
  // Aussi : anciennes lignes legacy avec harvest_id direct
  const { data: legacy } = await supabase.from('harvest_lots')
    .select('harvest_id, quantity_kg')
    .eq('category', 'station_dispatch')
    .in('harvest_id', ids)
  ;(legacy ?? []).forEach((d: any) => {
    if (d.harvest_id) usedByH.set(d.harvest_id, (usedByH.get(d.harvest_id) ?? 0) + Number(d.quantity_kg || 0))
  })
  return hList.map((h: any) => {
    const used = usedByH.get(h.id) ?? 0
    return { ...h, used, remaining: Math.max(0, Number(h.total_qty || 0) - used) }
  }).filter(h => h.remaining > 0.01)
}

/** Démarre la composition d'un lot station (multi-récoltes). */
async function startComposeDispatch(user: any) {
  const usable = await listHarvestsAvailable()
  if (usable.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_no_harvest_available'), buildMainMenu(user.language))
    return
  }
  await updateSession(user.id, { intent: 'compose_dispatch', step: 'pick_harvest', sources: [] })
  await renderComposePickHarvest(user, usable)
}

/** Affiche la liste des récoltes disponibles avec quantités déjà sélectionnées. */
async function renderComposePickHarvest(user: any, usable: any[]) {
  const state = (user.session_state ?? {}) as any
  const selected: any[] = state.sources ?? []
  const selectedIds = new Set(selected.map(s => s.harvest_id))
  const totalSelected = selected.reduce((s, x) => s + Number(x.qty_kg), 0)

  const buttons = usable.slice(0, 12).map((h: any) => {
    const isSel = selectedIds.has(h.id)
    const lbl = `${isSel ? '✓ ' : ''}${h.lot_number} · ${h.campaign_plantings?.greenhouses?.code ?? '?'}/${h.campaign_plantings?.varieties?.code ?? '?'} · ${Math.round(h.remaining)}kg dispo`
    return [{ text: lbl, callback_data: `compose:add:${h.id}` }]
  })
  buttons.push([
    { text: `✅ Terminer (${selected.length} lots · ${Math.round(totalSelected)}kg)`, callback_data: 'compose:done' },
    { text: '✖ Annuler', callback_data: 'cancel' },
  ])

  const lines: string[] = []
  lines.push('🚚 <b>Compose ton envoi station</b>')
  if (selected.length > 0) {
    // Groupe par variété pour montrer le split à venir
    const byVariety = new Map<string, { code: string; total: number; n: number }>()
    selected.forEach(s => {
      const code = s.variety_code ?? '?'
      const cur = byVariety.get(code) ?? { code, total: 0, n: 0 }
      cur.total += Number(s.qty_kg); cur.n += 1
      byVariety.set(code, cur)
    })
    lines.push('')
    lines.push('Sélectionnés :')
    for (const s of selected) {
      lines.push(`  ✓ ${s.lot_number} <i>[${s.variety_code ?? '?'}]</i> — ${s.qty_kg} kg`)
    }
    lines.push(`<b>Total : ${Math.round(totalSelected)} kg sur ${selected.length} lot(s)</b>`)
    if (byVariety.size > 1) {
      lines.push(`⚠ ${byVariety.size} variétés → <b>${byVariety.size} envois distincts</b> seront créés (1 par variété)`)
      for (const [code, v] of byVariety.entries()) {
        lines.push(`   • ${code} : ${Math.round(v.total)} kg sur ${v.n} lot(s)`)
      }
    }
  }
  lines.push('')
  lines.push('Choisis un lot à ajouter (ou termine) :')
  await sendMessage(user.channel_user_id, lines.join('\n'), { inline_keyboard: buttons })
}

/** Étape : utilisateur clique sur un lot → demande la qty à ajouter. */
async function continueComposeAddHarvest(user: any, harvestId: string) {
  const state = (user.session_state ?? {}) as any
  const usable = await listHarvestsAvailable()
  const h: any = usable.find((x: any) => x.id === harvestId)
  if (!h) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_lot_unavailable'))
    return
  }
  // Vérifie que pas déjà sélectionné
  const sources: any[] = state.sources ?? []
  if (sources.find(s => s.harvest_id === harvestId)) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_lot_already_added'))
    return
  }
  await updateSession(user.id, {
    ...state,
    step: 'ask_qty_for_harvest',
    pending_harvest: {
      harvest_id: harvestId,
      lot_number: h.lot_number,
      max_qty: h.remaining,
      variety_id: h.campaign_plantings?.variety_id,
      variety_code: h.campaign_plantings?.varieties?.code,
      greenhouse_id: h.campaign_plantings?.greenhouse_id,
      campaign_planting_id: h.campaign_planting_id,
    },
  })
  await sendMessage(user.channel_user_id,
    `📦 ${h.lot_number} · ${h.campaign_plantings?.greenhouses?.code ?? '?'}/${h.campaign_plantings?.varieties?.code ?? '?'}\n` +
    `Disponible : <b>${Math.round(h.remaining)} kg</b>\n\n` +
    `Combien mettre dans l'envoi ? Tape la quantité (ou <code>tout</code> pour tout prendre).\n` +
    `🎤 Tu peux aussi répondre par message vocal.`
  )
}

/** Étape : reçoit la qty contributing, ajoute à la session. */
async function continueComposeSaveQty(user: any, text: string) {
  const state = (user.session_state ?? {}) as any
  const ph = state.pending_harvest
  if (!ph) { await sendMessage(user.channel_user_id, t(user.language, 'session_lost')); return }
  const max = Number(ph.max_qty)
  let qty: number
  if (text.toLowerCase().trim() === 'tout') {
    qty = max
  } else {
    qty = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_qty_invalid_or_all'))
    return
  }
  if (qty > max + 0.01) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_qty_exceeds', { max: String(Math.round(max)) }))
    return
  }
  const sources = [...(state.sources ?? []), {
    harvest_id: ph.harvest_id,
    lot_number: ph.lot_number,
    qty_kg: qty,
    variety_id: ph.variety_id,
    variety_code: ph.variety_code,
    greenhouse_id: ph.greenhouse_id,
    campaign_planting_id: ph.campaign_planting_id,
  }]
  await updateSession(user.id, { ...state, step: 'pick_harvest', sources, pending_harvest: null })

  // Acquittement explicite + invite claire à continuer
  await sendMessage(user.channel_user_id,
    `✓ Ajouté : <b>${qty} kg</b> du lot <code>${ph.lot_number}</code>` +
    (ph.variety_code ? ` <i>[${ph.variety_code}]</i>` : '') + '\n' +
    `📌 <b>Total session : ${sources.length} lot(s)</b>\n\n` +
    `Tu peux continuer à ajouter d'autres lots ou cliquer <b>✅ Terminer</b> ↓`
  )

  // Réaffiche la liste avec ✓ sur les lots déjà ajoutés
  const usable = await listHarvestsAvailable()
  await renderComposePickHarvest({ ...user, session_state: { ...state, sources, pending_harvest: null } }, usable)
}

/** Étape : utilisateur clique "Terminer la composition" → demande marché. */
async function continueComposePickMarket(user: any) {
  const state = (user.session_state ?? {}) as any
  const sources: any[] = state.sources ?? []
  if (sources.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_no_lots'), buildMainMenu(user.language))
    await updateSession(user.id, {})
    return
  }
  const { data: markets } = await supabase.from('markets')
    .select('id, code, name').eq('is_active', true).order('name').limit(15)
  const mList = (markets ?? []) as any[]
  if (mList.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'compose_no_market'), buildMainMenu(user.language))
    await updateSession(user.id, {})
    return
  }
  const buttons = mList.map((m: any) => ([{
    text: `🌍 ${m.name}${m.code ? ' (' + m.code + ')' : ''}`,
    callback_data: `compose:market:${m.id}`,
  }]))
  buttons.push([{ text: '✖ Annuler', callback_data: 'cancel' }])
  await updateSession(user.id, { ...state, step: 'pick_market' })
  const total = sources.reduce((s, x) => s + Number(x.qty_kg), 0)
  await sendMessage(user.channel_user_id,
    `🚚 Envoi composé : <b>${sources.length} lot(s) · ${Math.round(total)} kg</b>\n\nVers quel marché ?`,
    { inline_keyboard: buttons }
  )
}

/** Étape : finalise — crée 1 harvest_lot PAR VARIÉTÉ + sources. */
async function continueComposeSaveMarket(user: any, marketId: string): Promise<string | null> {
  const state = (user.session_state ?? {}) as any
  const sources: any[] = state.sources ?? []
  if (sources.length === 0) { await sendMessage(user.channel_user_id, t(user.language, 'compose_session_empty')); return null }
  const { data: market } = await supabase.from('markets').select('name').eq('id', marketId).maybeSingle()
  const totalQty = sources.reduce((s, x) => s + Number(x.qty_kg), 0)
  const ts = String(Date.now())
  const today = new Date().toISOString().slice(0, 10)

  // Groupe les sources par variété (1 harvest_lot par variété, NOT NULL contrainte)
  const groups = new Map<string, any[]>()
  for (const s of sources) {
    const vid = s.variety_id
    if (!vid) {
      await sendMessage(user.channel_user_id, t(user.language, 'compose_no_variety', { lot: s.lot_number }))
      return null
    }
    const arr = groups.get(vid) ?? []
    arr.push(s); groups.set(vid, arr)
  }

  type Created = { lot_number: string; variety_code: string; total: number }
  const created: Created[] = []
  let groupIdx = 0
  let firstLotId: string | null = null
  for (const [varietyId, gSources] of groups.entries()) {
    groupIdx++
    const sub = gSources[0]
    const subTotal = gSources.reduce((s: number, x: any) => s + Number(x.qty_kg), 0)
    const dispLot = `D${ts.slice(-8)}-${String(groupIdx).padStart(2, '0')}`.slice(0, 50)

    const { data: lot, error } = await supabase.from('harvest_lots').insert({
      lot_number: dispLot,
      harvest_id: gSources.length === 1 ? gSources[0].harvest_id : null,
      campaign_planting_id: sub.campaign_planting_id,
      harvest_date: today,
      quantity_kg: subTotal,
      category: 'station_dispatch',
      variety_id: varietyId,
      greenhouse_id: sub.greenhouse_id,
      market_id: marketId,
      tri_status: 'pending',
      notes: `Envoi composite via Telegram par ${user.workers?.first_name ?? '?'} ${user.workers?.last_name ?? ''} — ${gSources.length} récolte(s) variété ${sub.variety_code ?? '?'}`,
    }).select('id, lot_number').single()
    if (error) {
      await sendMessage(user.channel_user_id, t(user.language, 'compose_lot_error', { idx: String(groupIdx), msg: error.message }))
      return null
    }
    if (!firstLotId) firstLotId = lot!.id

    const sourceRows = gSources.map((s: any) => ({
      harvest_lot_id: lot!.id, harvest_id: s.harvest_id, qty_contributed_kg: Number(s.qty_kg),
    }))
    const { error: srcErr } = await supabase.from('harvest_lot_sources').insert(sourceRows)
    if (srcErr) console.error('[compose] sources error:', srcErr)

    created.push({ lot_number: lot!.lot_number, variety_code: sub.variety_code ?? '?', total: subTotal })
  }

  await updateSession(user.id, {})
  const lotsList = created.map(c => `  • <code>${c.lot_number}</code> [${c.variety_code}] — ${Math.round(c.total)} kg`).join('\n')
  const message = created.length === 1
    ? `✅ <b>Envoi station créé</b>\n` +
      `Dispatch : <code>${created[0].lot_number}</code>\n` +
      `Marché : ${market?.name ?? '?'}\n` +
      `Variété : ${created[0].variety_code}\n` +
      `Total : <b>${Math.round(totalQty)} kg</b> sur ${sources.length} récolte(s)`
    : `✅ <b>${created.length} envois station créés</b>\n` +
      `Marché : ${market?.name ?? '?'}\n` +
      `(splittés automatiquement par variété)\n\n` +
      lotsList +
      `\n\n<b>Total : ${Math.round(totalQty)} kg</b> sur ${sources.length} récolte(s)`

  await sendMessage(user.channel_user_id,
    `${message}\n\n📌 Prochaine étape : <b>🔬 Saisir tri</b> (freinte + écart) après réception station.`,
    mainMenuKeyboard
  )
  return firstLotId
}

// ─── TRI FLOW (freinte + écart, sans prix) ───────────────────

/** Liste les dispatches en attente de tri (tri_status='pending'). */
async function startTriFlow(user: any) {
  const { data } = await supabase.from('harvest_lots')
    .select('id, lot_number, quantity_kg, harvest_date, market_id, markets(name), variety_id, varieties(code)')
    .eq('category', 'station_dispatch')
    .eq('tri_status', 'pending')
    .order('harvest_date', { ascending: false })
    .limit(15)
  const list = (data ?? []) as any[]
  if (list.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'tri_nothing_to_sort'), buildMainMenu(user.language))
    return
  }
  await updateSession(user.id, { intent: 'tri', step: 'pick_dispatch' })
  const buttons = list.map((d: any) => ([{
    text: `${d.lot_number} · ${d.markets?.name ?? '?'} · [${d.varieties?.code ?? '?'}] · ${Math.round(d.quantity_kg)}kg`,
    callback_data: `tri:dispatch:${d.id}`,
  }]))
  buttons.push([{ text: '✖ Annuler', callback_data: 'cancel' }])
  await sendMessage(user.channel_user_id, t(user.language, 'tri_pick_dispatch'), { inline_keyboard: buttons })
}

async function continueTriPickDispatch(user: any, dispatchId: string) {
  const { data: d } = await supabase.from('harvest_lots')
    .select('id, lot_number, quantity_kg, markets(name), varieties(code, commercial_name)')
    .eq('id', dispatchId).maybeSingle()
  if (!d) { await sendMessage(user.channel_user_id, t(user.language, 'not_found')); return }
  const dd: any = d
  await updateSession(user.id, {
    intent: 'tri', step: 'ask_freinte',
    dispatch_id: dispatchId,
    dispatch_lot: dd.lot_number,
    qty_brute: Number(dd.quantity_kg),
    market_name: dd.markets?.name ?? '?',
    variety_code: dd.varieties?.code ?? '?',
  })
  await sendMessage(user.channel_user_id,
    `🔬 ${dd.lot_number} · ${dd.markets?.name ?? '?'} · [${dd.varieties?.code ?? '?'}] · ${Math.round(dd.quantity_kg)}kg brute\n\nFreinte (% perte au tri) ? Tape <b>0</b> si pas de freinte, utilise les boutons, ou 🎤 dicte :`,
    { inline_keyboard: [
      [{ text: '0%', callback_data: 'tri:freinte:0' }, { text: '3%', callback_data: 'tri:freinte:3' }, { text: '5%', callback_data: 'tri:freinte:5' }, { text: '10%', callback_data: 'tri:freinte:10' }],
      [{ text: '✖ Annuler', callback_data: 'cancel' }],
    ]}
  )
}

async function continueTriSaveFreinte(user: any, freinte: number) {
  const state = (user.session_state ?? {}) as any
  await updateSession(user.id, { ...state, step: 'ask_ecart', freinte_pct: freinte })
  await sendMessage(user.channel_user_id,
    `Freinte : <b>${freinte}%</b>\n\nÉcart qualité (%) ? Boutons, texte ou 🎤 vocal.`,
    { inline_keyboard: [
      [{ text: '0%', callback_data: 'tri:ecart:0' }, { text: '2%', callback_data: 'tri:ecart:2' }, { text: '5%', callback_data: 'tri:ecart:5' }, { text: '10%', callback_data: 'tri:ecart:10' }],
      [{ text: '✖ Annuler', callback_data: 'cancel' }],
    ]}
  )
}

async function continueTriFinalize(user: any, ecart: number) {
  const state = (user.session_state ?? {}) as any
  const qtyB = Number(state.qty_brute) || 0
  const fr = Number(state.freinte_pct) || 0
  const qtyN = Math.round(qtyB * (1 - fr / 100) * 100) / 100
  const qtyA = Math.round(qtyN * (1 - ecart / 100) * 100) / 100
  const qtyRejet = Math.round((qtyB - qtyA) * 100) / 100

  // Si pas de rejet, on saute l'étape destination
  if (qtyRejet <= 0) {
    return await saveTriWithDestination(user, fr, ecart, qtyN, qtyA, qtyRejet, 'destruction')
  }

  // Étape supplémentaire : demander destination du rejet
  await updateSession(user.id, {
    ...state, step: 'ask_destination_rejet',
    freinte_pct: fr, ecart_pct: ecart, qty_nette: qtyN, qty_acceptee: qtyA, qty_rejet: qtyRejet,
  })

  const lang = user.language
  await sendMessage(user.channel_user_id,
    `Freinte ${fr}% + Écart ${ecart}% = <b>${qtyRejet} kg</b> rejet.\n\n` +
    `🎯 ${t(lang, 'ask_destination_rejet') || 'Que faire de ce rejet ?'}`,
    { inline_keyboard: [
      [{ text: '🗑️ ' + (t(lang, 'dest_destruction')     || 'Destruction (perte)'),  callback_data: 'tri:dest:destruction' }],
      [{ text: '🔄 ' + (t(lang, 'dest_retour_stock')    || 'Retour stock (autre marché)'), callback_data: 'tri:dest:retour_stock' }],
      [{ text: '🏭 ' + (t(lang, 'dest_vente_industrie') || 'Vente industrie (prix réduit)'), callback_data: 'tri:dest:vente_industrie' }],
      [{ text: '🤝 ' + (t(lang, 'dest_dons')            || 'Dons / banque alimentaire'), callback_data: 'tri:dest:dons' }],
      [{ text: t(lang, 'cancel'), callback_data: 'cancel' }],
    ]}
  )
}

async function saveTriWithDestination(
  user: any, fr: number, ec: number, qtyN: number, qtyA: number, qtyRejet: number,
  destination: 'destruction' | 'retour_stock' | 'vente_industrie' | 'dons',
) {
  const state = (user.session_state ?? {}) as any
  // 1. Update du dispatch principal
  const { error } = await supabase.from('harvest_lots').update({
    freinte_pct: fr,
    ecart_pct: ec,
    qty_nette_kg: qtyN,
    qty_acceptee_kg: qtyA,
    rejet_qty_kg: qtyRejet,
    destination_rejet: destination,
    tri_status: 'tried',
  }).eq('id', state.dispatch_id)
  if (error) {
    await sendMessage(user.channel_user_id, t(user.language, 'error_with_msg', { msg: error.message }))
    return
  }

  // 2. Si retour_stock : créer le harvest_lot enfant
  let stockRetourCreated = false
  if (destination === 'retour_stock' && qtyRejet > 0) {
    // Récupère les infos du dispatch parent pour le lot enfant
    const { data: parentLot } = await supabase.from('harvest_lots')
      .select('lot_number, harvest_id, campaign_planting_id, harvest_date, variety_id, greenhouse_id')
      .eq('id', state.dispatch_id).maybeSingle()
    if (parentLot) {
      const childLotNumber = `${parentLot.lot_number}-RETOUR`
      const { error: cErr } = await supabase.from('harvest_lots').insert({
        lot_number: childLotNumber,
        harvest_id: parentLot.harvest_id ?? null,
        campaign_planting_id: parentLot.campaign_planting_id ?? null,
        harvest_date: parentLot.harvest_date ?? new Date().toISOString().slice(0, 10),
        quantity_kg: qtyRejet,
        variety_id: parentLot.variety_id ?? null,
        greenhouse_id: parentLot.greenhouse_id ?? null,
        category: 'stock_retour',
        parent_dispatch_id: state.dispatch_id,
        tri_status: 'pending',
        destination_rejet: null,
        notes: `Retour stock issu de ${parentLot.lot_number} (saisi via Telegram)`,
      })
      if (!cErr) stockRetourCreated = true
      else console.warn('[tri telegram] échec création stock_retour:', cErr)
    }
  }

  await updateSession(user.id, {})

  const qtyB = qtyN / (1 - fr / 100)  // recalcul brute pour affichage
  const destLabel: Record<string, string> = {
    destruction: '🗑️ Destruction',
    retour_stock: '🔄 Retour stock',
    vente_industrie: '🏭 Vente industrie',
    dons: '🤝 Dons',
  }

  let msg = `✅ <b>Tri enregistré</b>\n` +
    `${state.dispatch_lot}\n` +
    `Brute : ${Math.round(qtyB)} kg\n` +
    `Freinte : ${fr}% · Écart : ${ec}%\n` +
    `Acceptée : <b>${qtyA} kg</b>\n` +
    `Rejet : ${qtyRejet} kg → ${destLabel[destination]}`

  if (stockRetourCreated) {
    msg += `\n\n💡 Un lot <code>${state.dispatch_lot}-RETOUR</code> a été créé (${qtyRejet} kg).\nDisponible pour ré-envoi.`
  }
  msg += `\n\n📌 Prochaine étape : <b>💰 Confirmer prix</b>.`

  await sendMessage(user.channel_user_id, msg, buildMainMenu(user.language))
}

// ─── CONFIRM PRICE FLOW (sans freinte/écart, déjà saisis au tri) ──

async function startConfirmPriceFlow(user: any) {
  const { data: disps } = await supabase.from('harvest_lots')
    .select('id, lot_number, quantity_kg, qty_acceptee_kg, harvest_date, market_id, markets(name, currency), variety_id, varieties(code)')
    .eq('category', 'station_dispatch')
    .eq('tri_status', 'tried')
    .order('harvest_date', { ascending: false })
    .limit(15)
  const list = (disps ?? []) as any[]
  if (list.length === 0) {
    await sendMessage(user.channel_user_id,
      '✅ Aucun envoi trié en attente de prix.\n\n' +
      '<i>Astuce : assure-toi d\'avoir saisi le tri (freinte + écart) avant le prix.</i>',
      mainMenuKeyboard
    )
    return
  }
  await updateSession(user.id, { intent: 'confirm_price', step: 'pick_dispatch' })
  const buttons = list.map((d: any) => ([{
    text: `${d.lot_number} · ${d.markets?.name ?? '?'} · [${d.varieties?.code ?? '?'}] · ${Math.round(d.qty_acceptee_kg ?? d.quantity_kg)}kg acceptée`,
    callback_data: `price:dispatch:${d.id}`,
  }]))
  buttons.push([{ text: '✖ Annuler', callback_data: 'cancel' }])
  await sendMessage(user.channel_user_id, t(user.language, 'price_pick_dispatch'), { inline_keyboard: buttons })
}

async function continuePricePickDispatch(user: any, dispatchId: string) {
  const { data: d } = await supabase.from('harvest_lots')
    .select('id, lot_number, quantity_kg, qty_acceptee_kg, freinte_pct, ecart_pct, markets(name, currency), varieties(code, commercial_name)')
    .eq('id', dispatchId).maybeSingle()
  if (!d) { await sendMessage(user.channel_user_id, t(user.language, 'not_found')); return }
  const dd: any = d
  await updateSession(user.id, {
    intent: 'confirm_price', step: 'ask_price',
    dispatch_id: dispatchId,
    dispatch_lot: dd.lot_number,
    qty_acceptee: Number(dd.qty_acceptee_kg ?? dd.quantity_kg),
    qty_brute: Number(dd.quantity_kg),
    freinte_pct: Number(dd.freinte_pct ?? 0),
    ecart_pct: Number(dd.ecart_pct ?? 0),
    market_name: dd.markets?.name ?? '?',
    variety_code: dd.varieties?.code ?? '?',
    currency: dd.markets?.currency ?? 'MAD',
  })
  await sendMessage(user.channel_user_id,
    `💰 ${dd.lot_number} · ${dd.markets?.name ?? '?'} · <b>[${dd.varieties?.code ?? '?'}]</b>\n` +
    `Brute ${Number(dd.quantity_kg)} kg → Acceptée <b>${Number(dd.qty_acceptee_kg ?? dd.quantity_kg)} kg</b>\n` +
    `(freinte ${dd.freinte_pct}%, écart ${dd.ecart_pct}%)\n\n` +
    `Quel prix au kg pour <b>${dd.varieties?.code ?? '?'}</b> sur <b>${dd.markets?.name ?? '?'}</b> ? (en ${dd.markets?.currency ?? 'MAD'})\nExemple : <code>8.50</code> · 🎤 vocal accepté`
  )
}

async function continuePriceSavePrice(user: any, text: string) {
  const state = (user.session_state ?? {}) as any
  const price = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(price) || price <= 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'price_invalid'))
    return
  }
  await updateSession(user.id, { ...state, step: 'ask_station_ref', price })
  await sendMessage(user.channel_user_id,
    `Prix : <b>${price} ${state.currency}/kg</b>\n\nRéférence station / bordereau ? (tape <b>-</b> pour passer, ou 🎤 vocal)`
  )
}

async function continuePriceFinalize(user: any, stationRef: string) {
  const state = (user.session_state ?? {}) as any
  const ref = stationRef.trim() === '-' ? null : stationRef.trim()
  const today = new Date().toISOString().slice(0, 10)
  const qtyA = Number(state.qty_acceptee) || 0
  const ca = Math.round(qtyA * Number(state.price) * 100) / 100

  const { error } = await supabase.from('harvest_lots').update({
    price_per_kg: state.price,
    ca_amount: ca,
    station_ref: ref,
    receipt_date: today,
    periode_debut: today,
    periode_fin: today,
    certificate_number: String(qtyA), // legacy compat
    tri_status: 'priced',
  }).eq('id', state.dispatch_id)
  if (error) {
    await sendMessage(user.channel_user_id, t(user.language, 'error_with_msg', { msg: error.message }))
    return
  }
  await updateSession(user.id, {})
  await sendMessage(user.channel_user_id,
    `✅ <b>Prix confirmé</b>\n` +
    `Lot : <code>${state.dispatch_lot}</code>\n` +
    `Acceptée : ${qtyA} kg × <b>${state.price} ${state.currency}/kg</b>\n` +
    `<b>CA : ${ca.toLocaleString('fr-FR')} ${state.currency}</b>\n` +
    (ref ? `Réf. station : ${ref}` : ''),
    mainMenuKeyboard
  )
}

// ─── (legacy single-harvest dispatch supprimé : remplacé par compose) ───

// (startDispatchFlow legacy supprimée — remplacée par startComposeDispatch)
/** Liste les 5 derniers lots de l'utilisateur. */
async function showMyLots(user: any) {
  // Pour V1 : les lots récents de la dernière semaine, toutes plantations
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const { data } = await supabase.from('harvests')
    .select('lot_number, harvest_date, total_qty, campaign_plantings(greenhouses(code), varieties(code))')
    .gte('harvest_date', since)
    .order('harvest_date', { ascending: false })
    .limit(10)
  if (!data || data.length === 0) {
    await sendMessage(user.channel_user_id, t(user.language, 'my_lots_empty'), buildMainMenu(user.language))
    return
  }
  const lines = data.map((h: any) =>
    `• ${h.harvest_date} · ${h.campaign_plantings?.greenhouses?.code ?? '?'}/${h.campaign_plantings?.varieties?.code ?? '?'} · ${Number(h.total_qty).toLocaleString('fr-FR')} kg · <code>${h.lot_number}</code>`
  ).join('\n')
  await sendMessage(user.channel_user_id, `${t(user.language, 'my_lots_title')}\n\n${lines}`, buildMainMenu(user.language))
}

// ─── Webhook handler ─────────────────────────────────────────
Deno.serve(async (req) => {
  // Vérification du secret Telegram (correctif sécurité C4 : fail-closed).
  // Le secret DOIT être configuré ET correspondre — sinon on refuse. Sans ça,
  // n'importe qui connaissant l'URL pouvait forger un update au nom d'un ouvrier.
  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.error('[telegram] TELEGRAM_WEBHOOK_SECRET non configuré — webhook refusé')
    return new Response('Webhook secret not configured', { status: 500 })
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const update = await req.json()
    // Logge tous les updates pour debug
    console.log('[telegram] update:', JSON.stringify(update).slice(0, 500))

    // Extrait chat_id et texte selon le type d'update
    let chatId: string | null = null
    let from: any = null
    let text: string | null = null
    let voice: any = null              // message vocal Telegram
    let callbackData: string | null = null
    let callbackId: string | null = null

    if (update.message) {
      chatId = String(update.message.chat.id)
      from = update.message.from
      text = update.message.text
      voice = update.message.voice ?? update.message.audio ?? null
    } else if (update.callback_query) {
      chatId = String(update.callback_query.from.id)
      from = update.callback_query.from
      callbackData = update.callback_query.data
      callbackId = update.callback_query.id
    } else {
      return new Response('OK', { status: 200 })
    }
    if (!chatId) return new Response('OK', { status: 200 })

    // ─── Cas /start ─────────────────────────────────────
    if (text?.startsWith('/start')) {
      const args = text.split(/\s+/).slice(1)
      const intent = await handleStart(chatId, args, from)
      await logMessage({
        chatbot_user_id: null, direction: 'in', content: text, intent, raw_update: update,
      })
      return new Response('OK', { status: 200 })
    }

    // ─── Authentification (chatbot_user existant et enrôlé) ──
    const user = await authUser(chatId)
    if (!user || !user.enrolled_at) {
      await sendMessage(chatId,
        "🔒 Tu n'es pas encore inscrit. Demande un code d'invitation à ton responsable et envoie :\n<code>/start TONCODE</code>"
      )
      return new Response('OK', { status: 200 })
    }

    // ─── Callbacks (boutons) ────────────────────────────
    if (callbackData) {
      if (callbackId) await answerCallbackQuery(callbackId)
      await logMessage({
        chatbot_user_id: user.id, direction: 'in', content: `[callback] ${callbackData}`, intent: 'callback', raw_update: update,
      })

      if (callbackData === 'cancel') {
        await updateSession(user.id, {})
        await sendMessage(chatId, t(user.language, 'cancelled_what_to_do'), buildMainMenu(user.language))
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'menu:voice_session') {
        await updateSession(user.id, { intent: 'voice_session', pending: [] })
        await sendMessage(chatId,
          t(user.language, 'voice_session_open'),
          {
            inline_keyboard: [
              [{ text: t(user.language, 'voice_show_recap'), callback_data: 'voice:show_recap' }],
              [{ text: t(user.language, 'cancel'), callback_data: 'cancel' }],
            ],
          }
        )
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'menu:harvest') { await startHarvestFlow(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:compose_dispatch') { await startComposeDispatch(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:tri') { await startTriFlow(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:confirm_price') { await startConfirmPriceFlow(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:no_harvest') { await startNoHarvestFlow(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:my_lots') { await showMyLots(user); return new Response('OK', { status: 200 }) }
      if (callbackData === 'menu:help') {
        await sendMessage(chatId, t(user.language, 'help_text'), buildMainMenu(user.language))
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('harvest:planting:')) {
        const plantingId = callbackData.split(':')[2]
        await continueHarvestPickPlanting(user, plantingId)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('harvest:tray:')) {
        const code = callbackData.slice('harvest:tray:'.length)
        await continueHarvestPickTray(user, code)
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'harvest:trays_done') {
        const harvestId = await continueHarvestSaveTrays(user)
        if (harvestId) {
          await logMessage({
            chatbot_user_id: user.id, direction: 'out', content: 'harvest saved (trays)',
            intent: 'harvest', created_harvest_id: harvestId,
          })
        }
        return new Response('OK', { status: 200 })
      }
      // Composition envoi station
      if (callbackData.startsWith('compose:add:')) {
        const harvestId = callbackData.split(':')[2]
        await continueComposeAddHarvest(user, harvestId)
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'compose:done') {
        await continueComposePickMarket(user)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('compose:market:')) {
        const marketId = callbackData.split(':')[2]
        await continueComposeSaveMarket(user, marketId)
        return new Response('OK', { status: 200 })
      }
      // Tri à la station
      if (callbackData.startsWith('tri:dispatch:')) {
        const dispatchId = callbackData.split(':')[2]
        await continueTriPickDispatch(user, dispatchId)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('tri:freinte:')) {
        const v = Number(callbackData.split(':')[2]) || 0
        await continueTriSaveFreinte(user, v)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('tri:ecart:')) {
        const v = Number(callbackData.split(':')[2]) || 0
        await continueTriFinalize(user, v)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('tri:dest:')) {
        const dest = callbackData.split(':')[2] as 'destruction' | 'retour_stock' | 'vente_industrie' | 'dons'
        const state = (user.session_state ?? {}) as any
        const fr = Number(state.freinte_pct) || 0
        const ec = Number(state.ecart_pct) || 0
        const qtyN = Number(state.qty_nette) || 0
        const qtyA = Number(state.qty_acceptee) || 0
        const qtyRejet = Number(state.qty_rejet) || 0
        await saveTriWithDestination(user, fr, ec, qtyN, qtyA, qtyRejet, dest)
        return new Response('OK', { status: 200 })
      }
      // Confirmer prix (sans freinte/écart, déjà saisis au tri)
      if (callbackData.startsWith('price:dispatch:')) {
        const dispatchId = callbackData.split(':')[2]
        await continuePricePickDispatch(user, dispatchId)
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'voice:show_recap') {
        const state = (user.session_state ?? {}) as any
        const pending = Array.isArray(state.pending) ? state.pending : []
        await showVoiceSessionRecap(chatId, pending, user.language)
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'voice:continue') {
        await sendMessage(chatId, t(user.language, 'voice_continue_dictating'))
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'voice:confirm_all') {
        const r = await confirmVoiceSession(user)
        await logMessage({
          chatbot_user_id: user.id, direction: 'out', content: `voice batch saved: ${r.inserted} lots`,
          intent: 'harvest', parsed_data: { lots: r.lots },
        })
        return new Response('OK', { status: 200 })
      }
      if (callbackData === 'voice:confirm_then_no_harvest') {
        await confirmVoiceSession(user)
        await startNoHarvestFlow(user)
        return new Response('OK', { status: 200 })
      }
      if (callbackData.startsWith('no_harvest:reason:')) {
        const reason = callbackData.split(':')[2]
        if (reason === 'autre') {
          await updateSession(user.id, { intent: 'no_harvest', step: 'ask_other_reason' })
          await sendMessage(chatId, t(user.language, 'specify_reason'))
        } else {
          const alertId = await saveNoHarvest(user, reason)
          await logMessage({
            chatbot_user_id: user.id, direction: 'out', content: 'no_harvest saved',
            intent: 'no_harvest', parsed_data: { reason }, created_alert_id: alertId ?? undefined,
          })
        }
        return new Response('OK', { status: 200 })
      }

      // Default
      await sendMessage(chatId, t(user.language, 'unknown_action'), buildMainMenu(user.language))
      return new Response('OK', { status: 200 })
    }

    // ─── Messages vocaux ────────────────────────────────
    if (voice) {
      await logMessage({
        chatbot_user_id: user.id, direction: 'in',
        content: `[voice ${voice.duration ?? '?'}s ${voice.file_size ?? '?'}b]`,
        intent: 'voice', raw_update: update,
      })
      await handleVoiceMessage(user, voice)
      return new Response('OK', { status: 200 })
    }

    // ─── Messages texte ─────────────────────────────────
    if (text) {
      await logMessage({
        chatbot_user_id: user.id, direction: 'in', content: text, intent: 'text', raw_update: update,
      })

      if (text === '/menu' || text === '/help') {
        await sendMessage(chatId, t(user.language, 'what_to_do'), buildMainMenu(user.language))
        return new Response('OK', { status: 200 })
      }

      // Continuer un flow en cours
      const state = (user.session_state ?? {}) as any

      // Si session vocale active : détecter "fini" / "c'est tout" en texte → afficher récap
      if (state.intent === 'voice_session') {
        const lower = text.toLowerCase().trim()
        const doneKeywords = ['fini', "c'est tout", 'cest tout', 'cest fini', "c'est fini", 'termine', 'terminé', 'terminer', 'voila', 'voilà', 'khlas', 'rien dautre', "rien d'autre", 'non', 'non c\'est tout']
        if (doneKeywords.some(k => lower === k || lower.startsWith(k + ' ') || lower.endsWith(' ' + k))) {
          const pending = Array.isArray(state.pending) ? state.pending : []
          await showVoiceSessionRecap(chatId, pending, user.language)
          return new Response('OK', { status: 200 })
        }
      }

      if (state.intent === 'new_harvest' && state.step === 'ask_qty') {
        const harvestId = await continueHarvestSaveQty(user, text)
        if (harvestId) {
          await logMessage({
            chatbot_user_id: user.id, direction: 'out', content: 'harvest saved',
            intent: 'harvest', parsed_data: { qty: text }, created_harvest_id: harvestId,
          })
        }
        return new Response('OK', { status: 200 })
      }
      // Récolte en plateaux : nombre de plateaux pour le type courant
      if (state.intent === 'new_harvest' && state.step === 'ask_tray_count') {
        await continueHarvestSaveTrayCount(user, text)
        return new Response('OK', { status: 200 })
      }
      // Récolte en plateaux : à l'étape choix de type, on attend un bouton → on ré-affiche le menu
      if (state.intent === 'new_harvest' && state.step === 'pick_tray') {
        await showTrayMenu(user)
        return new Response('OK', { status: 200 })
      }
      // Composer un envoi : reçoit la qty à contribuer pour un harvest
      if (state.intent === 'compose_dispatch' && state.step === 'ask_qty_for_harvest') {
        await continueComposeSaveQty(user, text)
        return new Response('OK', { status: 200 })
      }
      // Tri : freinte/écart en texte si pas via boutons
      if (state.intent === 'tri' && state.step === 'ask_freinte') {
        const v = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          await sendMessage(chatId, t(user.language, 'invalid_input_pct'))
          return new Response('OK', { status: 200 })
        }
        await continueTriSaveFreinte(user, v)
        return new Response('OK', { status: 200 })
      }
      if (state.intent === 'tri' && state.step === 'ask_ecart') {
        const v = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''))
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          await sendMessage(chatId, t(user.language, 'invalid_input_pct'))
          return new Response('OK', { status: 200 })
        }
        await continueTriFinalize(user, v)
        return new Response('OK', { status: 200 })
      }
      // Confirmer prix : prix puis station_ref
      if (state.intent === 'confirm_price' && state.step === 'ask_price') {
        await continuePriceSavePrice(user, text)
        return new Response('OK', { status: 200 })
      }
      if (state.intent === 'confirm_price' && state.step === 'ask_station_ref') {
        await continuePriceFinalize(user, text)
        return new Response('OK', { status: 200 })
      }
      if (state.intent === 'no_harvest' && state.step === 'ask_other_reason') {
        const alertId = await saveNoHarvest(user, 'autre', text)
        await logMessage({
          chatbot_user_id: user.id, direction: 'out', content: 'no_harvest saved (autre)',
          intent: 'no_harvest', parsed_data: { reason: 'autre', notes: text }, created_alert_id: alertId ?? undefined,
        })
        return new Response('OK', { status: 200 })
      }

      // Pas de flow en cours
      await sendMessage(chatId,
        'Je n\'ai pas compris. Utilise les boutons ou tape /menu.',
        mainMenuKeyboard
      )
      return new Response('OK', { status: 200 })
    }

    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('[telegram] error:', e)
    return new Response('Internal error', { status: 500 })
  }
})
