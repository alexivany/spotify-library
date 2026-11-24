import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingExcludes: {
    "/*": ["./.env*", "./backups/**/*", "./tmp/**/*", "./.vercel/**/*", "./.claude/**/*", "./.codex/**/*", "./.agents/**/*"],
  },
};

export default nextConfig;
