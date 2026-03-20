'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<string>('demo')

  useEffect(() => {
    const stored = localStorage.getItem('tomatopilot_profile')
    if (!stored && pathname !== '/login') { router.replace('/login'); return }
    setProfile(stored || 'demo')
    setReady(true)
  }, [pathname, router])

  if (pathname === '/login') return <>{children}</>
  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'#0d1117'}}>
      <div className="flex flex-col items-center gap-3">
        <div className="text-4xl animate-pulse">🍅</div>
        <div className="text-sm text-[#4a5568]">Chargement...</div>
      </div>
    </div>
  )
  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile as 'demo'|'empty'} />
      <div className="flex-1 flex flex-col" style={{marginLeft:'240px'}}>
        <Topbar profile={profile as 'demo'|'empty'} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
