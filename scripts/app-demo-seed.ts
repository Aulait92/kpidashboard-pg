// Beispieldaten der App-Demo von Hand neu anlegen (lokal oder zum Prüfen). Im Betrieb macht das die App selbst
// (Start und nachts, src/lib/app-demo/seed.ts). Schreibt NUR in APP_DEMO_DATABASE_URL.
//   APP_DEMO_DATABASE_URL=… DATABASE_URL=… npx vite-node --config vitest.config.ts scripts/app-demo-seed.ts
import { appDemoNeuAnlegen } from "@/lib/app-demo/seed";

appDemoNeuAnlegen()
  .then((r) => {
    console.log(JSON.stringify(r));
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
