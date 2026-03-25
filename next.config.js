/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://dlisonvsphybjiyxoymk.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsaXNvbnZzcGh5YmppeXhveW1rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAxODc2MCwiZXhwIjoyMDg5NTk0NzYwfQ.fpBd0uwdGAwRUOSNSmYA4f97haFu4fGiK_8TmWuJfvM',
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000', 'agri-app-orpin.vercel.app'] },
  },
}

module.exports = nextConfig
