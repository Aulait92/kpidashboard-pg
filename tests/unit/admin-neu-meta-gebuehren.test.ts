// Admin v2, Paket A5: Meta-Gebühren über alle Kunden mit denselben Preisen wie in der Kundenakte.
import { describe, expect, it } from "vitest";
import { betragJeKunde } from "@/lib/admin-neu/meta-gebuehren";
import { priceCounts } from "@/lib/whatsapp/fees";

describe("Meta-Gebühren je Kunde", () => {
  it("rechnet je Kunde wie die Karte in der Kundenakte, ohne Kategorie = Marketing", () => {
    const m = betragJeKunde([
      { kundeId: "a", kategorie: "marketing", anzahl: 10 },
      { kundeId: "a", kategorie: "utility", anzahl: 4 },
      { kundeId: "a", kategorie: null, anzahl: 2 },
      { kundeId: "b", kategorie: "service", anzahl: 3 },
    ]);
    expect(m.get("a")).toEqual({ betrag: priceCounts({ marketing: 12, utility: 4 }).amount, nachrichten: 16 });
    expect(m.get("b")).toEqual({ betrag: priceCounts({ service: 3 }).amount, nachrichten: 3 });
    expect(m.size).toBe(2);
  });
});
