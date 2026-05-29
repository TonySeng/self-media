import type { NextConfig } from 'next';

// `output: 'standalone'` is required for the Docker image (Task 20) but breaks
// `pnpm build` on Windows without Developer Mode (EPERM on symlinks). The
// Dockerfile sets `BUILD_STANDALONE=1` so production images still get it.
const nextConfig: NextConfig = {
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
};

export default nextConfig;
