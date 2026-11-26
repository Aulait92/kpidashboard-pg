import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit-Tests: tests/unit (ohne Datenbank). Integrationstests: tests/integration
// (brauchen DATABASE_URL auf eine Wegwerf-Datenbank; in der CI ein Postgres-Container).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integrationstests teilen sich eine Datenbank → nacheinander ausführen.
    fileParallelism: false,
    testTimeout: 30_000,
    // Fragen-Engine der Terminvorbereitung (lib/vorbereitung) ist im Betrieb an; in Tests aus, außer der Test schaltet
    // sie ein (tests/integration/buchung-vorbereitung.test.ts), damit die übrigen Strecken-Tests unverändert bleiben.
    env: { VORBEREITUNG_FRAGEN: "0" },
  },
});
