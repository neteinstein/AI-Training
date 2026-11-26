import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { EMBED_FRAME_ORIGINS } from "./src/lib/embeds/parse";
import { securityHeaders } from "./src/lib/security/headers";

// Picks up ./src/i18n/request.ts
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
          frameOrigins: EMBED_FRAME_ORIGINS,
          isDevelopment: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
