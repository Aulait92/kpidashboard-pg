import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Paket M5: Angebot + Gesprächszusammenfassung gegen die Test-DB. WhatsApp und Mail simuliert.
const wa = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => wa(...a) };
});
type MailCall = { to: string; subject: string; text: string; anhaenge: string[]; art: string; leadId: string };
const mails: MailCall[] = [];
vi.mock("@/lib/mail/lead-versand", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/lead-versand")>();
  return {
    ...real,
    resendBereit: () => true,
    sendeLeadMail: async (
      _k: unknown,
      o: { to: string; inhalt: (s: { text: string; html: string }) => { subject: string; text: string }; attachments?: { fileName: string }[]; protokoll: { art: string; leadId: string } },
    ) => {
      const m = o.inhalt({ text: "Viele Grüße\nOle Kannapinn", html: "<p>Viele Grüße</p>" });
      mails.push({ to: o.to, subject: m.subject, text: m.text, anhaenge: (o.attachments ?? []).map((a) => a.fileName), art: o.protokoll.art, leadId: o.protokoll.leadId });
      return { sent: true, via: "resend" };
    },
  };
});

import { prisma } from "@/lib/prisma";
import { angebotSenden, ladeAngebotInfo } from "@/lib/angebot-senden-server";
import { ladeZusammenfassung, zusammenfassungAblegen, zusammenfassungKi, zusammenfassungSelbstGesendet, zusammenfassungSenden } from "@/lib/zusammenfassung-server";
import { eraseLead, pruneTransient } from "@/lib/erasure";
import { GRUENDE_ERGAENZEN } from "@/lib/mail/beratung";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const T0 = new Date("2026-11-17T09:00:00.000Z");
const offers = {
  items: [
    {
      sparte: "Privathaftpflicht",
      gesellschaft: "Allianz",
      tarif: "Komfort",
      beitragMonat: 6.12,
      leistungen: ["Versicherungssumme: 50 Mio. €", "Schlüsselverlust"],
      empfohlen: true,
      gewaehlt: true,
      merkmale: [],
      bausteine: [],
    },
  ],
  quelle: [],
  schutz: [{ key: "rechtsschutz", label: "Rechtsschutz", status: "luecke", info: null, versicherer: null }],
};

