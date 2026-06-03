import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pakete, die zur Laufzeit per Node-require ihre nativen Binaries
  // auflösen und deshalb von Turbopack nicht gebundlet werden können —
  // sie bleiben als externes node_modules-Require erhalten.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
