import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  gruppiere,
  imFenster,
  kanaeleAus,
  kanaeleText,
  montagBisFreitag,
  naechsteEinrichtungsErinnerung,
  naechsteJeKontakt,
  sortiere,
  whatsappHindernis,
  zeitLabel,
  type GeplanteNachricht,
} from "@/lib/vertrieb/geplante-nachrichten";
import { direktNachBestaetigung, erinnerungsFenster, erinnerungsZeit, vorlaufOk } from "@/lib/vertrieb/termin-erinnerungen";
import { bonusPlan, faelligeBonusSchritte, type BonusAngebot } from "@/lib/vertrieb/bonus-erinnerung";
import { istErsetzt } from "@/lib/angebot-zahlungserinnerung";
import { followupStoppGrund } from "@/lib/vertrieb/followup-regeln";
import { berlinTagesendeIso } from "@/lib/offer-pricing";

const H = 3_600_000;
// Do 19.11.2026, 10:00 Berlin (MEZ, UTC+1)
const NOW = new Date("2026-11-19T09:00:00Z");

const n = (p: Partial<GeplanteNachricht>): GeplanteNachricht => ({
  key: Math.random().toString(36),
  quelle: "zahlung",
  at: NOW,
  sofort: false,
  art: "Zahlungserinnerung",
  kanaele: ["email"],
  empfaenger: "Agentur",
  bezug: null,
  href: "/x",
  contactId: null,
  ...p,
});

describe("Versandfenster", () => {
  const f = { von: 9, bis: 19 };
  it("fällig im Fenster: beim nächsten Lauf", () => {
    expect(imFenster(new Date("2026-11-19T07:00:00Z"), NOW, f)).toEqual({ at: NOW, sofort: true });
  });
  it("vor dem Fenster: zu dessen Beginn, danach am nächsten Tag", () => {
    const frueh = new Date("2026-11-19T05:00:00Z"); // 6 Uhr
    expect(imFenster(frueh, frueh, f).at.toISOString()).toBe("2026-11-19T08:00:00.000Z");
    const spaet = new Date("2026-11-19T19:30:00Z"); // 20:30
    expect(imFenster(spaet, spaet, f)).toEqual({ at: new Date("2026-11-20T08:00:00.000Z"), sofort: false });
  });
  it("zukünftig im Fenster: genau dann", () => {
    const ab = new Date("2026-11-23T08:00:00Z");
    expect(imFenster(ab, NOW, f)).toEqual({ at: ab, sofort: false });
  });
  it("nur Werktage: Samstag → Montag", () => {
    const sa = new Date("2026-11-21T10:00:00Z");
    expect(montagBisFreitag("2026-11-21")).toBe(false);
    expect(imFenster(sa, NOW, { von: 9, bis: 18, tag: montagBisFreitag }).at.toISOString()).toBe("2026-11-23T08:00:00.000Z");
  });
});

describe("Kanäle", () => {
  const ok = { phone: "4915112345678", festnetz: false, kontoVerbunden: true, vorlage: true, optedOut: false };
  it("WhatsApp-Hürden in der Reihenfolge des Versands", () => {
    expect(whatsappHindernis(ok)).toBeNull();
    expect(whatsappHindernis({ ...ok, phone: null })).toBe("no_phone");
    expect(whatsappHindernis({ ...ok, festnetz: true })).toBe("festnetz");
    expect(whatsappHindernis({ ...ok, kontoVerbunden: false })).toBe("no_account");
    expect(whatsappHindernis({ ...ok, vorlage: false })).toBe("no_template");
    expect(whatsappHindernis({ ...ok, optedOut: true })).toBe("opted_out");
  });
  it("Kanäle und Text", () => {
    expect(kanaeleAus({ email: true, whatsapp: true })).toEqual(["email", "whatsapp"]);
    expect(kanaeleAus({ email: false, whatsapp: false })).toEqual([]);
    expect(kanaeleText(["email", "whatsapp"])).toBe("E-Mail und WhatsApp");
  });
});

