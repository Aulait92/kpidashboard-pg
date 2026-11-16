#!/usr/bin/env node
// Legt für jede Seite aus src/lib/admin-neu/navigation.ts, die noch keine page.tsx hat, eine Platzhalterseite an.
// Bestehende Seiten bleiben unberührt. Aufruf: node tools/admin-neu/platzhalter.mjs

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEITEN } from "../../src/lib/admin-neu/navigation.ts";

const ROOT = join(fileURLToPath(import.meta.url), "../../..");

let neu = 0;
for (const s of SEITEN) {
  const datei = join(ROOT, "src/app", s.pfad.slice(1), "page.tsx");
  if (existsSync(datei)) continue;
  const params = [...s.pfad.matchAll(/\[([a-z]+)\]/gi)].map((m) => m[1]);
  const titel = JSON.stringify(`${s.titel} | performancegrowth Admin`);
  const inhalt = params.length
    ? `import { Platzhalter } from "@/components/admin-neu/ui/platzhalter";

export const metadata = { title: ${titel} };

// Platzhalter (wird gerade gebaut). Ersetzen durch die echte Seite: docs/ux/admin-neu/README.md
export default async function Page({ params }: { params: Promise<{ ${params.map((p) => `${p}: string`).join("; ")} }> }) {
  return <Platzhalter pfad="${s.pfad}" params={await params} />;
}
`
    : `import { Platzhalter } from "@/components/admin-neu/ui/platzhalter";

export const metadata = { title: ${titel} };

// Platzhalter (wird gerade gebaut). Ersetzen durch die echte Seite: docs/ux/admin-neu/README.md
export default function Page() {
  return <Platzhalter pfad="${s.pfad}" />;
}
`;
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, inhalt);
  neu++;
  console.log(`+ ${s.pfad}`);
}
console.log(`${neu} Platzhalter angelegt.`);
