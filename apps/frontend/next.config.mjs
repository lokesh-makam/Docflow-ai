/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@docflow/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