describe("Terminerinnerungen (gemeinsam mit dem Versand)", () => {
  const start = new Date("2026-11-20T14:00:00Z");
  it("24 Stunden vorher, frühestens jetzt, entfällt unter 2 Stunden", () => {
    expect(erinnerungsZeit("tag", new Date("2026-11-20T08:00:00Z"), NOW)).toEqual({ at: NOW, sofort: true });
    expect(erinnerungsZeit("tag", new Date("2026-11-22T14:00:00Z"), NOW)).toEqual({ at: new Date("2026-11-21T14:00:00Z"), sofort: false });
    expect(erinnerungsZeit("tag", new Date(NOW.getTime() + 2 * H), NOW)).toBeNull();
    expect(erinnerungsZeit("gleich", start, NOW)?.at.toISOString()).toBe("2026-11-20T13:00:00.000Z");
    expect(erinnerungsFenster("gleich", NOW)).toEqual({ gt: new Date(NOW.getTime() + 10 * 60_000), lte: new Date(NOW.getTime() + H) });
  });
  it("Vorlauf: E-Mail 24 Stunden streng über 26 Stunden ab Buchung, sonst ab ursprünglicher Buchung", () => {
    const gebucht = new Date(start.getTime() - 26 * H);
    expect(vorlaufOk("tag", "email", { startAt: start, gebucht, urspruenglich: gebucht })).toBe(false);
    expect(vorlaufOk("tag", "whatsapp", { startAt: start, gebucht, urspruenglich: gebucht })).toBe(true);
    const verschoben = new Date(start.getTime() - 2 * H);
    expect(vorlaufOk("gleich", "email", { startAt: start, gebucht: verschoben, urspruenglich: new Date(start.getTime() - 50 * H) })).toBe(true);
    expect(vorlaufOk("gleich", "whatsapp", { startAt: start, gebucht: verschoben, urspruenglich: verschoben })).toBe(false);
  });
  it("24-Stunden-WhatsApp entfällt direkt nach der Bestätigung", () => {
    expect(direktNachBestaetigung({ status: "sent", at: new Date(NOW.getTime() - H) }, NOW)).toBe(true);
    expect(direktNachBestaetigung({ status: "sent", at: new Date(NOW.getTime() - 3 * H) }, NOW)).toBe(false);
    expect(direktNachBestaetigung({ status: "no_phone", at: NOW }, NOW)).toBe(false);
  });
});

describe("Bonus-Erinnerung: Plan und Versand aus einer Quelle", () => {
  const o: BonusAngebot = {
    status: "sent",
    isTest: false,
    validUntil: new Date("2026-12-01T12:00:00Z"),
    declinedAt: null,
    acceptedAt: null,
    abschlussBonus: 300,
    abschlussBonusBis: berlinTagesendeIso("2026-11-20"),
    sentAt: new Date("2026-11-16T09:00:00Z"),
    createdAt: new Date("2026-11-16T08:00:00Z"),
    setupFee: 990,
    allowPayLater: false,
    bonusMailVorabAt: null,
    bonusMailLetzterAt: null,
    bonusPushAt: null,
    bonusWhatsAppAt: null,
  };
  it("Plan: Tag vor Ablauf 9 Uhr, letzter Tag 9 und 13 Uhr, bis 19 Uhr", () => {
    const plan = bonusPlan(o, NOW);
    expect(plan.map((s) => [s.schritt, s.ab.toISOString(), s.bis.toISOString()])).toEqual([
      ["vorab", "2026-11-19T08:00:00.000Z", "2026-11-19T18:00:00.000Z"],
      ["letzter", "2026-11-20T08:00:00.000Z", "2026-11-20T18:00:00.000Z"],
      ["push", "2026-11-20T08:00:00.000Z", "2026-11-20T18:00:00.000Z"],
      ["whatsapp", "2026-11-20T12:00:00.000Z", "2026-11-20T18:00:00.000Z"],
    ]);
  });
  it("fällige Schritte = Plan im Fenster (stündlich geprüft)", () => {
    for (let h = 0; h < 72; h++) {
      const t = new Date(Date.parse("2026-11-18T23:00:00Z") + h * H);
      const ausPlan = bonusPlan(o, t)
        .filter((s) => s.ab <= t && t < s.bis)
        .map((s) => s.schritt);
      expect(faelligeBonusSchritte(o, t)).toEqual(ausPlan);
    }
  });
});

