import { NextResponse } from 'next/server'
export const dynamic='force-dynamic'
export async function POST(req:Request){
 const authorization=req.headers.get('authorization')||''
 if(!authorization.startsWith('Bearer '))return NextResponse.json({error:'Connectez-vous de nouveau.'},{status:401})
 try{
  const body=await req.json()
  if(typeof body.endpoint!=='string'||body.endpoint.length>4096||typeof body.domain!=='string'||!process.env.NEXT_PUBLIC_SUPABASE_URL)return NextResponse.json({error:'Téléphone ou client non renseigné.'},{status:400})
  const response=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/mobile-dispatch?action=test`,{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify({endpoint:body.endpoint,domain:body.domain}),signal:AbortSignal.timeout(20000),cache:'no-store'})
  const result=await response.json()
  return NextResponse.json(result,{status:response.status,headers:{'Cache-Control':'no-store'}})
 }catch{return NextResponse.json({error:'Le serveur ne répond pas. Résultat de livraison inconnu ; attendez une minute avant de réessayer.'},{status:503})}
}