describe("Angebot + Gesprächszusammenfassung (M5)", () => {
  let customerId = "";
  let n = 0;
  const ctx = () => ({ customerId, userId: null, teamRole: "owner" as const });
  const ENV = { ...process.env };

  async function termin(o: { source?: string; email?: string | null } = {}) {
    const lead = await prisma.lead.create({
      data: {
        customerId,
        name: "Anna Becker",
        source: o.source ?? "Privathaftpflicht",
        formData: [
          { label: "Anrede", value: "Frau" },
          { label: "Lebenssituation", value: "Familie" },
          { label: "Vorerkrankungen", value: "Asthma" },
        ],
        phone: `49151300${String(++n).padStart(4, "0")}`,
        email: o.email === undefined ? "anna@example.org" : o.email,
        status: "Termin vereinbart",
      },
    });
    const t = await prisma.appointment.create({
      data: { customerId, leadId: lead.id, startsAt: new Date(T0.getTime() - 2 * 3600_000), status: "completed", mode: "video", offersJson: offers },
    });
    const pdf = await prisma.leadFile.create({ data: { leadId: lead.id, customerId, kind: "angebot", fileName: "Angebot.pdf", contentType: "application/pdf", size: 8, data: Buffer.from("%PDF-1.4") } });
    await prisma.leadHistory.create({ data: { leadId: lead.id, customerId, kind: "notiz", text: "Fahrrad soll mit rein" } });
    return { lead, t, pdf };
  }
  const fertig = (rat: string) => rat.replace(GRUENDE_ERGAENZEN, "passt zur Familie, hohe Summe");

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ leadAddress: "sie" })).id;
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "x" } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    wa.mockReset();
    wa.mockResolvedValue({ mode: "text", conversationId: "c" });
    mails.length = 0;
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it("Blatt: Mailtext aus der Vorlage „Angebot“ mit Vorteilen aus dem Katalog, Entwurf ohne KI, kein KI-Knopf ohne EU-Zugang", async () => {
    delete process.env.KI_EU_AWS_ACCESS_KEY_ID;
    const { t } = await termin();
    const info = (await ladeAngebotInfo(t.id, ctx(), T0))!;
    expect(info.mail.subject).toBe("Frau Becker, Ihr Angebot zu Privathaftpflicht");
    expect(info.mail.text).toContain("• Privathaftpflicht: Allianz Komfort, 6,12 € im Monat\n• Versicherungssumme: 50 Mio. €\n• Schlüsselverlust inklusive");
    const z = info.zusammenfassung!;
    expect(z.ki).toBe(false);
    expect(z.entwurf.wuensche).toContain("• Lebenssituation: Familie");
    expect(z.entwurf.wuensche).toContain("• Rechtsschutz: noch kein Vertrag");
    expect(z.entwurf.wuensche).toContain("• Fahrrad soll mit rein");
    expect(z.entwurf.wuensche).not.toContain("Asthma");
    expect(z.entwurf.rat).toContain("Wichtige Leistungen: Versicherungssumme: 50 Mio. €, Schlüsselverlust");
    expect(z.mail.body).toContain("{wuensche}");
  });

  it("Stufe „aus“: kein Haken, kein Vorschlag", async () => {
    const c2 = await makeCustomer({ mailAblauf: { stufen: { beratungsdoku: "aus" }, bcc: { an: false, adresse: null }, bestaetigtAt: null } });
    try {
      const lead = await prisma.lead.create({ data: { customerId: c2.id, name: "X Y", email: "x@example.org" } });
      const t = await prisma.appointment.create({ data: { customerId: c2.id, leadId: lead.id, startsAt: T0, status: "completed", mode: "phone" } });
      expect(await ladeZusammenfassung(t.id, { customerId: c2.id, userId: null, teamRole: "owner" }, T0)).toBeNull();
    } finally {
      await cleanupCustomer(c2.id);
    }
  });

  it("mitsenden: erst ohne offene Stelle; dann PDF an der Angebots-Mail, Hinweis im Text, Ablage als Beratungsdokumentation", async () => {
    const { t, pdf, lead } = await termin();
    const z = (await ladeZusammenfassung(t.id, ctx(), T0))!;
    const offen = await angebotSenden(t.id, ctx(), { dateiId: pdf.id, kundenlink: false, zusammenfassung: z.entwurf }, { now: T0 });
    expect(offen).toEqual({ ok: false, error: expect.stringContaining("ausfüllen") });
    expect(mails).toHaveLength(0);
    expect(wa).not.toHaveBeenCalled();

    const r = await angebotSenden(t.id, ctx(), { dateiId: pdf.id, kundenlink: false, zusammenfassung: { ...z.entwurf, rat: fertig(z.entwurf.rat) } }, { now: T0 });
    expect(r).toMatchObject({ ok: true, zusammenfassung: "gesendet" });
    expect(mails).toHaveLength(1);
    expect(mails[0].anhaenge).toEqual(["Angebot.pdf", expect.stringMatching(/^Beratungsdokumentation_Anna_Becker_\d{4}-\d{2}-\d{2}\.pdf$/)]);
    expect(mails[0].text).toContain("Im Anhang finden Sie außerdem die Zusammenfassung unseres Gesprächs.");
    const f = await prisma.leadFile.findFirstOrThrow({ where: { leadId: lead.id, kind: "beratungsdoku" } });
    expect(f.contentType).toBe("application/pdf");
    expect(Buffer.from(f.data).subarray(0, 4).toString()).toBe("%PDF");
    expect(f.aufbewahrenBis!.getTime() - f.createdAt.getTime()).toBeGreaterThan(3650 * 86_400_000);
    const h = await prisma.leadHistory.findFirst({ where: { leadId: lead.id, kind: "dokument" }, orderBy: { createdAt: "desc" } });
    expect(h?.text).toContain("Gesprächszusammenfassung mit dem Angebot per E-Mail gesendet und abgelegt");
  });

  it("nach „selbst gesendet“: per App senden (Vorlage + PDF), nur ablegen, Mailprogramm mit „Gesendet? Ja“", async () => {
    const { t, lead } = await termin();
    const z = (await ladeZusammenfassung(t.id, ctx(), T0))!;
    expect(z.appVersand).toBe(true);
    const text = { ...z.entwurf, rat: fertig(z.entwurf.rat) };

    const s = await zusammenfassungSenden(t.id, ctx(), text, { now: T0 });
    expect(s.ok).toBe(true);
    expect(mails.at(-1)).toMatchObject({ art: "beratungsdoku", subject: "Frau Becker, Zusammenfassung unseres Gesprächs" });
    expect(mails.at(-1)!.text).toContain("passt zur Familie, hohe Summe");
    expect(mails.at(-1)!.anhaenge).toHaveLength(1);

    const a = await zusammenfassungAblegen(t.id, ctx(), text);
    expect(a.ok).toBe(true);

    const m = await zusammenfassungSelbstGesendet(t.id, ctx(), { ...text, to: "anna@example.org", subject: "Zusammenfassung", text: "Text", dateiId: a.ok ? a.dateiId : null });
    expect(m.ok && a.ok && m.dateiId === a.dateiId).toBe(true);
    expect(await prisma.leadFile.count({ where: { leadId: lead.id, kind: "beratungsdoku" } })).toBe(2);
    expect(await prisma.contactMail.count({ where: { leadId: lead.id, kind: "beratungsdoku", provider: "mailprogramm" } })).toBe(1);
    expect(await ladeZusammenfassung(t.id, ctx(), T0).then((x) => x?.abgelegt?.id)).toBeTruthy();
  });

  it("KI: nur mit EU-Zugang, nie bei Gesundheitssparten; Ergebnis ohne Gesundheitsangaben", async () => {
    process.env.KI_EU_AWS_ACCESS_KEY_ID = "AKIA_TEST";
    process.env.KI_EU_AWS_SECRET_ACCESS_KEY = "geheim";
    const { t } = await termin();
    expect((await ladeZusammenfassung(t.id, ctx(), T0))!.ki).toBe(true);
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "WÜNSCHE:\n• Sie haben Familie.\nRAT:\n• Privathaftpflicht: Allianz Komfort" }] });
    const r = await zusammenfassungKi(t.id, ctx(), { wuensche: "• Familie\n• Hat Asthma", rat: "• Privathaftpflicht: Allianz Komfort" }, { client: { messages: { create } } });
    expect(r).toEqual({ ok: true, wuensche: "• Sie haben Familie.", rat: "• Privathaftpflicht: Allianz Komfort" });
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain("Asthma");

    const g = await termin({ source: "Zahnzusatzversicherung" });
    await prisma.appointment.update({ where: { id: g.t.id }, data: { offersJson: { items: [], quelle: [] } } });
    expect((await ladeZusammenfassung(g.t.id, ctx(), T0))!.ki).toBe(false);
    const nie = vi.fn();
    expect((await zusammenfassungKi(g.t.id, ctx(), { wuensche: "a", rat: "b" }, { client: { messages: { create: nie } } })).ok).toBe(false);
    expect(nie).not.toHaveBeenCalled();
  });

  it("Löschen des Leads: nur die Beratungsdokumentation bleibt, nach der Frist löscht der Cron sie", async () => {
    const { t, lead } = await termin();
    const z = (await ladeZusammenfassung(t.id, ctx(), T0))!;
    const a = await zusammenfassungAblegen(t.id, ctx(), { ...z.entwurf, rat: fertig(z.entwurf.rat) });
    expect(a.ok).toBe(true);
    const res = await eraseLead(lead.id);
    expect(res?.aufbewahrt).toBe(1);
    const rest = await prisma.leadFile.findMany({ where: { leadId: lead.id }, select: { kind: true, aufbewahrenBis: true } });
    expect(rest.map((f) => f.kind)).toEqual(["beratungsdoku"]);
    await pruneTransient(new Date());
    expect(await prisma.leadFile.count({ where: { leadId: lead.id } })).toBe(1);
    await pruneTransient(new Date(rest[0].aufbewahrenBis!.getTime() + 1000));
    expect(await prisma.leadFile.count({ where: { leadId: lead.id } })).toBe(0);
  });
});
