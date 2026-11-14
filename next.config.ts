import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { securityHeaderRules } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Pakete, die zur Laufzeit per Node-require ihre nativen Binaries
  // auflösen und deshalb von Turbopack nicht gebundlet werden können —
  // sie bleiben als externes node_modules-Require erhalten.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  // Bestandskunden-Import (Excel/CSV mit tausenden Zeilen) per Server Action
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  // Kein „X-Powered-By: Next.js“ (verrät unnötig den Technik-Stack)
  poweredByHeader: false,
  // Marketing hat eigene Seiten (Ole, 14.11.2026): alte Vertriebs-Adressen weiterleiten (Push-Links, Lesezeichen)
  async redirects() {
    return ["linkedin", "empfehlungen", "unterlagen"].map((p) => ({
      source: `/admin/vertrieb/${p}/:rest*`,
      destination: `/admin/marketing/${p}/:rest*`,
      permanent: false,
    }));
  },
  // Sicherheits-Header für alle Antworten (src/lib/security-headers.ts).
  // CSP zunächst nur „Report-Only“; erzwingen mit CSP_ENFORCE=on (zur Build-Zeit).
  async headers() {
    return securityHeaderRules({
      dev: process.env.NODE_ENV === "development",
      enforceCsp: process.env.CSP_ENFORCE === "on",
    });
  },
};

export default withSentryConfig(nextConfig, {
  org: "ole-kannapinn-ug",
  project: process.env.SENTRY_PROJECT ?? "kpidashboard-pg",
  // Source-Map-Upload nur, wenn SENTRY_AUTH_TOKEN beim Build gesetzt ist.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Leitet Sentry-Requests über die eigene Domain, damit Adblocker sie nicht blockieren.
  tunnelRoute: "/monitoring",
});
