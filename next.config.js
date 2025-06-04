/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true
  },
  poweredByHeader: false,
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    optimizePackageImports: ['@radix-ui/react-icons', 'lucide-react']
  }
}

module.exports = nextConfig