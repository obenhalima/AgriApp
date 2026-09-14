import { NextResponse } from 'next/server'
export const dynamic='force-dynamic'
export async function GET(){
 let publicKey: string | null = null
 const localReady=!!process.env.VAPID_PRIVATE_KEY&&!!process.env.CRON_SECRET&&process.env.APP_PUBLIC_URL?.startsWith('https://')
 if(localReady) publicKey=process.env.VAPID_PUBLIC_KEY||null
 else if(process.env.NEXT_PUBLIC_SUPABASE_URL){
  try{
   const response=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/mobile-dispatch`,{cache:'no-store',signal:AbortSignal.timeout(8000)})
   if(response.ok){const data=await response.json();if(typeof data.publicKey==='string'&&/^[A-Za-z0-9_-]{87}$/.test(data.publicKey))publicKey=data.publicKey}
  }catch{/* Fail closed: installing and reviewing remain available without push. */}
 }
 return NextResponse.json({publicKey},{headers:{'Cache-Control':'no-store'}})
}
