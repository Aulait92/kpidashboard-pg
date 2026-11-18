import { describe, expect, it } from "vitest";
import { metaLeadStand, metaTrichter, naechsterSchritt, zeitraumVon, type MetaLeadDaten } from "@/lib/vertrieb/meta-leads-stand";
import { metaLeadId } from "@/lib/vertrieb/inbound";
import { vertriebLeadText } from "@/lib/vertrieb/lead-meldung";

const now = new Date("2026-11-18T12:00:00Z");
const eingang = new Date("2026-11-10T09:00:00Z");
const tag = (d: number) => new Date(eingang.getTime() + d * 86_400_000);
const basis = (over: Partial<MetaLeadDaten> = {}): MetaLeadDaten => ({ eingang, stage: "INTERESSE", lossReason: null, activities: [], meetings: [], offers: [], ...over });
const anruf = (outcome: string | null, d = 1) => ({ type: "ANRUF", outcome, occurredAt: tag(d) });

describe("Meta-Leads: Stand", () => {
  it("neu ohne Anruf", () => {
    const s = metaLeadStand(basis(), now);
    expect(s.key).toBe("neu");
    expect(s.tiefe).toBe(0);
  });

  it("nicht erreicht mit Zahl der Versuche (nur Anrufe seit dem Eingang)", () => {
    const s = metaLeadStand(basis({ activities: [anruf("Nicht erreicht (Mailbox etc.)", -5), anruf("Nicht erreicht (Mailbox etc.)", 1), anruf("Nicht erreicht (Mailbox etc.)", 2)] }), now);
    expect(s.key).toBe("nicht_erreicht");
    expect(s.versuche).toBe(2);
    expect(s.detail).toBe("2 Versuche");
  });

  it("erreicht nach Rückruf-Ergebnis", () => {
    const s = metaLeadStand(basis({ activities: [anruf("Nicht erreicht (Mailbox etc.)"), anruf("Rückruf / Wiedervorlage", 2)] }), now);
    expect(s.key).toBe("erreicht");
    expect(s.tiefe).toBe(1);
  });

  it("Termin gebucht (kommender Termin) mit Datum", () => {
    const s = metaLeadStand(basis({ stage: "TERMIN", meetings: [{ startAt: new Date("2026-11-20T09:00:00Z"), status: "GEPLANT" }] }), now);
    expect(s.key).toBe("termin");
    expect(s.detail).toBe("20.11., 10:00");
    expect(s.tiefe).toBe(2);
  });

  it("vergangener Termin ohne Ergebnis: Termin, Ergebnis fehlt; abgesagter zählt nicht", () => {
    expect(metaLeadStand(basis({ meetings: [{ startAt: tag(3), status: "GEPLANT" }] }), now).detail).toBe("Ergebnis fehlt");
    expect(metaLeadStand(basis({ meetings: [{ startAt: tag(3), status: "ABGESAGT" }] }), now).key).toBe("neu");
  });

  it("erschienen und nicht erschienen aus dem Ergebnis nach dem Termin", () => {
    const m = [{ startAt: tag(3), status: "GEPLANT" }];
    expect(metaLeadStand(basis({ stage: "TERMIN", meetings: m, activities: [{ type: "TERMIN", outcome: "Termin gehabt, Bedenkzeit", occurredAt: tag(3) }] }), now).key).toBe("erschienen");
    const ne = metaLeadStand(basis({ stage: "TERMIN", meetings: m, activities: [{ type: "TERMIN", outcome: "Termin: nicht erschienen", occurredAt: tag(3) }] }), now);
    expect(ne.key).toBe("nicht_erschienen");
    expect(ne.tiefe).toBe(2);
  });

  it("Angebot verschickt, gewonnen bei angenommenem Angebot oder Stufe", () => {
    expect(metaLeadStand(basis({ offers: [{ status: "sent", sentAt: tag(4), acceptedAt: null }] }), now).key).toBe("angebot");
    const geoeffnet = metaLeadStand(basis({ offers: [{ status: "sent", sentAt: tag(4), acceptedAt: null, viewedAt: tag(5), validUntil: tag(20) }] }), now);
    expect(geoeffnet).toMatchObject({ key: "angebot", detail: "Geöffnet", tiefe: 4 });
    expect(metaLeadStand(basis({ offers: [{ status: "draft", sentAt: null, acceptedAt: null }] }), now).key).toBe("neu");
    const g = metaLeadStand(basis({ offers: [{ status: "accepted", sentAt: tag(4), acceptedAt: tag(5) }] }), now);
    expect(g.key).toBe("gewonnen");
    expect(g.tiefe).toBe(5);
    expect(metaLeadStand(basis({ stage: "GEWONNEN" }), now).key).toBe("gewonnen");
  });

  it("verloren mit Grund, Tiefe bleibt erhalten", () => {
    const v = metaLeadStand(basis({ stage: "VERLOREN", lossReason: "ZU_TEUER", meetings: [{ startAt: tag(3), status: "GEPLANT" }] }), now);
    expect(v.key).toBe("verloren");
    expect(v.detail).toBe("Zu teuer / kein Budget");
    expect(v.tiefe).toBe(2);
    expect(metaLeadStand(basis({ stage: "UNGUELTIG" }), now).detail).toBe("Ungültig");
  });
});

