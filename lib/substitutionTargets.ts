export type SubstitutionOption={id:string;stock:string;name:string;unit:string;target:string;targetId:string}
export function originalSubstitutionTargets(options:SubstitutionOption[],stock?:string|null){
 return stock?Array.from(new Map(options.filter(o=>o.stock===stock).map(o=>[o.targetId,{id:o.targetId,name:o.target}])).values()):[]
}
export function matchingSubstitutions(options:SubstitutionOption[],stock:string|null|undefined,target:string){
 if(!stock||!originalSubstitutionTargets(options,stock).some(t=>t.id===target))return []
 return options.filter(o=>o.stock!==stock&&o.targetId===target)
}
