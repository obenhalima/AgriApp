import { NextResponse, type NextRequest } from 'next/server'

// Middleware ultra-simple : vérifie juste le cookie de session Supabase
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Routes publiques
  if (
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api')
  ) {
    return NextResponse.next()
  }

  // Vérifier si un cookie de session Supabase existe
  const hasSession = request.cookies.getAll().some(c =>
    c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  )

  if (!hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
