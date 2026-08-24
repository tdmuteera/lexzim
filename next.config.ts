import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "pdfkit", "exceljs"],

  // Ensure pilot Help markdown ships with the server bundle (P4-11).
  outputFileTracingIncludes: {
    "/help/[slug]": ["./docs/user/**/*"],
    "/(platform)/help/[slug]": ["./docs/user/**/*"],
    "/*": ["./docs/user/**/*", "./assets/fonts/**/*"],
    "/api/exports/*": ["./assets/fonts/**/*"],
  },

  // Baseline hardening (P5-13). CSP deferred (report-only / tighten later).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Safe when the app is always served over HTTPS (Railway + custom domain).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
