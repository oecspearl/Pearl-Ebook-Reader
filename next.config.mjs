/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['jszip'],
  },
  // Ensure proper handling of static files
  trailingSlash: false,
  // Optimize for Vercel
  output: 'standalone',
}

export default nextConfig
