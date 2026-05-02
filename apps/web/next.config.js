/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@movi/ui", "@movi/types"]
};

module.exports = nextConfig;