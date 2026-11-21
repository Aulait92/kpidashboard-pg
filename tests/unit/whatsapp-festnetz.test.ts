// Festnetznummern und WhatsApp (lib/whatsapp/festnetz.ts). Seit 21.11.2026 (Ole) kein Vorab-Stopp mehr: Manche
// Festnetznummern haben WhatsApp (z. B. über Superchat). „kein WhatsApp“ vom Status-Webhook markiert mit Grund „festnetz“.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FESTNETZ_REASON, FESTNETZ_VERLAUF } from "@/lib/whatsapp/festnetz";
import { istFestnetz, istMobil } from "@/lib/telefon-typ";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const FESTNETZ = "493012345678"; // Berlin
const MOBIL = "4915112345678";

describe("Art der Nummer", () => {
  it("Festnetz sicher erkannt, Mobil nicht als Festnetz", async () => {
    expect(await istFestnetz(FESTNETZ)).toBe(true);
    expect(await istFestnetz(`+${FESTNETZ}`)).toBe(true);
    expect(await istFestnetz(MOBIL)).toBe(false);
    expect(await istMobil(MOBIL)).toBe(true);
  });

  it("unbekannte bzw. ungültige Nummern sind kein Festnetz", async () => {
    for (const n of [null, undefined, "", "12345", "490000000", "abc", "4930"]) expect(await istFestnetz(n), String(n)).toBe(false);
  });
});

describe("Einbau und Texte", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("Versandwege sperren Festnetznummern nicht mehr vorab (Ole, 21.11.2026)", () => {
    expect(src("src/lib/whatsapp/templates.ts")).not.toContain("pruefeFestnetz(");
    expect(src("src/lib/whatsapp/gateway.ts")).not.toContain("pruefeFestnetz(");
  });

  it("„kein WhatsApp“ an eine Festnetznummer markiert mit Grund „festnetz“", () => {
    const k = src("src/lib/whatsapp/kein-whatsapp.ts");
    expect(k).toMatch(/istFestnetz\(conv\.contactPhone\)/);
    expect(k).toMatch(/markLeadNoWhatsApp\(conv\.leadId, \{ now, code: error\.code, grund \}\)/);
  });

  it("Texte für Vermittler ohne Gedankenstriche", () => {
    expect(FESTNETZ_REASON).toBe("Keine Handynummer: bitte anrufen");
    for (const t of [FESTNETZ_REASON, FESTNETZ_VERLAUF]) expect(hatGedankenstrich(t), t).toBe(false);
  });
});
