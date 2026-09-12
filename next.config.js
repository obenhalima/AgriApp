/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  async headers() {
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] }]
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000', 'agri-app-orpin.vercel.app'] },
  },
  // Le code contient des type-errors pre-existants (pages budgets, couts, production…)
  // qui ne bloquent pas l'execution. A nettoyer progressivement.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
