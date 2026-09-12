import { NextResponse } from 'next/server'
export const dynamic='force-dynamic'
export function GET(){const ready=!!process.env.VAPID_PRIVATE_KEY&&!!process.env.CRON_SECRET&&process.env.APP_PUBLIC_URL?.startsWith('https://');return NextResponse.json({publicKey:ready?process.env.VAPID_PUBLIC_KEY||null:null},{headers:{'Cache-Control':'no-store'}})}
