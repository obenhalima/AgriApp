'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_GROUPS } from '@/lib/modules'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

export function Sidebar() {
  const pathname = usePathname()
  const [allowedModules, setAllowedModules] = useState<Set<string> | null>(null)

  useEffect(() => {
    let active = true

    async function loadAccess() {
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase
        .from('user_module_access')
        .select('module_key')
        .eq('can_access', true)

      if (!active) {
        return
      }

      if (error) {
        setAllowedModules(new Set(['dashboard']))
        return
      }

      setAllowedModules(new Set(['dashboard', ...(data ?? []).map((item) => item.module_key)]))
    }

    if (pathname !== '/login') {
      void loadAccess()
    }

    return () => {
      active = false
    }
  }, [pathname])

  if (pathname === '/login') {
    return null
  }

  const navGroups = useMemo(() => {
    if (!allowedModules) {
      return NAV_GROUPS
    }

    return NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => allowedModules.has(item.moduleKey)),
      }))
      .filter((group) => group.items.length > 0)
  }, [allowedModules])

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 50,
        width: 200,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        background: '#1b3a2d',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
        <div
          style={{
            width: 32,
            height: 32,
            background: '#40916c',
            borderRadius: '50% 8px 50% 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          T
        </div>
        <div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 14, color: '#fff', lineHeight: 1.2 }}>
            TomatoPilot
          </div>
          <div style={{ fontSize: 10, color: '#74c69d', fontWeight: 600, marginTop: 1 }}>
            Acces modules
          </div>
        </div>
      </div>

      <div style={{ flex: 1, paddingTop: 8 }}>
        {navGroups.map((group, groupIndex) => (
          <div key={groupIndex} style={{ marginBottom: 4 }}>
            {group.section && (
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '1.2px', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', padding: '8px 16px 3px' }}>
                {group.section}
              </div>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? 'nav-item active-nav' : 'nav-item'}
                  style={{ textDecoration: 'none' }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.7, flexShrink: 0, display: 'block' }} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.09)' }}>
        <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.78)' }}>
          Session securisee
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>
          Navigation selon vos droits
        </div>
      </div>
    </aside>
  )
}
