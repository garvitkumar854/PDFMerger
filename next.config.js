/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'vercel.app', 'vercel.com'],
    formats: ['image/avif', 'image/webp'],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      '@radix-ui/react-icons',
      'lucide-react',
      'framer-motion',
      'pdf-lib'
    ],
    serverActions: {
      bodySizeLimit: '200mb',
    },
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    maxUploadSize: '200mb',
  },
  webpack: (config, { dev, isServer }) => {
    // Optimize PDF processing in production
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        minimize: true,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          maxSize: 90000,
          cacheGroups: {
            default: false,
            vendors: false,
            framework: {
              chunks: 'all',
              name: 'framework',
              test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|next|pdf-lib)[\\/]/,
              priority: 40,
              enforce: true,
            },
            lib: {
              test: /[\\/]node_modules[\\/]/,
              priority: 30,
              minChunks: 2,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }

    // Add necessary externals
    if (isServer) {
      config.externals = [...(config.externals || []), 'canvas', 'jsdom'];
    }

    // Optimize for large file uploads
    if (isServer) {
      config.experiments = {
        ...config.experiments,
        topLevelAwait: true,
      };
    }

    // Add proper MIME type handling for CSS
    if (!isServer) {
      config.module.rules.push({
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      });
    }

    return config;
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Vercel-specific optimizations
  output: 'standalone',
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;