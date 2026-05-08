import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Strict Mode catches side-effects in development
  reactStrictMode: true,

  // Allow tree-shaking of server-only imports in the App Router
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },

  // Redirect /api/health → handled by route handler; just an example
  async redirects() {
    return [];
  },
};

export default nextConfig;
