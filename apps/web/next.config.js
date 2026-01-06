/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};


const withTM = require("next-transpile-modules")(["ui"]); // nombre de tu package

module.exports = withTM({
  reactStrictMode: true,
});


module.exports = nextConfig;


