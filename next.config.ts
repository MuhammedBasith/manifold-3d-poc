import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Handle WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Exclude manifold-3d from server-side rendering
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'manifold-3d': false,
      };
    } else {
      // Client-side: provide polyfills for Node.js modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        module: false,
        url: false,
      };
    }

    return config;
  },
};

export default nextConfig;
