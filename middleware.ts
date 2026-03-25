import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/login') {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) return NextResponse.next()

  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get: (name: string) => request.cookies.get(name)?.value,
      set: (name: string, value: string, options: Record<string, unknown>) => {
        request.cookies.set({ name, value, ...(options as object) } as Parameters<typeof request.cookies.set>[0])
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value, ...(options as object) } as Parameters<typeof response.cookies.set>[0])
      },
      remove: (name: string, options: Record<string, unknown>) => {
        request.cookies.set({ name, value: '', ...(options as object) } as Parameters<typeof request.cookies.set>[0])
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value: '', ...(options as object) } as Parameters<typeof response.cookies.set>[0])
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}
