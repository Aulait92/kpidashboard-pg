// Bestandskunden-Modul vorerst für Kunden ausgeblendet (Ole, 15.11.2026): sichtbar nur mit Schalter, aktivem Modul
// oder für Admins. Abhängige Stellen: Tipp, Halteangebot „Nur Bestand“, Hilfe, Neuigkeiten.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BESTAND_MODULE_AVAILABLE, bestandVisible, isBestandUpdate } from "@/lib/bestand/sichtbar";
import { offersFor } from "@/lib/anti-churn";
import { candidateTips, type TipSignals } from "@/lib/zahlen-tipps";
import { hilfeKnowledge } from "@/lib/hilfe";

const aus = { existingCustomersEnabled: false, bestandSichtbar: false };

describe("bestandVisible", () => {
  it("vorerst aus: nur mit Schalter, aktivem Modul oder als Admin", () => {
    expect(BESTAND_MODULE_AVAILABLE).toBe(false);
    expect(bestandVisible(aus)).toBe(false);
    expect(bestandVisible(null)).toBe(false);
    expect(bestandVisible({ ...aus, bestandSichtbar: true })).toBe(true);
    expect(bestandVisible({ ...aus, existingCustomersEnabled: true })).toBe(true);
    expect(bestandVisible(aus, { admin: true })).toBe(true);
  });
});

describe("Neuigkeiten zum Modul", () => {
  it("erkennt die Modul-Einträge, lässt andere stehen", () => {
    expect(isBestandUpdate({ id: "upd_2611_bestand_zusatzpakete", title: "Mehr Kampagnen-Nachrichten mit Zusatzpaketen" })).toBe(true);
    expect(isBestandUpdate({ id: "upd_x", title: "Bestand: neue Spalten beim Import" })).toBe(true);
    expect(isBestandUpdate({ id: "upd_y", title: "Was Ihre Bestandskampagnen bringen" })).toBe(true);
    expect(isBestandUpdate({ id: "upd_2611_zahlen_bestand_gewinn", title: "Zahlen: Bestandsprovision und ehrlicher Gewinn" })).toBe(false);
    expect(isBestandUpdate({ id: "upd_2611_vertrag_gekuendigt_gewinn", title: "Gekündigte Verträge eintragen, Gewinn mit künftigem Bestand" })).toBe(false);
  });
});

describe("Halteangebot „Nur Bestand“", () => {
  const enabled = { nur_bestand: true };
  it("nur, wenn der Kunde das Modul sieht", () => {
    expect(offersFor("aufhoeren", { enabled, bestandVisible: true })).toContain("nur_bestand");
    expect(offersFor("aufhoeren", { enabled, bestandVisible: false })).toEqual(["rueckruf"]);
  });
});

describe("Tipp „Bestand nutzen“", () => {
  const s: TipSignals = {
    avgProvision: 200,
    paidLeadsPerMonth: 20,
    closedCustomers: 5,
    empfehlungEnabled: true,
    notAskedForReferral: 0,
    kollegenPraemie: null,
    kollegenEnabled: false,
    bestandImported: false,
    bestandCampaigns: 0,
    withoutCrossSell: 0,
    missingPremium: 0,
    rates: { reach: { own: null, avg: null }, termin: { own: null, avg: null }, close: { own: null, avg: null } },
  };
  it("nur mit sichtbarem Modul", () => {
    expect(candidateTips(s).some((t) => t.key === "bestand")).toBe(false);
    expect(candidateTips({ ...s, bestandVisible: false }).some((t) => t.key === "bestand")).toBe(false);
    expect(candidateTips({ ...s, bestandVisible: true }).some((t) => t.key === "bestand")).toBe(true);
  });
});

describe("KI-Hilfe ohne Modul", () => {
  const md = fs.readFileSync(path.join(process.cwd(), "docs/hilfe.md"), "utf8");
  it("Markierungen sind paarig", () => {
    expect((md.match(/<!-- bestand-modul -->/g) ?? []).length).toBe((md.match(/<!-- \/bestand-modul -->/g) ?? []).length);
  });
  it("ohne Modul: kein Abschnitt Bestand, keine Seite /buyer/bestand, kein Buchen", () => {
    const k = hilfeKnowledge(md, { bestand: false });
    expect(k).not.toContain("## Bestand (Bestandskunden");
    expect(k).not.toContain("/buyer/bestand");
    expect(k).not.toContain("Bestandskunden-Modul");
    expect(k).not.toContain("Nur Bestand");
    expect(k).not.toContain("Kundenliste hochladen");
    expect(k).not.toContain("bestand-modul");
    // Bestandsprovision aus Verträgen bleibt
    expect(k).toContain("Bestandsprovision");
    expect(k).toContain("## Empfehlungen & Bewertungen");
  });
  it("mit Modul: alles drin, ohne Markierungen", () => {
    const k = hilfeKnowledge(md, { bestand: true });
    expect(k).toContain("## Bestand (Bestandskunden, Zusatzmodul)");
    expect(k).toContain("/buyer/bestand");
    expect(k).not.toContain("bestand-modul");
  });
});
