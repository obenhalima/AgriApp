'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { applyTheme, getTheme } from '@/lib/theme'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [authed,   setAuthed]   = useState(false)

  useEffect(() => {
    // Appliquer le thème sauvegardé immédiatement
    applyTheme(getTheme())

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthed(true)
        if (pathname === '/login') router.replace('/')
      } else {
        setAuthed(false)
        if (pathname !== '/login') router.replace('/login')
      }
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthed(true)
        if (pathname === '/login') router.replace('/')
      } else {
        setAuthed(false)
        if (pathname !== '/login') router.replace('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  if (checking) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--bg-deep)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
        <div style={{ width:44, height:44, border:'2px solid var(--border)', borderTop:'2px solid var(--neon)', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--tx-3)', letterSpacing:2 }}>INITIALISATION...</div>
      </div>
    )
  }

  if (pathname === '/login' || !authed) return <>{children}</>

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar />
      <div style={{ flex:1, display:'flex', flexDirection:'column', marginLeft:'var(--sidebar-w)', minHeight:'100vh' }}>
        <Topbar />
        <main style={{ flex:1, padding:'22px 24px', position:'relative', zIndex:1 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
