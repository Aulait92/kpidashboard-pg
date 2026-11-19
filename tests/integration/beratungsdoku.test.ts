import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Paket B (Ole, 18.11.2026): Beratungsdokumentation als Angebot gegen die Test-DB. Mail simuliert.
type MailCall = { to: string; subject: string; text: string; anhaenge: string[]; art: string };
const mails: MailCall[] = [];
let mailVerzoegerung = 0;
vi.mock("@/lib/mail/lead-versand", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/lead-versand")>();
  return {
    ...real,
    resendBereit: () => true,
    sendeLeadMail: async (
      _k: unknown,
      o: { to: string; inhalt: (s: { text: string; html: string }) => { subject: string; text: string }; attachments?: { fileName: string }[]; protokoll: { art: string } },
    ) => {
      if (mailVerzoegerung) await new Promise((r) => setTimeout(r, mailVerzoegerung));
      const m = o.inhalt({ text: "Viele Grüße\nOle Kannapinn", html: "<p>Viele Grüße</p>" });
      mails.push({ to: o.to, subject: m.subject, text: m.text, anhaenge: (o.attachments ?? []).map((a) => a.fileName), art: o.protokoll.art });
      return { sent: true, via: "resend" };
    },
  };
});

import { prisma } from "@/lib/prisma";
import { bdAblegen, bdBestaetigen, bdKartenStand, bdNutzung, bdSeite, bdSeitenPdf, bdSenden, ladeBeratungsdoku, setzeBeratungsdoku } from "@/lib/beratungsdoku-server";
import { GRUENDE_ERGAENZEN } from "@/lib/mail/beratung";
import { eraseLead } from "@/lib/erasure";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const T0 = new Date("2026-11-17T09:00:00.000Z");
const offers = {
  items: [
    { sparte: "Privathaftpflicht", gesellschaft: "Allianz", tarif: "Komfort", beitragMonat: 6.12, leistungen: ["Schlüsselverlust"], empfohlen: true, gewaehlt: true, merkmale: [], bausteine: [] },
    { sparte: "Privathaftpflicht", gesellschaft: "Allianz", tarif: "Basis", beitragMonat: 4.5, leistungen: [], empfohlen: false, gewaehlt: false, merkmale: [], bausteine: [] },
  ],
  quelle: [],
  schutz: [],
};