describe("Regeln geteilt mit dem Versand", () => {
  it("neuere Version des Angebots", () => {
    const a = { id: "a", createdAt: new Date("2026-11-01"), salesContactId: "k", dealId: null, status: "accepted" };
    expect(istErsetzt(a, [{ ...a, id: "b", createdAt: new Date("2026-11-02"), status: "sent" }])).toBe(true);
    expect(istErsetzt(a, [{ ...a, id: "b", createdAt: new Date("2026-11-02"), status: "superseded" }])).toBe(false);
    expect(istErsetzt(a, [{ ...a, id: "b", createdAt: new Date("2026-10-30") }])).toBe(false);
    expect(istErsetzt(a, [{ ...a, id: "b", salesContactId: "x", createdAt: new Date("2026-11-02") }])).toBe(false);
    const d = { id: "d", createdAt: new Date("2026-11-01"), salesContactId: null, dealId: "deal" };
    expect(istErsetzt(d, [{ ...d, id: "e", createdAt: new Date("2026-11-03") }])).toBe(true);
  });
  it("Später-Follow-up: Stopp-Gründe", () => {
    const base = { stage: "SPAETER" as const, abgemeldet: false, gesperrt: false, beantwortet: false };
    expect(followupStoppGrund(base)).toBeNull();
    expect(followupStoppGrund({ ...base, stage: "TERMIN" })).toMatch(/Stufe/);
    expect(followupStoppGrund({ ...base, stage: null })).toBe("Kontakt gelöscht");
    expect(followupStoppGrund({ ...base, gesperrt: true })).toBe("Sperrliste");
    expect(followupStoppGrund({ ...base, beantwortet: true })).toBe("Antwort erhalten");
  });
  it("Einrichtung: fällig jetzt, sonst nächster offener Tag", () => {
    const base = new Date("2026-11-16T09:00:00Z");
    expect(naechsteEinrichtungsErinnerung(base, NOW, {}, [1, 3, 7], 3)).toEqual({ tag: 3, ab: NOW });
    expect(naechsteEinrichtungsErinnerung(base, NOW, { "1": "x", "3": "x" }, [1, 3, 7], null)).toEqual({ tag: 7, ab: new Date("2026-11-23T09:00:00Z") });
    expect(naechsteEinrichtungsErinnerung(base, NOW, { "1": "x", "3": "x", "7": "x" }, [1, 3, 7], null)).toBeNull();
  });
});

