import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    externalDir: true, // import ../shared/*.mjs ได้
    outputFileTracingRoot: path.join(here, '..'), // standalone server อยู่ที่ web/server.js
    serverComponentsExternalPackages: ['pg', 'amqplib', 'bcryptjs'],
  },
};

export default nextConfig;
