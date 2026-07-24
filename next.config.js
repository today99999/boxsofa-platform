const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

const privateHeaders = [
  ...securityHeaders,
  { key: "Cache-Control", value: "no-store, max-age=0" }
];

/** @type {(phase: string) => import('next').NextConfig} */
module.exports = (phase) => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co"
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com"
      }
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      },
      {
        source: "/assets/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }
        ]
      },
      {
        source: "/api/:path*",
        headers: privateHeaders
      },
      {
        source: "/admin/:path*",
        headers: privateHeaders
      },
      {
        source: "/admin",
        headers: privateHeaders
      },
      {
        source: "/data-center/:path*",
        headers: privateHeaders
      },
      {
        source: "/data-center",
        headers: privateHeaders
      },
      {
        source: "/orders",
        headers: privateHeaders
      },
      {
        source: "/cart",
        headers: privateHeaders
      },
      {
        source: "/login",
        headers: privateHeaders
      }
    ];
  }
});
