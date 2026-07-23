/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // App Service runs `next start`; keep the server runtime (no static export).
  experimental: {
    // Server Actions are GA in 14, but keep body size generous for attachments metadata.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
