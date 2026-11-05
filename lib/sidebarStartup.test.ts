import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('starts expanded on load and on a new login without resetting on navigation', () => {
  const source = readFileSync(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8')
  expect(source).toContain('const [sidebarCollapsed, setSidebarCollapsed] = useState(false)')
  expect(source).toContain('useEffect(() => { setSidebarCollapsed(false) }, [user?.id])')
  expect(source).toContain('marginInlineStart: isDesktop ? sidebarW : 0')
})

it('starts pinned regardless of a previous stored preference and stays viewport-fixed', () => {
  const source = readFileSync(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')
  expect(source).toContain('const [pinned, setPinned] = useState(true)')
  expect(source).not.toContain('tp_sidebar_pinned')
  expect(source).toContain('fixed start-0 top-0 bottom-0')
  expect(source).not.toContain('tp_sidebar_sections')
  expect(source).not.toContain('menuConfig.expanded')
  expect(source).not.toContain('next.add(activeSection)')
  expect(source).toContain('setExpandedSections(new Set())')
})
