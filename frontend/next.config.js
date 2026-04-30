/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for "docker build" to produce a self-contained server in .next/standalone.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  async rewrites() {
    const backend = process.env.NEXT_PUBLIC_API_URL || "https://intelliyash-backend.onrender.com";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

module.exports = nextConfig;
