import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "pdfkit", "exceljs", "unpdf", "sharp"],

  // Large AI attach payloads (many PDFs / scans) need room past the default ~10MB proxy buffer.
  experimental: {
    proxyClientMaxBodySize: "80mb",
    serverActions: {
      bodySizeLimit: "80mb",
    },
  },

  // Ensure pilot Help markdown ships with the server bundle (P4-11).
  outputFileTracingIncludes: {
    "/help/[slug]": ["./docs/user/**/*"],
    "/(platform)/help/[slug]": ["./docs/user/**/*"],
    "/*": ["./docs/user/**/*", "./assets/fonts/**/*"],
    "/api/exports/*": ["./assets/fonts/**/*"],
  },

  // Baseline hardening (P5-13) plus opener isolation and a report-only CSP.
  async headers() {
    const cspReportOnly = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
          },
          // Safe when the app is always served over HTTPS (Railway + custom domain).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: cspReportOnly,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
