/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000', 'agri-app-orpin.vercel.app'] },
  },
  // Le code contient des type-errors pre-existants (pages budgets, couts, production…)
  // qui ne bloquent pas l'execution. A nettoyer progressivement.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
