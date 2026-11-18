// Angebot als abgelehnt markieren (Ole, 18.11.2026): Regeln ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  ablehnenPruefen,
  ablehnGrundLabel,
  ablehnGruende,
  ablehnGruendeText,
  istAngebotsAufgabe,
  kannWiederOeffnen,
  offenesAngebot,
  statusVorAblehnung,
} from "@/lib/vertrieb/angebot-ablehnen";
import { angebotZustand } from "@/lib/vertrieb/angebote-uebersicht";

const basis = { status: "sent", isTest: false, acceptedAt: null, paymentStatus: "none", stripeSubscriptionId: null, stripeScheduleId: null, zahlweise: null };
const NOW = new Date("2026-11-18T10:00:00Z");

describe("Angebot ablehnen: Regeln", () => {
  it("Entwurf, verschickt und angenommen ohne Zahlung lassen sich ablehnen", () => {
    expect(ablehnenPruefen({ ...basis, status: "draft" }).ok).toBe(true);
    expect(ablehnenPruefen(basis).ok).toBe(true);
    expect(ablehnenPruefen({ ...basis, status: "accepted", acceptedAt: NOW }).ok).toBe(true);
  });

  it("nicht: schon abgelehnt, ersetzt, bezahlt, Lastschrift eingerichtet, Überweisung, angenommenes Testangebot", () => {
    expect(ablehnenPruefen({ ...basis, status: "declined" }).ok).toBe(false);
    expect(ablehnenPruefen({ ...basis, status: "superseded" }).ok).toBe(false);
    expect(ablehnenPruefen({ ...basis, status: "accepted", acceptedAt: NOW, paymentStatus: "paid" }).ok).toBe(false);
    expect(ablehnenPruefen({ ...basis, status: "accepted", acceptedAt: NOW, stripeScheduleId: "sub_sched_1" }).ok).toBe(false);
    expect(ablehnenPruefen({ ...basis, status: "accepted", acceptedAt: NOW, zahlweise: "ueberweisung" }).ok).toBe(false);
    expect(ablehnenPruefen({ ...basis, status: "accepted", acceptedAt: NOW, isTest: true }).ok).toBe(false);
  });

  it("Wieder öffnen nur abgelehnt und solange gültig", () => {
    expect(kannWiederOeffnen({ status: "declined", validUntil: new Date(NOW.getTime() + 60_000) }, NOW)).toBe(true);
    expect(kannWiederOeffnen({ status: "declined", validUntil: new Date(NOW.getTime() - 60_000) }, NOW)).toBe(false);
    expect(kannWiederOeffnen({ status: "sent", validUntil: new Date(NOW.getTime() + 60_000) }, NOW)).toBe(false);
  });

  it("Status davor: Merker, sonst aus den Zeitstempeln", () => {
    expect(statusVorAblehnung({ declinedPrevStatus: "accepted", sentAt: NOW, acceptedAt: NOW })).toBe("accepted");
    expect(statusVorAblehnung({ declinedPrevStatus: null, sentAt: NOW, acceptedAt: null })).toBe("sent");
    expect(statusVorAblehnung({ declinedPrevStatus: null, sentAt: null, acceptedAt: null })).toBe("draft");
  });

  it("offenes Angebot: jüngster Entwurf bzw. verschickt, nicht angenommen", () => {
    const o = (id: string, status: string, tag: number, acceptedAt: Date | null = null) => ({ id, status, acceptedAt, createdAt: new Date(NOW.getTime() + tag * 86_400_000) });
    expect(offenesAngebot([o("a", "sent", 1), o("b", "superseded", 0), o("c", "draft", 2)])?.id).toBe("c");
    expect(offenesAngebot([o("a", "accepted", 1, NOW), o("b", "declined", 2)])).toBeNull();
  });

  it("Aufgaben zum Angebot", () => {
    expect(istAngebotsAufgabe("Nachfassen: Angebot")).toBe(true);
    expect(istAngebotsAufgabe("Zahlung offen: Agentur Muster")).toBe(true);
    expect(istAngebotsAufgabe("Max anrufen: Fragen zum Angebot?")).toBe(true);
    expect(istAngebotsAufgabe("Unterlagen senden")).toBe(false);
  });

  it("Auswertung: Grund × Anzahl, häufigster zuerst, unbekannt = Sonstiges", () => {
    const l = ablehnGruende([
      { status: "declined", declineReason: "ZU_TEUER" },
      { status: "declined", declineReason: "KEIN_BEDARF" },
      { status: "declined", declineReason: "ZU_TEUER" },
      { status: "declined", declineReason: null },
      { status: "sent", declineReason: "ZU_TEUER" },
    ]);
    expect(l.map((g) => [g.grund, g.anzahl])).toEqual([["ZU_TEUER", 2], ["KEIN_BEDARF", 1], ["SONSTIGES", 1]]);
    expect(ablehnGruendeText(l)).toBe("Zu teuer / kein Budget × 2, Kein Bedarf / ausgelastet × 1, Sonstiges × 1");
    expect(ablehnGrundLabel("GIBT_ES_NICHT")).toBe("Sonstiges");
  });

  it("Übersicht: abgelehnt geht vor angenommen (angenommen, nie bezahlt, dann abgelehnt)", () => {
    expect(angebotZustand({ status: "declined", acceptedAt: NOW, viewedAt: NOW, validUntil: NOW, sentAt: NOW }, NOW)).toBe("abgelehnt");
  });
});
