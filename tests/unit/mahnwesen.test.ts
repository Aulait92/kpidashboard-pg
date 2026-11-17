// Mahnwesen und Überweisung nur auf Anfrage (Ole, 17.11.2026): Schalter, Checkout-Arten, Mahnstufen, Texte und
// Bankabgleich (reine Funktionen, lib/mahnwesen.ts und lib/zahlart.ts).
import { describe, expect, it } from "vitest";
import {
  bankAbgleich,
  jetztAusfuehren,
  mahnStoppGrund,
  mahnText,
  mahnwesenAktiv,
  naechsteStufe,
  normNummer,
  parseZahlungsziel,
  RECHNUNG_FAELLIG_BODY,
  RECHNUNG_FEHLGESCHLAGEN_BODY,
  anrufAufgabe,
  artVonRechnung,
  tagDatum,
  type FallZustand,
} from "@/lib/mahnwesen";
import { allowedPaymentMethodTypes, parseZahlart } from "@/lib/zahlart";
import { erinnerungGestoppt, zahlungEingerichtet } from "@/lib/angebot-zahlungserinnerung";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

// 10:00 Berlin an einem Tag (Winterzeit: 09:00 UTC)
const um10 = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe("Schalter", () => {
  it("Mahnwesen nur mit MAHNWESEN=on", () => {
    expect(mahnwesenAktiv({})).toBe(false);
    expect(mahnwesenAktiv({ MAHNWESEN: "1" })).toBe(false);
    expect(mahnwesenAktiv({ MAHNWESEN: "on" })).toBe(true);
  });
  it("Zahlungsziel: Standard 14, sonst 7 bis 30 Tage", () => {
    expect(parseZahlungsziel(undefined)).toBe(14);
    expect(parseZahlungsziel("")).toBe(14);
    expect(parseZahlungsziel("abc")).toBe(14);
    expect(parseZahlungsziel("10")).toBe(10);
    expect(parseZahlungsziel(3)).toBe(7);
    expect(parseZahlungsziel(90)).toBe(30);
  });
  it("Stopp je Kunde und Testkunden", () => {
    expect(mahnStoppGrund({ mahnStopp: false, isTest: false })).toBeNull();
    expect(mahnStoppGrund({ mahnStopp: true })).toMatch(/gestoppt/);
    expect(mahnStoppGrund({ isTest: true })).toBe("Testkunde");
  });
});

describe("Checkout-Arten", () => {
  it("ohne Freigabe: Überweisung wird zur Lastschrift, Checkout nur Lastschrift und Karte", () => {
    expect(parseZahlart("ueberweisung")).toBe("sepa");
    expect(parseZahlart("ueberweisung", { ueberweisung: false })).toBe("sepa");
    expect(parseZahlart("card")).toBe("card");
    expect(parseZahlart(undefined)).toBe("sepa");
    expect(allowedPaymentMethodTypes(null)).toEqual(["sepa_debit", "card"]);
    expect(allowedPaymentMethodTypes("sepa")).toEqual(["sepa_debit"]);
    expect(allowedPaymentMethodTypes("card")).toEqual(["card"]);
  });
  it("mit Freigabe: zusätzlich „Per Überweisung zahlen“ (kein Checkout, Rechnung)", () => {
    expect(parseZahlart("ueberweisung", { ueberweisung: true })).toBe("ueberweisung");
    // Falls doch an Checkout gegeben: nie customer_balance, nur die üblichen Arten
    expect(allowedPaymentMethodTypes("ueberweisung")).toEqual(["sepa_debit", "card"]);
  });
  it("Überweisung gewählt stoppt die Zahlungserinnerung „Zahlung einrichten“ zum Angebot", () => {
    const o = {
      status: "accepted",
      isTest: false,
      paymentStatus: "none",
      acceptedAt: new Date("2026-11-10T10:00:00Z"),
      startDate: null,
      paymentReminderAt: null,
      paymentReminderCount: 0,
      paymentReminderLastAt: null,
      stripeSubscriptionId: null,
      stripeScheduleId: null,
    };
    expect(erinnerungGestoppt(o)).toBeNull();
    expect(zahlungEingerichtet({ ...o, zahlweise: "ueberweisung" })).toBe(true);
    expect(erinnerungGestoppt({ ...o, zahlweise: "ueberweisung" })).toBe("Zahlung eingerichtet");
  });
  it("Art aus der Stripe-Rechnung", () => {
    expect(artVonRechnung("send_invoice")).toBe("ueberweisung");
    expect(artVonRechnung("charge_automatically", "sepa_debit")).toBe("lastschrift");
    expect(artVonRechnung("charge_automatically", "card")).toBe("karte");
    expect(artVonRechnung("charge_automatically", null)).toBe("sonstige");
  });
});

