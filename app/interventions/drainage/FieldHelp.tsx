'use client'
import {useId,useState} from 'react'

const explanations:Record<string,string>={
 'Ferme':'Choisissez la ferme du client actif. Les serres proposées appartiennent à cette ferme. Changer de ferme conserve le brouillon local de la feuille précédente.',
 'Date':'Date de la journée de mesure. Chaque journée possède sa feuille. Les heures des relevés sont celles de Casablanca.',
 'Volumes':'Unité des deux volumes : goutteur et drain. Choisissez mL ou L selon votre récipient. Ce choix concerne les nouveaux relevés ; il ne convertit pas les valeurs déjà saisies.',
 'Serre':'Choisissez la serre suivie. Seuls ses relevés de la journée et son bilan sont affichés. Vous pouvez ajouter plusieurs horaires.',
 'Coefficient de collecte':'Facteur permettant de comparer les deux volumes sur une même base de collecte. Calcul actuel : D (%) = 100 × volume drain / (volume goutteur × coefficient). Sa valeur doit être confirmée selon le dispositif réel par les experts ; aucune valeur par défaut n’est supposée. Sans coefficient positif applicable, les mesures sont conservées mais D (%) reste non calculé.',
 'Applicable à partir du':'Date et heure de prise d’effet du coefficient, pas date du relevé. Le coefficient doit être applicable à l’heure mesurée. Il est conservé avec chaque nouvelle ligne ; changer ce champ ne recalcule pas les anciennes lignes avec le nouveau coefficient.',
 'Instrument EC':'Nom ou identifiant du conductimètre utilisé, par exemple EC-01. Ce champ facultatif sert à retrouver l’appareil utilisé pour les mesures ; il ne modifie pas le calcul du drainage.',
 'Dernier étalonnage EC':'Date du dernier étalonnage effectivement réalisé sur le conductimètre. Champ facultatif de traçabilité : ne renseignez pas une date supposée. La fréquence de contrôle reste à définir avec les experts.',
 'Instrument pH':'Nom ou identifiant du pH-mètre utilisé, par exemple PH-01. Champ facultatif de traçabilité, sans effet sur le calcul du drainage.',
 'Dernier étalonnage pH':'Date du dernier étalonnage effectivement réalisé sur le pH-mètre. Champ facultatif : laissez vide si elle est inconnue. La fréquence de contrôle reste à définir avec les experts.',
 'Heure':'Heure du relevé pendant la journée sélectionnée, en heure de Casablanca. Renseignez l’heure réellement observée.',
 'Volume goutteur':'Volume mesuré au goutteur pour l’intervalle de collecte, dans l’unité choisie. Ne saisissez pas un cumul de la journée. Un volume nul ne permet pas de calculer le rapport de drainage.',
 'EC goutteur':'Conductivité électrique mesurée dans la solution au goutteur, en dS/m. Saisissez la mesure de l’appareil, pas une consigne. Une case vide signifie que la mesure n’est pas renseignée.',
 'pH goutteur':'pH mesuré dans la solution au goutteur. Saisissez la mesure, pas une consigne ; laissez vide si elle n’a pas été prise.',
 'Volume drain':'Volume de drainage collecté pour le même intervalle que le volume goutteur. Saisissez 0 si l’absence de drainage a été constatée ; laissez vide si le volume n’a pas été mesuré.',
 'EC drain':'Conductivité électrique mesurée dans le drainage, en dS/m. En l’absence de drain, laissez ce champ vide : ne saisissez pas zéro pour remplacer une mesure impossible.',
 'pH drain':'pH mesuré dans le drainage. En l’absence de drain, laissez vide ; zéro ne signifie pas absence de mesure.',
 'D (%)':'Pourcentage de drainage relevé sur le terrain, saisi manuellement. Aucun calcul à partir des volumes ou du coefficient n’est effectué. Saisissez 0 si le drainage est nul et laissez vide si inconnu. Les anciens pourcentages calculés ne deviennent pas automatiquement des valeurs saisies. La synthèse affiche le dernier pourcentage saisi avec un horaire valide, pas une moyenne journalière.',
 'Relevé':'Mesuré : renseignez les mesures disponibles. Non effectué : aucune mesure n’a été réalisée à cet horaire ; la ligne est exclue du bilan. Ce statut est différent d’un drainage mesuré égal à zéro.'
}
export function FieldHelp({name}:{name:string}){
 const [open,setOpen]=useState(false),id=useId()
 return <span className="inline font-normal normal-case tracking-normal">
  <button type="button" aria-label={`Aide : ${name}`} aria-expanded={open} aria-controls={id} className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-brand/30 text-brand text-xs focus-visible:outline focus-visible:outline-2" onClick={e=>{e.preventDefault();e.stopPropagation();setOpen(v=>!v)}}>?</button>
  <span id={id} hidden={!open} className={`${open?'block':'hidden'} whitespace-normal rounded-md border border-brand/20 bg-brand/5 p-2 my-2 text-xs text-fg-secondary leading-relaxed`}>{explanations[name]}</span>
 </span>
}
