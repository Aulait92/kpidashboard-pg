import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// scripts/migrate.mjs misst eine leere Datenbank aus dem Prisma-Schema ein und trägt die Migrationen nur als angewendet
// ein. Trigger stehen nicht im Schema: Jeder Trigger muss deshalb (auch) in einer Migration mit „-- @auch-beim-einmessen“
// angelegt werden, sonst fehlt er in CI und neuen Umgebungen (Fall PolicenNachweis, 18.11.2026).
const dir = path.join(process.cwd(), "prisma", "migrations");
const dateien = readdirSync(dir)
  .filter((n) => statSync(path.join(dir, n)).isDirectory())
  .map((n) => ({ name: n, sql: readFileSync(path.join(dir, n, "migration.sql"), "utf8") }));

const trigger = (sql: string) => [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?([A-Za-z0-9_]+)"?/gi)].map((m) => m[1]);

describe("Migrationen: Trigger auch beim Einmessen", () => {
  it("jeder Trigger wird in einer Migration mit @auch-beim-einmessen angelegt", () => {
    const markiert = new Set(dateien.filter((d) => d.sql.includes("-- @auch-beim-einmessen")).flatMap((d) => trigger(d.sql)));
    const fehlend = dateien.flatMap((d) => trigger(d.sql).filter((t) => !markiert.has(t)).map((t) => `${d.name}: ${t}`));
    expect(fehlend).toEqual([]);
  });
});