describe("Mahnstufen", () => {
  const ueberweisung = (p: Partial<FallZustand> = {}): FallZustand => ({ art: "ueberweisung", status: "offen", stufe: 0, dueDate: tagDatum("2026-12-01"), letzteMailAt: null, ...p });

  it("Überweisung: Erinnerung 3 Tage vorher, Fälligkeitstag, +7, +14, +21", () => {
    const plan: [number, string, string][] = [
      [0, "erinnerung", "2026-11-28"],
      [1, "faellig", "2026-12-01"],
      [2, "mahnung1", "2026-12-08"],
      [3, "mahnung2", "2026-12-15"],
      [4, "anruf", "2026-12-22"],
    ];
    for (const [stufe, key, tag] of plan) {
      const n = naechsteStufe(ueberweisung({ stufe, letzteMailAt: stufe > 0 ? um10("2026-11-20") : null }), um10("2026-11-20"));
      expect(n?.stufe.key).toBe(key);
      expect(n?.tag).toBe(tag);
    }
    expect(naechsteStufe(ueberweisung({ stufe: 5 }), um10("2027-01-01"))).toBeNull();
  });

  it("vor dem Tag nichts, am Tag im Versandfenster ja, nachts nicht", () => {
    const f = ueberweisung();
    expect(jetztAusfuehren(naechsteStufe(f, um10("2026-11-27")), um10("2026-11-27"))).toBe(false);
    expect(jetztAusfuehren(naechsteStufe(f, um10("2026-11-28")), um10("2026-11-28"))).toBe(true);
    const nachts = new Date("2026-11-28T22:00:00Z");
    expect(jetztAusfuehren(naechsteStufe(f, nachts), nachts)).toBe(false);
  });

  it("Lastschrift/Karte fehlgeschlagen: keine Erinnerung vorab, Zahlungserinnerung am Tag des Fehlschlags", () => {
    const f: FallZustand = { art: "lastschrift", status: "offen", stufe: 0, dueDate: tagDatum("2026-12-01"), letzteMailAt: null };
    const n = naechsteStufe(f, um10("2026-12-01"));
    expect(n?.stufe.key).toBe("faellig");
    expect(n?.tag).toBe("2026-12-01");
  });

  it("spät erkannt: keine Mahnung vor der Zahlungserinnerung, mindestens 3 Tage Abstand", () => {
    // Fall erst 10 Tage nach Fälligkeit angelegt: zuerst die Zahlungserinnerung (Erinnerung vorab entfällt)
    const f = ueberweisung();
    expect(naechsteStufe(f, um10("2026-12-11"))?.stufe.key).toBe("faellig");
    // Danach 1. Mahnung nicht sofort, sondern frühestens 3 Tage später
    const n = naechsteStufe(ueberweisung({ stufe: 2, letzteMailAt: um10("2026-12-11") }), um10("2026-12-12"));
    expect(n?.stufe.key).toBe("mahnung1");
    expect(n?.tag).toBe("2026-12-14");
    expect(jetztAusfuehren(n, um10("2026-12-12"))).toBe(false);
  });

  it("Abbruch: bezahlt, geschlossen oder gestoppt → keine Stufe mehr", () => {
    expect(naechsteStufe(ueberweisung({ status: "bezahlt" }), um10("2026-12-08"))).toBeNull();
    expect(naechsteStufe(ueberweisung({ status: "geschlossen" }), um10("2026-12-08"))).toBeNull();
    expect(naechsteStufe(ueberweisung(), um10("2026-12-08"), { gestoppt: true })).toBeNull();
  });
});

