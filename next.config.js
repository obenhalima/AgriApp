/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000', 'agri-app-orpin.vercel.app'] },
  },
}

module.exports = nextConfig
