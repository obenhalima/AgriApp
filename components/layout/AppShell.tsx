'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { applyTheme, getTheme } from '@/lib/theme'
import { useAuth } from '@/lib/auth'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const [sidebarW, setSidebarW] = useState(220)

  // Theme + sidebar
  useEffect(() => {
    applyTheme(getTheme())
    const onSidebarChange = (e: any) => {
      const { collapsed } = e.detail
      setSidebarW(collapsed ? 60 : 220)
    }
    window.addEventListener('sidebar-change', onSidebarChange)
    const saved = localStorage.getItem('tp_sidebar_collapsed') === 'true'
    setSidebarW(saved ? 60 : 220)
    return () => window.removeEventListener('sidebar-change', onSidebarChange)
  }, [])

  // Redirections basées sur l'auth
  useEffect(() => {
    if (loading) return
    if (!user && pathname !== '/login') {
      router.replace('/login')
    } else if (user && pathname === '/login') {
      router.replace('/')
    }
  }, [loading, user, pathname, router])

  // Pendant le chargement de la session
  if (loading) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--bg-deep)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
        <div style={{ width:40, height:40, border:'2px solid var(--border)', borderTop:'2px solid var(--neon)', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--tx-3)', letterSpacing:2 }}>INITIALISATION...</div>
      </div>
    )
  }

  // Page login ou pas authentifié → rend juste les children (login)
  if (pathname === '/login' || !user) return <>{children}</>

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
