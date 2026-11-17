import { defineConfig } from "vitest/config";
import path from "node:path";

// Klick-Tests (Ole, 17.11.2026): echte Browser-Abläufe gegen einen lokal gestarteten Next-Server und eine
// Wegwerf-Datenbank. Start: `npm run test:e2e` (braucht DATABASE_URL auf eine Test-DB, AUTH_SECRET).
// Keine echten WhatsApp-Nachrichten, Mails oder Zahlungen: Schlüssel dafür sind im Testserver nicht gesetzt
// bzw. Platzhalter, und die Tests klicken nie auf „Zahlung einrichten“.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    globalSetup: ["tests/e2e/server.ts"],
    fileParallelism: false,
    // Der Dev-Server übersetzt jede Seite beim ersten Aufruf: großzügig.
    testTimeout: 240_000,
    hookTimeout: 300_000,
  },
});
