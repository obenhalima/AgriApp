import {buildTemplate,type ColumnSpec} from './imports/templateBuilder'

export async function buildEmployeeRecoveryTemplate(context:{domain:string;domainCode:string;domainName:string;farm:{id:string;code:string;name:string};workers:{first_name:string;last_name:string;matricule:string|null}[]}){
  const columns:ColumnSpec[]=[
    {header:'N° source',width:14,numFmt:'@'},
    {header:'Nom',width:30},
    {header:'Prénom (facultatif)',width:25},
    {header:'Tarif horaire normal',width:22,validation:{type:'decimal',min:0,allowBlank:true},numFmt:'0.#########'},
    {header:'Équivalent journalier',width:22,validation:{type:'decimal',min:0,allowBlank:true},numFmt:'0.#########'},
    {header:'Tarif horaire supplémentaire',width:28,validation:{type:'decimal',min:0,allowBlank:true},numFmt:'0.#########'},
    {header:'Taux ancienneté',width:20,validation:{type:'decimal',min:0,max:1,allowBlank:true},numFmt:'0.00%'},
    {header:'Statut',width:16,validation:{type:'list',values:['Actif','Inactif'],allowBlank:true}},
    {header:'Remarques',width:45},
    {header:'CIN',width:20,numFmt:'@'},{header:'N° CNSS',width:20,numFmt:'@'},
    {header:'Téléphone',width:22,numFmt:'@'},{header:'Email',width:30},
    {header:'Date embauche (AAAA-MM-JJ)',width:28,numFmt:'yyyy-mm-dd',validation:{type:'date',allowBlank:true}},
    {header:'Date naissance (AAAA-MM-JJ)',width:28,numFmt:'yyyy-mm-dd',validation:{type:'date',allowBlank:true}},
    {header:'Employé déclaré',width:22,validation:{type:'list',values:['Oui','Non'],allowBlank:true}},
  ]
  return buildTemplate({
    title:`Reprise employés · ${context.domainCode} · ${context.farm.code}`,
    targetSheet:{name:'Employes_Import',columns:columns.map(column=>({...column,headerBg:'0B3D2E'})),dataRowsCount:500},
    instructions:{title:'ItriX Farm — Reprise des employés',lines:[
      `Client : ${context.domainCode} — ${context.domainName}. Ferme : ${context.farm.code} — ${context.farm.name}.`,
      'Complétez Employes_Import, une ligne par employé. Gardez les en-têtes et le contexte du modèle.',
      'Renseignez le nom complet dans Nom. Le prénom est facultatif. Laissez les autres informations inconnues vides.',
      'Les tarifs horaires sont des montants nets en MAD. Le taux d’ancienneté est un pourcentage (par exemple 10 %).',
      'Employé déclaré : Oui ou Non. Une cellule vide est considérée comme Oui.',
      'La colonne Équivalent journalier peut rester vide si cette information est inconnue.',
      'Ref_Employes liste les fiches déjà présentes dans la ferme pour faciliter le contrôle des doublons.',
      'Importez le fichier rempli dans le même client et la même ferme, contrôlez l’aperçu puis validez.',
      'Les fiches existantes sont préservées. Leur modification se fait dans la fiche employé avec les contrôles habituels.',
    ]},
    referenceSheets:[
      {name:'Ref_Ferme',headers:['Client','Code ferme','Nom ferme'],rows:[[context.domainCode,context.farm.code,context.farm.name]],protected:true},
      {name:'Ref_Employes',headers:['Matricule','Nom','Prénom'],rows:context.workers.map(worker=>[worker.matricule,worker.last_name,worker.first_name]),protected:true},
      {name:'_Contexte',headers:['Clé','Valeur'],rows:[['version','3'],['client',context.domain],['ferme',context.farm.id]],hidden:true,protected:true},
    ],
  })
}
