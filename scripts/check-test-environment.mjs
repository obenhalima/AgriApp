// Read-only preflight. Never links, migrates, uploads, or deploys a project.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const config = JSON.parse(readFileSync(new URL('../deployment/test-environment.json', import.meta.url), 'utf8'));
const failures = [];
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (branch !== config.gitBranch) failures.push('La branche courante doit être test. Aucun changement automatique effectué.');
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) failures.push('Des fichiers ne sont pas enregistrés dans Git : préparer une version revue avant déploiement.');
const ref = process.env.ITRIX_TEST_SUPABASE_PROJECT_REF;
if (!ref || !/^[a-z]{20}$/.test(ref) || ref === config.productionProjectRefForbidden) failures.push('Référence Supabase de test absente, invalide ou égale à la production.');
if (process.env.VERCEL_ENV !== 'preview') failures.push('Environnement Vercel attendu : preview.');
if (process.env.VERCEL_GIT_COMMIT_REF !== config.gitBranch) failures.push('La branche Vercel doit être test.');
let expectedUrl;
if (ref && /^[a-z]{20}$/.test(ref)) expectedUrl = `https://${ref}.supabase.co`;
if (!expectedUrl || process.env.NEXT_PUBLIC_SUPABASE_URL !== expectedUrl) failures.push('URL publique Supabase différente de la branche de test attendue.');
const actual = readdirSync(new URL('../supabase/functions/', import.meta.url), { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('_')).map(d => d.name);
for (const name of config.edgeFunctions) if (!actual.includes(name)) failures.push(`Edge Function absente : ${name}`);
if (failures.length) {
  console.error('Préparation non prête pour un déploiement de test :');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Contrôles locaux réussis. Aucun déploiement effectué. Les clés, le schéma distant et les fonctions déployées restent à vérifier.');
}
