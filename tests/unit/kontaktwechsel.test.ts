// Usability-Check 25.11.2026 (Datenschutz): Wer auf „Heute“ rechts einen anderen Kontakt öffnet, darf im E-Mail-Fenster
// (und in allen anderen Fenstern) nichts vom vorherigen Kontakt sehen. Die Auswahl wechselt dort nur über den
// Suchparameter; ohne Schlüssel je Kontakt behält React den Zustand (Empfänger, Betreff, Entwurf).
import { describe, expect, it } from "vitest";
import { createElement, isValidElement, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { KontaktRahmen } from "@/components/kontakt-rahmen";

const quelle = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");

/** Nachstellen des Wechsels: React baut einen Teilbaum nur neu auf, wenn sich Typ oder Schlüssel ändern. */
function wirdNeuAufgebaut(vorher: ReactElement, nachher: ReactElement) {
  return vorher.type !== nachher.type || vorher.key !== nachher.key;
}

describe("Kontaktwechsel auf Heute", () => {
  it("der Rahmen trägt den Kontakt als Schlüssel, ein Wechsel baut die Ansicht neu auf", () => {
    const a = KontaktRahmen({ leadId: "lead-a", children: "x" });
    const b = KontaktRahmen({ leadId: "lead-b", children: "x" });
    expect(isValidElement(a) && isValidElement(b)).toBe(true);
    expect(wirdNeuAufgebaut(a, b)).toBe(true);
    // derselbe Kontakt (z. B. nach Neuladen der Daten) behält den Zustand
    expect(wirdNeuAufgebaut(a, KontaktRahmen({ leadId: "lead-a", children: "y" }))).toBe(false);
    // Rahmen auf der Seite selbst ebenfalls mit Schlüssel
    const el1 = createElement(KontaktRahmen, { key: "lead-a", leadId: "lead-a", children: "x" });
    const el2 = createElement(KontaktRahmen, { key: "lead-b", leadId: "lead-b", children: "x" });
    expect(wirdNeuAufgebaut(el1, el2)).toBe(true);
  });

  it("„Heute“ rendert die Kontaktansicht im Rahmen mit Schlüssel je Kontakt", () => {
    const seite = quelle("src/app/buyer/page.tsx");
    expect(seite).toMatch(/<KontaktRahmen key=\{rechts\} leadId=\{rechts\}[^>]*>\s*<LeadDetailBody leadId=\{rechts\}/);
  });

  it("das E-Mail-Fenster hängt zusätzlich am Kontakt (Empfänger kann nicht stehen bleiben)", () => {
    const body = quelle("src/components/lead-detail-body.tsx");
    expect(body).toMatch(/<LeadMailComposer\s+key=\{lead\.id\}/);
  });
});