describe("Liste", () => {
  it("chronologisch, begrenzt, gruppiert nach Heute, Morgen, 7 Tage, später", () => {
    const items = [
      n({ key: "c", at: new Date("2026-11-30T08:00:00Z") }),
      n({ key: "a", at: NOW, sofort: true }),
      n({ key: "b", at: new Date("2026-11-20T08:00:00Z"), contactId: "k" }),
      n({ key: "d", at: new Date("2026-11-24T08:00:00Z"), contactId: "k" }),
    ];
    expect(sortiere(items).map((x) => x.key)).toEqual(["a", "b", "d", "c"]);
    expect(sortiere(items, new Date("2026-11-25T00:00:00Z")).map((x) => x.key)).toEqual(["a", "b", "d"]);
    expect(gruppiere(items, NOW).map((g) => [g.key, g.items.map((x) => x.key)])).toEqual([
      ["heute", ["a"]],
      ["morgen", ["b"]],
      ["woche", ["d"]],
      ["spaeter", ["c"]],
    ]);
    expect(naechsteJeKontakt(items).get("k")?.key).toBe("b");
  });
  it("Zeit als Text", () => {
    expect(zeitLabel({ at: NOW, sofort: true }, NOW)).toBe("gleich");
    expect(zeitLabel({ at: new Date("2026-11-19T13:00:00Z"), sofort: false }, NOW)).toBe("heute 14:00");
    expect(zeitLabel({ at: new Date("2026-11-19T13:00:00Z"), sofort: false }, NOW, { nurZeit: true })).toBe("14:00");
    expect(zeitLabel({ at: new Date("2026-11-20T08:00:00Z"), sofort: false }, NOW)).toBe("morgen 9:00");
    expect(zeitLabel({ at: new Date("2026-11-23T08:00:00Z"), sofort: false }, NOW)).toMatch(/^Mo\.? 23\.11\. 9:00$/);
  });
});

describe("Quelltext: Versand nutzt dieselben Regeln wie die Übersicht", () => {
  const src = (p: string) => readFileSync(join(__dirname, "../../src/lib", p), "utf8");
  it("Terminerinnerungen per E-Mail und WhatsApp", () => {
    const buchung = src("vertrieb/buchung.ts");
    expect(buchung).toMatch(/erinnerungsFenster\("tag", now\)/);
    expect(buchung).toMatch(/erinnerungsFenster\("gleich", now\)/);
    expect(buchung).toMatch(/vorlaufOk\("tag", "email"/);
    const wa = src("vertrieb/termin-whatsapp.ts");
    expect(wa).toMatch(/erinnerungsFenster\(k\.plan, now\)/);
    expect(wa).toMatch(/vorlaufOk\(k\.plan, "whatsapp"/);
    expect(wa).toMatch(/direktNachBestaetigung\(/);
  });
  it("Zahlung, Bonus, Follow-up, Mahnwesen", () => {
    expect(src("angebot-zahlungserinnerung-server.ts")).toMatch(/naechsteErinnerung\(o, now, \{ ersetzt: neuere \}\)/);
    expect(src("angebot-zahlungserinnerung-server.ts")).toMatch(/return istErsetzt\(o, kandidaten\)/);
    expect(src("vertrieb/bonus-erinnerung.ts")).toMatch(/return bonusPlan\(o, now\)/);
    expect(src("vertrieb/bonus-erinnerung-server.ts")).toMatch(/const where = bonusOffenWhere\(/);
    expect(src("vertrieb/followup.ts")).toMatch(/return followupStoppGrund\(/);
    expect(src("vertrieb/spaeter.ts")).toMatch(/hour >= SENDEFENSTER\.von && hour < SENDEFENSTER\.bis/);
    expect(src("mahnwesen-server.ts")).toMatch(/naechsteStufe\(f, now, \{ gestoppt: !!mahnStoppGrund\(f\.customer\) \}\)/);
    expect(src("onboarding-cron.ts")).toMatch(/h >= GESCHAEFTSZEIT\.von && h < GESCHAEFTSZEIT\.bis/);
    expect(src("vertrieb/sperrliste.ts")).toMatch(/return \(await gesperrteKontakte\(\[contactId\]\)\)\.has\(contactId\)/);
  });
  it("WhatsApp-Versand prüft dieselben Hürden wie whatsappHindernis", () => {
    for (const datei of ["angebot-zahlungserinnerung-server.ts", "vertrieb/termin-whatsapp.ts"]) {
      const s = src(datei);
      for (const h of ["festnetz", "no_account", "no_template", "opted_out"]) expect(s, `${datei}: ${h}`).toContain(`"${h}"`);
    }
  });
});
