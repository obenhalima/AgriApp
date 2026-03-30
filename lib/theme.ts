
export type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem('tp_theme') as Theme) || 'dark'
}

export function setTheme(t: Theme) {
  localStorage.setItem('tp_theme', t)
  applyTheme(t)
}

export function applyTheme(t: Theme) {
  const html = document.documentElement
  if (t === 'light') {
    html.setAttribute('data-theme', 'light')
  } else {
    html.removeAttribute('data-theme')
  }
}
