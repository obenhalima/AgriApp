'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  if (isLoginPage) {
    return <main style={{ minHeight: '100vh', background: '#f4f9f4' }}>{children}</main>
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 200 }}>
        <Topbar />
        <main style={{ flex: 1, background: '#f4f9f4' }}>{children}</main>
      </div>
    </div>
  )
}
