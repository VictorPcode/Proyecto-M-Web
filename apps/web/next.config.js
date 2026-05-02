/** @type {import('next').NextConfig} */
const withTM = require("next-transpile-modules")(["@movi/ui"]);

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@movi/ui"]
};

module.exports = withTM(nextConfig);