describe("Beratungsdokumentation (Paket B)", () => {
  let customerId = "";
  let n = 0;
  const ctx = () => ({ customerId, userId: null, teamRole: "owner" as const });
  const fertig = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.split(GRUENDE_ERGAENZEN).join("passt zur Familie")]));

  async function termin(o: { email?: string | null; customer?: string } = {}) {
    const cid = o.customer ?? customerId;
    const lead = await prisma.lead.create({
      data: {
        customerId: cid,
        name: "Anna Becker",
        source: "Privathaftpflicht",
        formData: [
          { label: "Lebenssituation", value: "Familie" },
          { label: "Vorerkrankungen", value: "Asthma" },
        ],
        phone: `49151400${String(++n).padStart(4, "0")}`,
        email: o.email === undefined ? "anna@example.org" : o.email,
        status: "Angebot gesendet",
      },
    });
    const t = await prisma.appointment.create({ data: { customerId: cid, leadId: lead.id, startsAt: new Date(T0.getTime() - 2 * 3600_000), status: "completed", mode: "video", offersJson: offers } });
    await prisma.leadHistory.create({ data: { leadId: lead.id, customerId: cid, kind: "notiz", text: "Fahrrad soll mit rein" } });
    return { lead, t };
  }

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ leadAddress: "sie", beratungsdokuAn: true })).id;
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    mails.length = 0;
    mailVerzoegerung = 0;
  });

  it("Schalter aus (Standard): kein Blatt, kein Senden, kein Ablegen, Terminkarte ohne Stand", async () => {
    const c2 = await makeCustomer({});
    try {
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: c2.id } })).beratungsdokuAn).toBe(false);
      const { t } = await termin({ customer: c2.id });
      const c = { customerId: c2.id, userId: null, teamRole: "owner" as const };
      expect(await ladeBeratungsdoku(t.id, c, T0)).toBeNull();
      const inhalt = { wuensche: "a", beratung: "b", empfehlung: "c", entscheidung: "d", hinweise: "" };
      expect(await bdSenden(t.id, c, inhalt)).toEqual({ ok: false, error: "Die Beratungsdokumentation ist in Ihren Einstellungen aus." });
      expect((await bdAblegen(t.id, c, inhalt)).ok).toBe(false);
      expect(mails).toHaveLength(0);
      expect(await prisma.beratungsdoku.count({ where: { customerId: c2.id } })).toBe(0);
    } finally {
      await cleanupCustomer(c2.id);
    }
  });

  it("Schalter: nur Inhaber, nicht in der Vorschau; Einschalten merkt den Zeitpunkt", async () => {
    const c3 = await makeCustomer({});
    try {
      expect(await setzeBeratungsdoku({ customerId: c3.id, teamRole: "advisor" }, true)).toBe(false);
      expect(await setzeBeratungsdoku({ customerId: c3.id, teamRole: "owner", preview: true }, true)).toBe(false);
      expect(await setzeBeratungsdoku({ customerId: c3.id, teamRole: "owner" }, true, T0)).toBe(true);
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: c3.id }, select: { beratungsdokuAn: true, beratungsdokuAnAt: true } })).toEqual({ beratungsdokuAn: true, beratungsdokuAnAt: T0 });
      await setzeBeratungsdoku({ customerId: c3.id, teamRole: "owner" }, false);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: c3.id } })).beratungsdokuAn).toBe(false);
    } finally {
      await cleanupCustomer(c3.id);
    }
  });

  it("Vorbelegung aus Termin, Angaben, Notizen und Tarifen; ohne Gesundheitsangaben; Senden erst ohne offene Stelle", async () => {
    const { t } = await termin();
    const info = (await ladeBeratungsdoku(t.id, ctx(), T0))!;
    expect(info.appVersand).toBe(true);
    expect(info.email).toBe("anna@example.org");
    expect(info.entwurf.wuensche).toContain("• Lebenssituation: Familie");
    expect(info.entwurf.wuensche).toContain("• Fahrrad soll mit rein");
    expect(JSON.stringify(info.entwurf)).not.toContain("Asthma");
    expect(info.entwurf.beratung).toContain("Verglichene Tarife:");
    expect(info.entwurf.empfehlung).toContain("Allianz Komfort, 6,12 € im Monat");
    expect(info.entwurf.entscheidung).toBe("Sie möchten das Angebot in Ruhe prüfen.");
    expect(info.letzte).toBeNull();
    const offen = await bdSenden(t.id, ctx(), info.entwurf, { now: T0 });
    expect(offen).toEqual({ ok: false, error: expect.stringContaining(GRUENDE_ERGAENZEN) });
    expect(mails).toHaveLength(0);
  });

  it("Senden: Mail in Textform mit PDF und Link; Doppelklick sendet einmal; Seite zeigt nur an; Bestätigung nur per Aktion, zweimal ändert nichts", async () => {
    const { t, lead } = await termin();
    const info = (await ladeBeratungsdoku(t.id, ctx(), T0))!;
    const inhalt = fertig(info.entwurf);
    mailVerzoegerung = 50;
    const [a, b] = await Promise.all([bdSenden(t.id, ctx(), inhalt, { now: T0 }), bdSenden(t.id, ctx(), inhalt, { now: T0 })]);
    expect(a.ok && b.ok).toBe(true);
    expect([a, b].filter((r) => r.ok && r.schon)).toHaveLength(1);
    expect(mails).toHaveLength(1);
    const m = mails[0];
    expect(m.art).toBe("beratungsdoku");
    expect(m.subject).toBe("Ihre Beratungsdokumentation zu Privathaftpflicht");
    expect(m.text).toContain("bestätigen Sie den Erhalt mit einem Klick");
    expect(m.anhaenge).toEqual([expect.stringMatching(/^Beratungsdokumentation_Anna_Becker_\d{4}-\d{2}-\d{2}\.pdf$/)]);
    const token = /\/dokumentation\/([A-Za-z0-9_-]+)/.exec(m.text)?.[1];
    expect(token).toBeTruthy();

    const row = await prisma.beratungsdoku.findFirstOrThrow({ where: { appointmentId: t.id } });
    expect(row).toMatchObject({ status: "gesendet", gesendetAn: "anna@example.org", token });
    const f = await prisma.leadFile.findUniqueOrThrow({ where: { id: row.dateiId! } });
    expect(f.kind).toBe("beratungsdoku");
    expect(f.aufbewahrenBis!.getTime() - f.createdAt.getTime()).toBeGreaterThan(3650 * 86_400_000);
    expect((await bdKartenStand([t.id])).get(t.id)).toBe("erledigt");

    // Aufruf der Seite (auch mehrfach, z. B. Link-Scanner) speichert nichts
    const s1 = await bdSeite(token!, T0);
    await bdSeite(token!, T0);
    expect(s1.zustand).toBe("offen");
    expect((await prisma.beratungsdoku.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("gesendet");
    expect(await bdSeitenPdf(token!, T0)).toMatchObject({ fileName: f.fileName });

    const zeit = new Date(T0.getTime() + 3600_000);
    const [x, y] = await Promise.all([bdBestaetigen(token!, zeit), bdBestaetigen(token!, zeit)]);
    expect([x, y].map((r) => r.ok && r.schon).sort()).toEqual([false, true]);
    expect(await bdBestaetigen(token!, new Date(zeit.getTime() + 60_000))).toEqual({ ok: true, schon: true });
    const nach = await prisma.beratungsdoku.findUniqueOrThrow({ where: { id: row.id } });
    expect(nach.status).toBe("bestaetigt");
    expect(nach.bestaetigtAt).toEqual(zeit);
    const best = await prisma.leadFile.findUniqueOrThrow({ where: { id: nach.bestaetigtDateiId! } });
    expect(best.fileName).toMatch(/_bestaetigt\.pdf$/);
    expect(await prisma.leadFile.count({ where: { leadId: lead.id, kind: "beratungsdoku" } })).toBe(2);
    expect((await bdSeite(token!, zeit)).zustand).toBe("bestaetigt");
    const info2 = (await ladeBeratungsdoku(t.id, ctx(), zeit))!;
    expect(info2.letzte).toMatchObject({ status: "bestaetigt", bestaetigtAt: zeit.toISOString() });
    expect(info2.letzte!.inhalt.empfehlung).toContain("passt zur Familie");
  });

  it("Ablegen: einmal je Inhalt; danach Senden derselben Fassung übernimmt die Ablage; neue Fassung ersetzt die alte, Link abgelaufen nach 30 Tagen", async () => {
    const { t, lead } = await termin();
    const inhalt = fertig((await ladeBeratungsdoku(t.id, ctx(), T0))!.entwurf);
    const a1 = await bdAblegen(t.id, ctx(), inhalt, { now: T0 });
    const a2 = await bdAblegen(t.id, ctx(), inhalt, { now: T0 });
    expect(a1).toMatchObject({ ok: true, status: "abgelegt" });
    expect(a2).toMatchObject({ ok: true, schon: true });
    expect(await prisma.leadFile.count({ where: { leadId: lead.id, kind: "beratungsdoku" } })).toBe(1);

    const s = await bdSenden(t.id, ctx(), inhalt, { now: T0 });
    expect(s).toMatchObject({ ok: true, status: "gesendet" });
    expect(a1.ok && s.ok && s.id === a1.id).toBe(true);
    expect(await prisma.leadFile.count({ where: { leadId: lead.id, kind: "beratungsdoku" } })).toBe(1);
    const alt = await prisma.beratungsdoku.findUniqueOrThrow({ where: { id: a1.ok ? a1.id : "" } });

    const neu = await bdSenden(t.id, ctx(), { ...inhalt, hinweise: "Auf Rechtsschutz verzichten Sie vorerst." }, { now: T0 });
    expect(neu).toMatchObject({ ok: true, status: "gesendet" });
    expect((await prisma.beratungsdoku.findUniqueOrThrow({ where: { id: alt.id } })).status).toBe("ersetzt");
    expect((await bdSeite(alt.token!, T0)).zustand).toBe("ersetzt");
    expect((await bdBestaetigen(alt.token!, T0)).ok).toBe(false);
    const neuRow = await prisma.beratungsdoku.findUniqueOrThrow({ where: { id: neu.ok ? neu.id : "" } });
    expect((await bdSeite(neuRow.token!, new Date(T0.getTime() + 31 * 86_400_000))).zustand).toBe("abgelaufen");
    expect(await bdBestaetigen(neuRow.token!, new Date(T0.getTime() + 31 * 86_400_000))).toEqual({ ok: false, grund: "abgelaufen" });
    expect((await bdSeite("x".repeat(32), T0)).zustand).toBe("ungueltig");
  });

  it("ohne E-Mail-Adresse: Hinweis und nur Ablegen", async () => {
    const { t } = await termin({ email: null });
    const info = (await ladeBeratungsdoku(t.id, ctx(), T0))!;
    expect(info.appVersand).toBe(false);
    expect(info.ohneVersand).toContain("Keine E-Mail-Adresse");
    const r = await bdSenden(t.id, ctx(), fertig(info.entwurf), { now: T0 });
    expect(r.ok).toBe(false);
    expect(await prisma.beratungsdoku.count({ where: { appointmentId: t.id } })).toBe(0);
  });

  it("Löschen des Leads: Zeile und Link weg, PDF bleibt bis zum Ende der Aufbewahrung", async () => {
    const { t, lead } = await termin();
    const inhalt = fertig((await ladeBeratungsdoku(t.id, ctx(), T0))!.entwurf);
    const s = await bdSenden(t.id, ctx(), inhalt, { now: T0 });
    expect(s.ok).toBe(true);
    const token = (await prisma.beratungsdoku.findFirstOrThrow({ where: { leadId: lead.id } })).token!;
    await eraseLead(lead.id);
    expect(await prisma.beratungsdoku.count({ where: { leadId: lead.id } })).toBe(0);
    expect((await bdSeite(token, T0)).zustand).toBe("ungueltig");
    expect(await prisma.leadFile.count({ where: { leadId: lead.id, kind: "beratungsdoku" } })).toBe(1);
  });

  it("Zusage abweichend von der Empfehlung: Vermerk unter „Entscheidung des Kunden“, ohne Zusage nicht", async () => {
    const { t } = await termin();
    // Kunde wählt die günstigere Stufe (Basis statt Komfort)
    await prisma.appointment.update({
      where: { id: t.id },
      data: { offersJson: { ...offers, items: offers.items.map((i) => ({ ...i, gewaehlt: i.tarif === "Basis" })) } },
    });
    expect((await ladeBeratungsdoku(t.id, ctx(), T0))!.entwurf.entscheidung).not.toContain("trotz unserer Empfehlung");
    await prisma.praesentationEreignis.create({ data: { customerId, appointmentId: t.id, quelle: "kundenlink", art: "zusage", folie: "", variante: "C" } });
    const e = (await ladeBeratungsdoku(t.id, ctx(), T0))!.entwurf.entscheidung;
    expect(e).toBe("Sie haben sich trotz unserer Empfehlung für die günstigere Variante entschieden: Privathaftpflicht Basis statt Privathaftpflicht Komfort.");
    // „Empfehlung mit Begründung“ nennt weiter die empfohlene Stufe
    const info = (await ladeBeratungsdoku(t.id, ctx(), T0))!;
    expect(info.entwurf.empfehlung).toContain("Komfort");
    expect(info.entwurf.empfehlung).not.toContain("Basis");
  });

  it("Messung: eingeschaltete Vermittler, Termine und dokumentierte Termine je Kunde", async () => {
    const c4 = await makeCustomer({ beratungsdokuAn: true, beratungsdokuAnAt: T0 });
    try {
      const c = { customerId: c4.id, userId: null, teamRole: "owner" as const };
      const eins = await termin({ customer: c4.id });
      await termin({ customer: c4.id });
      const inhalt = fertig((await ladeBeratungsdoku(eins.t.id, c, T0))!.entwurf);
      expect((await bdSenden(eins.t.id, c, inhalt, { now: T0 })).ok).toBe(true);
      const tok = (await prisma.beratungsdoku.findFirstOrThrow({ where: { customerId: c4.id } })).token!;
      await bdBestaetigen(tok, T0);
      const jetzt = new Date();
      const nutz = await bdNutzung(30, new Date(Math.max(jetzt.getTime(), T0.getTime() + 86_400_000)));
      const k = nutz.kunden.find((x) => x.id === c4.id)!;
      expect(k).toMatchObject({ termine: 2, dokumentiert: 1, bestaetigt: 1 });
      expect(nutz.eingeschaltet).toBeGreaterThanOrEqual(2);
      expect(nutz.jeTermin).not.toBeNull();
      // Test- und archivierte Kunden zählen nicht
      await prisma.customer.update({ where: { id: c4.id }, data: { isTest: true } });
      expect((await bdNutzung(30)).kunden.some((x) => x.id === c4.id)).toBe(false);
    } finally {
      await cleanupCustomer(c4.id);
    }
  });
});