describe("Texte", () => {
  const i = { nummer: "PG-1-0007", betragCent: 141610, dueDate: tagDatum("2026-12-01"), now: um10("2026-12-08") };
  const alle = [
    mahnText("erinnerung", { ...i, art: "ueberweisung" }),
    mahnText("faellig", { ...i, art: "ueberweisung" }),
    mahnText("faellig", { ...i, art: "lastschrift" }),
    mahnText("mahnung1", { ...i, art: "ueberweisung" }),
    mahnText("mahnung2", { ...i, art: "karte" }),
  ];
  it("ohne Gedankenstriche, Sie-Form, ohne „Garantie“", () => {
    const texte = [...alle.flatMap((t) => [t.subject, ...t.paragraphs, t.button]), RECHNUNG_FAELLIG_BODY, RECHNUNG_FEHLGESCHLAGEN_BODY, anrufAufgabe({ kunde: "X", ...i }).note];
    for (const t of texte) {
      expect(hatGedankenstrich(t), t).toBe(false);
      expect(t).not.toMatch(/\b(du|dein|deine|dir|dich)\b/i);
      expect(t).not.toMatch(/garantie/i);
    }
  });
  it("Betrag, Nummer und Fälligkeit stehen drin; Mahnung mit Frist 7 Tage", () => {
    expect(alle[1].paragraphs[0]).toContain("1.416,10");
    expect(alle[3].subject).toBe("1. Mahnung: Rechnung PG-1-0007");
    expect(alle[3].paragraphs[1]).toContain("15.12.2026");
    expect(alle[4].subject).toBe("2. Mahnung: Rechnung PG-1-0007");
    // Verwendungszweck nur bei Überweisung
    expect(alle[4].paragraphs.join(" ")).not.toContain("Verwendungszweck");
  });
  it("WhatsApp-Vorlagen: Absender Ole Kannapinn", () => {
    expect(RECHNUNG_FAELLIG_BODY).toMatch(/Ole Kannapinn$/);
    expect(RECHNUNG_FEHLGESCHLAGEN_BODY).toMatch(/Ole Kannapinn$/);
  });
});

describe("Bankabgleich", () => {
  const faelle = [
    { id: "a", amountDue: 141610, invoiceNumber: "PG1A2B3C-0007", kunde: "Versicherungsbüro Weber GmbH" },
    { id: "b", amountDue: 117810, invoiceNumber: "PG1A2B3C-0008", kunde: "Agentur Schulz" },
    { id: "c", amountDue: 117810, invoiceNumber: "PG1A2B3C-0009", kunde: "Generalagentur Becker" },
  ];
  it("eindeutig: Betrag und Rechnungsnummer (Schreibweise egal)", () => {
    expect(bankAbgleich({ amount: 1416.1, purpose: "Rechnung PG1A2B3C 0007 danke" }, faelle)).toEqual({ eindeutig: "a", vorschlaege: [] });
    expect(normNummer("pg1a2b3c-0007")).toBe("PG1A2B3C0007");
  });
  it("unsicher: Nummer passt, Betrag nicht → Vorschlag", () => {
    const r = bankAbgleich({ amount: 1000, purpose: "PG1A2B3C-0007 Teilzahlung" }, faelle);
    expect(r.eindeutig).toBeNull();
    expect(r.vorschlaege).toEqual([{ id: "a", grund: expect.stringMatching(/Rechnungsnummer passt/) }]);
  });
  it("unsicher: nur Betrag, aber Name passt bzw. Betrag einmalig → Vorschlag; mehrdeutig ohne Name → nichts", () => {
    expect(bankAbgleich({ amount: 1178.1, counterparty: "Schulz, Peter", purpose: "Monatsrechnung" }, faelle).vorschlaege.map((v) => v.id)).toEqual(["b"]);
    expect(bankAbgleich({ amount: 1416.1, purpose: "Danke" }, faelle).vorschlaege.map((v) => v.id)).toEqual(["a"]);
    expect(bankAbgleich({ amount: 1178.1, purpose: "Danke" }, faelle).vorschlaege).toEqual([]);
  });
  it("Ausgaben und Fremdbeträge ignorieren", () => {
    expect(bankAbgleich({ amount: -1416.1, purpose: "PG1A2B3C-0007" }, faelle)).toEqual({ eindeutig: null, vorschlaege: [] });
    expect(bankAbgleich({ amount: 55, purpose: "Miete" }, faelle)).toEqual({ eindeutig: null, vorschlaege: [] });
  });
});

describe("Überweisung einzeln freischalten (UEBERWEISUNG=on, Fall Anid)", () => {
  it("UEBERWEISUNG=on schaltet nur die Überweisung frei, nicht die Mahnungen", async () => {
    const { ueberweisungAktiv, mahnwesenAktiv } = await import("@/lib/mahnwesen");
    expect(ueberweisungAktiv({ UEBERWEISUNG: "on" })).toBe(true);
    expect(mahnwesenAktiv({ UEBERWEISUNG: "on" })).toBe(false);
    expect(ueberweisungAktiv({ MAHNWESEN: "on" })).toBe(true);
    expect(ueberweisungAktiv({})).toBe(false);
  });
});
