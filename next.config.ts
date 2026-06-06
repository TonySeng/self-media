import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  serverExternalPackages: ['playwright'],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: {
      bodySizeLimit: '110mb',
    },
    middlewareClientMaxBodySize: '110mb' as any,
  },
};

export default nextConfig;
