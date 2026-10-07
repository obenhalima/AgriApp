import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'
export default function manifest(): MetadataRoute.Manifest {
  return { id: '/', name: BRAND.name, short_name: BRAND.name, description: 'Pilotage agricole et validations mobiles',
    start_url: '/validations', scope: '/', display: 'standalone', background_color: BRAND.background, theme_color: BRAND.forest, lang: 'fr',
    icons: [{ src: '/pwa/icon-192.png?v=itrix', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/pwa/icon-512.png?v=itrix', sizes: '512x512', type: 'image/png', purpose: 'any' }] }
}