describe("Meta-Leads: Trichter, nächster Schritt, Zeitraum", () => {
  it("Trichter zählt je Schritt alle Leads, die mindestens so weit kamen", () => {
    const t = metaTrichter([{ tiefe: 0 }, { tiefe: 1 }, { tiefe: 2 }, { tiefe: 3 }, { tiefe: 5 }]);
    expect(t.map((x) => `${x.anzahl} ${x.label}`).join(" → ")).toBe("5 Leads → 4 erreicht → 3 Termin → 2 erschienen → 1 Angebot → 1 gewonnen");
  });

  it("nächster Schritt: früheste Aufgabe, rot wenn überfällig oder keiner", () => {
    const heute = { title: "Neuen Meta Ads-Lead anrufen", dueAt: new Date("2026-11-18T08:00:00Z") };
    const gestern = { title: "Erneut anrufen", dueAt: new Date("2026-11-17T08:00:00Z") };
    expect(naechsterSchritt([heute], "neu", now)).toMatchObject({ title: heute.title, rot: false });
    expect(naechsterSchritt([heute, gestern], "neu", now)).toMatchObject({ title: "Erneut anrufen", rot: true });
    expect(naechsterSchritt([], "nicht_erreicht", now)).toMatchObject({ dueAt: null, rot: true });
    expect(naechsterSchritt([], "gewonnen", now).rot).toBe(false);
    expect(naechsterSchritt([], "verloren", now).rot).toBe(false);
  });

  it("Zeitraum: 30 Tage Standard, 90, alle", () => {
    expect(zeitraumVon(undefined, now)).toEqual({ key: "30", seit: new Date(now.getTime() - 30 * 86_400_000) });
    expect(zeitraumVon("90", now).seit).toEqual(new Date(now.getTime() - 90 * 86_400_000));
    expect(zeitraumVon("alle", now).seit).toBeNull();
    expect(zeitraumVon("quatsch", now).key).toBe("30");
  });
});

describe("Meta-Lead-ID und Meldungstext", () => {
  it("Lead-ID nur aus Ziffernfolgen", () => {
    expect(metaLeadId({ leadgen_id: "1234567890123" })).toBe("1234567890123");
    expect(metaLeadId({ id: 1234567890123 })).toBe("1234567890123");
    expect(metaLeadId({ id: "abc-123" })).toBeNull();
    expect(metaLeadId({ id: "12" })).toBeNull();
    expect(metaLeadId(null)).toBeNull();
  });

  it("„Name, Agentur, Ort“ ohne leere Teile", () => {
    expect(vertriebLeadText({ name: "Max Muster", company: "Allianz Muster", city: "Köln" })).toBe("Max Muster, Allianz Muster, Köln");
    expect(vertriebLeadText({ name: "Max Muster", company: null, city: null, zip: "50667" })).toBe("Max Muster, 50667");
    expect(vertriebLeadText({})).toBe("ohne Namen");
  });
});
