import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return { id: '/', name: 'FarmPilot', short_name: 'FarmPilot', description: 'Pilotage agricole et validations mobiles',
    start_url: '/validations', scope: '/', display: 'standalone', background_color: '#f8fafc', theme_color: '#166534', lang: 'fr',
    icons: [{ src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }] }
}
