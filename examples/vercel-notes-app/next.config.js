/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['workersql'],
  },
};

module.exports = nextConfig;
