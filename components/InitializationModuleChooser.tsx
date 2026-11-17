'use client'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'
import { INITIALIZATION_MODULES, type InitializationModule } from '@/lib/initializationModules'
import { Button } from '@/components/ui/Button'

export function InitializationModuleChooser({name,onChoose,onFull,onChangeClient,onHarvests,onStock}:{name:string;onChoose:(module:InitializationModule)=>void;onFull:()=>void;onChangeClient:()=>void;onHarvests:()=>void;onStock?:()=>void}) {
  const {t}=useLanguage()
  return <div className="space-y-5">
    <div><h1 className="text-xl font-semibold">{t('Reprise progressive des données')}</h1><p>{name}</p>
      <p className="mt-2 text-sm text-fg-secondary">{t('Commencez par un module. Préparez, contrôlez et sauvegardez avant de passer au suivant.')}</p></div>
    <Button variant="secondary" onClick={onChangeClient}>{t('Choisir un autre client')}</Button>
    <div className="grid md:grid-cols-2 gap-4">
      {INITIALIZATION_MODULES.map((module,index)=><section key={module.key} className="rounded-xl border border-border p-4 space-y-3">
        <h2 className="font-semibold">{index+1}. {t(module.title)}</h2><p className="text-sm">{t(module.description)}</p>
        <p className="text-caption text-fg-secondary">{t('Création des nouvelles fiches après validation de la synthèse. Annulation disponible dans le bilan, sous conditions.')}</p>
        <Button onClick={()=>onChoose(module.key)}>{t('Préparer ce module')}</Button>
      </section>)}
      <section className="rounded-xl border border-border p-4 space-y-3"><h2 className="font-semibold">{t('3. Récoltes')}</h2><p>{t('Importer les récoltes et plateaux du client, avec calcul des kilos et synthèse avant validation. Les envois sont traités séparément.')}</p><Button onClick={onHarvests}>{t('Préparer les récoltes')}</Button></section>
      {[{number:4,title:'Envois et station',description:'Lots, destinations et sources des récoltes. Pesées, tri et prix : étapes distinctes.'}].map(module=><section key={module.number} className="rounded-xl border border-border p-4 space-y-3">
        <h2 className="font-semibold">{module.number}. {t(module.title)}</h2><p className="text-sm">{t(module.description)}</p>
        <p className="text-caption text-fg-secondary">{t('Utilise actuellement l’outil commun de reprise historique. Contrôlez le contenu du fichier avant validation.')}</p>
        <Button asChild variant="secondary"><Link href="/recoltes">{t('Ouvrir la reprise historique')}</Link></Button>
      </section>)}
    </div>
    <section className="rounded-xl border border-border p-4 space-y-3"><h2 className="font-semibold">{t('5. Articles et stock initial')}</h2><p>{t('Un modèle ItriX Farm pour les articles existants et nouveaux, les unités, les entrepôts et l’inventaire à date.')}</p><p className="text-caption text-fg-secondary">{t('Contrôle et synthèse, puis création des articles et initialisation du stock après confirmation serveur. Aucun stock existant n’est écrasé.')}</p>{onStock ? <Button variant="secondary" onClick={onStock}>{t('Préparer les articles et le stock')}</Button> : <Button asChild variant="secondary"><Link href="/stocks/reprise">{t('Préparer les articles et le stock')}</Link></Button>}</section>
    <section className="rounded-xl border border-border p-4 space-y-3"><h2 className="font-semibold">{t('Historique des entrées et sorties')}</h2><p>{t('Importer les mouvements historiques et générer les coûts des consommations après contrôle.')}</p><Button asChild variant="secondary"><Link href="/stocks/historique">{t('Préparer l’historique des stocks')}</Link></Button></section>
    <p className="text-sm">{t('RH, agronomie et finance seront abordés ensuite. Aucun module n’est présenté comme importé sans résultat serveur.')}</p>
    <Button variant="ghost" onClick={onFull}>{t('Accéder au dossier complet existant')}</Button>
  </div>
}
