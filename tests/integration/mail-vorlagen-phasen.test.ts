// Neue E-Mail-Vorlagen (Ole, 14.11.2026): Ergänzen bei bestehenden Kunden und Nachfass-Aufgaben ohne Doppelungen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { loadVorlagen, STANDARD_VORLAGEN_JE, VORLAGEN_STAND } from "@/lib/mail/vorlagen";
import {
  clearTerminErinnerung,
  fuehreNachfassenAus,
  NICHT_ERSCHIENEN_NOTE,
  planWiedervorlageAm,
  UNTERLAGEN_NOTE,
  WIE_BESPROCHEN_NOTE,
  istSpaeter,
} from "@/lib/mail/termin-erinnerung";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];
const kunde = async (extra: Record<string, unknown> = {}) => {
  const c = await makeCustomer(extra);
  ids.push(c.id);
  return c;
};

describe("Standardvorlagen ergänzen", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("neuer Kunde: alle 12 mit Schlüssel, Stand gesetzt, zweites Laden ohne Doppelung", async () => {
    const c = await kunde({ leadAddress: "du" });
    const v = await loadVorlagen(c.id);
    expect(v.map((x) => x.standardKey)).toEqual(STANDARD_VORLAGEN_JE.du.map((x) => x.key));
    expect(v.find((x) => x.standardKey === "termin_vorbereitung")!.body).toContain("leg dir bitte");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).mailVorlagenStand).toBe(VORLAGEN_STAND);
    expect(await loadVorlagen(c.id)).toHaveLength(12);
  });

  it("bestehender Kunde (Migration): Schlüssel nachgetragen, 8 neue ergänzt, eigene Vorlagen unverändert, gleichzeitig geladen ohne Doppelung", async () => {
    const c = await kunde();
    const alt = STANDARD_VORLAGEN_JE.sie.slice(0, 4);
    // Stand vor der Migration: vier Standardvorlagen ohne Schlüssel, eine davon geändert, eine eigene, „Angebot“ gelöscht
    for (const v of alt.filter((x) => x.key !== "angebot")) {
      await prisma.mailTemplate.create({ data: { customerId: c.id, name: v.name, subject: v.subject, body: v.key === "nach_abschluss" ? "Mein Dank" : v.body } });
    }
    await prisma.mailTemplate.create({ data: { customerId: c.id, name: "Rückruf", subject: "Rückruf", body: "Eigener Text" } });
    await prisma.customer.update({ where: { id: c.id }, data: { mailVorlagenStand: 0 } });
    // Datenteil der Migration ausführen (ALTER TABLE ist schon gelaufen)
    const sql = fs.readFileSync("prisma/migrations/20261118620000_mail_vorlagen_phasen/migration.sql", "utf8");
    for (const stmt of sql.split(";").map((s) => s.split("\n").filter((l) => !l.startsWith("--")).join("\n").trim()).filter((s) => s.startsWith("UPDATE"))) {
      await prisma.$executeRawUnsafe(stmt);
    }
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).mailVorlagenStand).toBe(1);
    const vorher = await prisma.mailTemplate.findMany({ where: { customerId: c.id } });
    expect(vorher.find((t) => t.name === "Nicht erreicht")!.standardKey).toBe("nicht_erreicht");
    expect(vorher.find((t) => t.name === "Rückruf")!.standardKey).toBeNull();

    const [a, b] = await Promise.all([loadVorlagen(c.id), loadVorlagen(c.id)]);
    const nach = await prisma.mailTemplate.findMany({ where: { customerId: c.id } });
    expect(nach).toHaveLength(4 + 8);
    expect(a.length === 12 || b.length === 12).toBe(true);
    expect(nach.filter((t) => t.standardKey === "angebot")).toHaveLength(0); // gelöscht bleibt gelöscht
    expect(nach.find((t) => t.standardKey === "nach_abschluss")!.body).toBe("Mein Dank");
    expect(nach.find((t) => t.name === "Rückruf")!.body).toBe("Eigener Text");
    expect(new Set(nach.map((t) => t.name)).size).toBe(nach.length);
    expect(await loadVorlagen(c.id)).toHaveLength(12);
  });

  it("Kunde mit eigener Vorlage gleichen Namens: keine zweite", async () => {
    const c = await kunde({ mailVorlagenStand: 1 });
    await prisma.mailTemplate.create({ data: { customerId: c.id, name: "Nicht erschienen", subject: "x", body: "Mein No-Show-Text" } });
    const v = await loadVorlagen(c.id);
    expect(v.filter((x) => x.name === "Nicht erschienen")).toHaveLength(1);
    expect(v.find((x) => x.name === "Nicht erschienen")!.body).toBe("Mein No-Show-Text");
    expect(v).toHaveLength(8); // die 7 übrigen neuen plus die eigene
  });
});

