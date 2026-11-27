import { describe, expect, it } from "vitest";
import { notizAnruf } from "@/lib/notiz-anruf";

// Ole, 27.11.2026: echte Notizen aus Lohmanns Team
describe("Anruf-Ergebnis aus Notiz", () => {
  it("nicht erreicht", () => {
    for (const t of ["Nicht erreicht", "tel nicht erreicht", "Tel nicht erreicht", "Mailbox", "AB", "auf AB gesprochen", "geht keiner ran", "nicht rangegangen", "besetzt"]) {
      expect(notizAnruf(t), t).toBe("nicht_erreicht");
    }
  });
  it("falsche Nummer", () => {
    for (const t of ["Rufnummer ungültig", "Rufnummer ist ungültig", "Rufnummer nicht vergeben", "falsche Nummer", "Kein Anschluss unter dieser Nummer", "Falscher VN Anschluss gehört Frau Koll"]) {
      expect(notizAnruf(t), t).toBe("falsche_nummer");
    }
  });
  it("kein Anruf-Ergebnis", () => {
    for (const t of ["Mail gesendet", "erreicht, Termin vereinbart", "gestern nicht erreicht, heute gesprochen, Termin am Montag", "Partner entscheidet mit", "Bündel gewünscht: Wohngebäude, Hausrat", "", "Abschluss Haftpflicht"]) {
      expect(notizAnruf(t), t).toBeNull();
    }
  });
  it("lange Gesprächsnotiz zählt nicht", () => {
    expect(notizAnruf("Kunde wurde letzte Woche mehrfach nicht erreicht, hat heute selbst zurückgerufen und möchte ein Angebot für Hausrat und Haftpflicht, Termin folgt nächste Woche nach Rücksprache mit Partnerin")).toBeNull();
  });
});
