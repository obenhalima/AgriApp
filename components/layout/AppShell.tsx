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
  const [checking,   setChecking]   = useState(true)
  const [authed,     setAuthed]     = useState(false)
  const [sidebarW,   setSidebarW]   = useState(220)

  useEffect(() => {
    applyTheme(getTheme())

    // Écouter les changements de sidebar
    const onSidebarChange = (e: any) => {
      const { collapsed } = e.detail
      setSidebarW(collapsed ? 60 : 220)
    }
    window.addEventListener('sidebar-change', onSidebarChange)

    // Restaurer l'état depuis localStorage
    const saved = localStorage.getItem('tp_sidebar_collapsed') === 'true'
    setSidebarW(saved ? 60 : 220)

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

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('sidebar-change', onSidebarChange)
    }
  }, [pathname, router])

  if (checking) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--bg-deep)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
        <div style={{ width:40, height:40, border:'2px solid var(--border)', borderTop:'2px solid var(--neon)', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--tx-3)', letterSpacing:2 }}>INITIALISATION...</div>
      </div>
    )
  }

  if (pathname === '/login' || !authed) return <>{children}</>

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg-base)', transition:'background .3s' }}>
      <Sidebar />
      <div style={{ flex:1, display:'flex', flexDirection:'column', marginLeft: sidebarW, minHeight:'100vh', transition:'margin-left .25s cubic-bezier(.4,0,.2,1)' }}>
        <Topbar />
        <main style={{ flex:1, padding:'20px 22px', position:'relative', zIndex:1, background:'var(--bg-base)', transition:'background .3s' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
