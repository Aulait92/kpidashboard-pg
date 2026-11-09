import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Pakete, die zur Laufzeit per Node-require ihre nativen Binaries
  // auflösen und deshalb von Turbopack nicht gebundlet werden können —
  // sie bleiben als externes node_modules-Require erhalten.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
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
