// Mechanical assembly of reviewed source migrations into one user-run transaction.
import fs from 'node:fs'
const body=name=>fs.readFileSync(`supabase/migrations/${name}`,'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const sql=`-- FarmPilot : lot complet du parcours cultural 135B/135C, plus 134 si absent.
-- Prérequis : 133 et 135A déjà appliquées. Exécuter le fichier entier UNE fois.
-- Aucune donnée métier historique modifiée. Notifications nouvelles désactivées par défaut.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
BEGIN
 IF to_regclass('public.fertigation_recipes') IS NULL THEN RAISE EXCEPTION 'Appliquer 135A avant ce lot'; END IF;
 IF to_regclass('public.cultural_programs') IS NOT NULL THEN RAISE EXCEPTION '135B existe déjà : ne pas réappliquer ce lot complet'; END IF;
 IF to_regprocedure('public.mobile_can_review_before_irrigation(text,uuid,uuid)') IS NULL THEN
  EXECUTE $irrigation134$${body('134_irrigation_mobile_approvals.sql')}$irrigation134$;
 END IF;
END $preflight$;
${body('135b_cultural_interventions.sql')}
${body('135c_cultural_mobile.sql')}
COMMIT;
`
fs.mkdirSync('outputs/sql',{recursive:true})
fs.writeFileSync('outputs/sql/135_interventions_culturales_complet.sql',sql)
console.log('Prepared outputs/sql/135_interventions_culturales_complet.sql — NOT executed.')
