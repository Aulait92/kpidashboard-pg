import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eingangAlter, neuerLeadGrund } from "@/lib/eingang-alter";
import { KEIN_WHATSAPP_REASON } from "@/lib/whatsapp/kein-whatsapp";
import { NEUER_LEAD_REASON } from "@/lib/whatsapp/outreach";
import { FESTNETZ_REASON } from "@/lib/whatsapp/festnetz";

// UX-Runde 19.11.2026 (Team A): Auf „Heute“ zählt bei neuen Leads jede Minute.
describe("eingangAlter", () => {
  const now = new Date("2026-11-19T10:00:00Z");
  const vor = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("Minuten und Stunden statt „heute“", () => {
    expect(eingangAlter(vor(20_000), now)).toBe("gerade eben");
    expect(eingangAlter(vor(4 * 60_000), now)).toBe("vor 4 Min.");
    expect(eingangAlter(vor(59 * 60_000), now)).toBe("vor 59 Min.");
    expect(eingangAlter(vor(2 * 3600_000 + 5 * 60_000), now)).toBe("vor 2 Std.");
  });

  it("Tage wie bisher", () => {
    expect(eingangAlter(vor(25 * 3600_000), now)).toBe("gestern");
    expect(eingangAlter(vor(3 * 86400_000), now)).toBe("vor 3 Tagen");
  });

  it("Zeit in der Zukunft (Uhrzeit des Geräts) gilt als gerade eben", () => {
    expect(eingangAlter(vor(-60_000), now)).toBe("gerade eben");
  });
});

describe("neuerLeadGrund", () => {
  it("kurzer Grund für die Karte „Neue Leads“", () => {
    expect(neuerLeadGrund(KEIN_WHATSAPP_REASON)).toBe("Kein WhatsApp");
    expect(neuerLeadGrund(NEUER_LEAD_REASON)).toBe("Noch nicht kontaktiert");
    expect(neuerLeadGrund(FESTNETZ_REASON)).toBe("Keine Handynummer");
  });
});

describe("Heute: neue Leads oben", () => {
  const src = readFileSync(join(process.cwd(), "src/components/today-inbox.tsx"), "utf8");

  it("eigene Karte vor „Wartet auf Sie“", () => {
    const karte = src.indexOf('title="Neue Leads: jetzt anrufen"');
    expect(karte).toBeGreaterThan(0);
    expect(karte).toBeLessThan(src.indexOf('title="Wartet auf Sie"'));
  });

  it("nur eine Hauptaktion: Anrufliste ist immer zweitrangig (Usability-Check 25.11.2026)", () => {
    expect(src).toContain('<Button variant="secondary" icon={PlayCircle}');
  });
});