describe("Nachfass-Aufgaben ohne Doppelungen", () => {
  const now = new Date("2026-11-16T10:00:00Z"); // Montag
  const opts = (customerId: string) => ({ customerId, now });

  it("Nicht erschienen: Aufgabe, keine zweite, Buchung entfernt sie", async () => {
    const c = await kunde();
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Eva Pohl" } });
    expect(await fuehreNachfassenAus(lead.id, { art: "nicht_erschienen", tage: 2 }, opts(c.id))).toContain("falls kein neuer Termin gebucht wird");
    const l1 = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l1.followUpNote).toBe(NICHT_ERSCHIENEN_NOTE);
    expect(l1.followUpAt!.toISOString().slice(0, 10)).toBe("2026-11-18");
    expect(await fuehreNachfassenAus(lead.id, { art: "unterlagen", tage: 3 }, opts(c.id))).toBe("Die bestehende Wiedervorlage bleibt.");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe(NICHT_ERSCHIENEN_NOTE);
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, kind: "wiedervorlage" } })).toBe(1);
    await clearTerminErinnerung(lead.id);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpAt).toBeNull();
  });

  it("Nicht erschienen mit gebuchtem Termin oder laufender Abfolge: keine Aufgabe", async () => {
    const c = await kunde();
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Eva Pohl" } });
    await prisma.leadSequence.create({ data: { leadId: lead.id, customerId: c.id, kind: "no_show", nextAt: now } });
    expect(await fuehreNachfassenAus(lead.id, { art: "nicht_erschienen", tage: 2 }, opts(c.id))).toBe("Die laufende Nachfass-Abfolge erinnert Sie.");
    await prisma.leadSequence.deleteMany({ where: { leadId: lead.id } });
    await prisma.appointment.create({ data: { customerId: c.id, leadId: lead.id, mode: "phone", startsAt: new Date("2026-11-20T10:00:00Z") } });
    expect(await fuehreNachfassenAus(lead.id, { art: "nicht_erschienen", tage: 2 }, opts(c.id))).toBeNull();
    // Unterlagen: gebuchter Termin hält die Aufgabe nicht auf (3 Werktage)
    expect(await fuehreNachfassenAus(lead.id, { art: "unterlagen", tage: 3 }, opts(c.id))).toContain("falls die Unterlagen fehlen");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l.followUpNote).toBe(UNTERLAGEN_NOTE);
    expect(l.followUpAt!.toISOString().slice(0, 10)).toBe("2026-11-19");
    // Buchung entfernt nur Termin-Erinnerungen, nicht „Unterlagen nachfassen“
    await clearTerminErinnerung(lead.id);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe(UNTERLAGEN_NOTE);
  });

  it("Wie besprochen: Wiedervorlage zum Tag, gleich nochmal ohne Doppelung, ersetzt andere", async () => {
    const c = await kunde();
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Eva Pohl", followUpAt: now, followUpNote: "Angebot nachfassen" } });
    expect(await planWiedervorlageAm(lead.id, "2026-12-07", opts(c.id))).toContain("Wiedervorlage auf");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l.followUpNote).toBe(WIE_BESPROCHEN_NOTE);
    expect(l.followUpAt!.toISOString()).toBe("2026-12-07T08:00:00.000Z"); // 9 Uhr Berlin (Winterzeit)
    expect(await planWiedervorlageAm(lead.id, "2026-12-07", opts(c.id))).toContain("steht schon");
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, kind: "wiedervorlage" } })).toBe(1);
    expect(await planWiedervorlageAm(lead.id, "2020-01-01", opts(c.id))).toBeNull();
    expect(istSpaeter(l.followUpAt, l.followUpNote, now)).toBe(true);
    expect(istSpaeter(l.followUpAt, UNTERLAGEN_NOTE, now)).toBe(false);
  });

  it("Kein Interesse: Abfolge gestoppt, Wiedervorlage entfernt", async () => {
    const c = await kunde();
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Eva Pohl", followUpAt: now, followUpNote: "Anrufen" } });
    await prisma.leadSequence.create({ data: { leadId: lead.id, customerId: c.id, kind: "offer", nextAt: now } });
    expect(await fuehreNachfassenAus(lead.id, { art: "beenden" }, opts(c.id))).toBe("Nachfassen für diesen Kontakt beendet.");
    expect(await prisma.leadSequence.count({ where: { leadId: lead.id, stoppedAt: null } })).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpAt).toBeNull();
    expect(await fuehreNachfassenAus(lead.id, { art: "beenden" }, opts(c.id))).toBeNull();
  });
});
