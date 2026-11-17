// Show-up-Vorlagen freigegeben (Ole, 17.11.2026): Ist das 24-h-Fenster zu, gehen Vortag, 1 Stunde, 15 Minuten und
// „wartet im Videoraum“ als Vorlage raus. Platzhalter je Version der freigegebenen Vorlage: v5 neu, bis Meta v5 für den
// Kunden freigegeben hat die bisherige v4 mit alter Belegung; ohne freigegebene Vorlage kein Versand (15 Min., Wartet).
// WhatsApp-API (360dialog) simuliert, Rest gegen die Test-DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const waSend = vi.fn();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return {
    ...real,
    sendText: (...a: unknown[]) => waSend("text", ...a),
    sendTemplate: (...a: unknown[]) => waSend("template", ...a),
    sendButtons: (...a: unknown[]) => waSend("buttons", ...a),
  };
});
vi.mock("@/lib/calendar/lead-email", () => ({ sendLeadEmail: async () => ({ sent: false }) }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { runReminders, runSoonReminders, runStartReminders } from "@/lib/whatsapp/reminders";
import { sendeWartetNachricht } from "@/lib/showup-server";
import { fillNames, templateTextFor, type NoticePurpose } from "@/lib/whatsapp/templates";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const MIN = 60 * 1000;
const H = 60 * MIN;
const LINK = "https://meet.google.com/abc-defg-hij";
const uid = () => Math.random().toString(36).slice(2, 10);

// Bisher freigegebene v4-Texte (Sie-Fassung mit Namen)
const V4: Partial<Record<NoticePurpose, string>> = {
  reminder: "Guten Tag {{1}}, kurze Erinnerung an Ihren Termin bei Agentur Kannapinn: {{2}} ({{3}}). {{4}} Passt der Termin für Sie?",
  reminder_soon: "Guten Tag {{1}}, gleich ist es so weit: Ihr Termin bei Agentur Kannapinn ist um {{2}} ({{3}}). {{4}} Passt bei Ihnen alles?",
};

describe("Show-up-Vorlagen: Versand bei geschlossenem Fenster", () => {
  let customerId = "";
  let n = 0;
  const vorlage = (purpose: NoticePurpose, version: 4 | 5) =>
    prisma.messageTemplate.create({
      data: {
        customerId,
        // wie automatisch eingereicht: pg_<zweck>_v<version>_sie
        name: `pg_${purpose}_v${version}_sie`,
        language: "de",
        purpose,
        category: "utility",
        status: "approved",
        auto: true,
        body: version === 4 ? V4[purpose]! : fillNames(templateTextFor(purpose, "sie"), "Agentur Kannapinn"),
      },
    });
  const termin = async (opts: { startsIn: number; bookedAgo: number; fensterOffen?: boolean }) => {
    const now = Date.now();
    const phone = `49151444${String(++n).padStart(4, "0")}`;
    const lead = await prisma.lead.create({
      data: {
        customerId,
        name: "Anna Becker",
        phone,
        source: "Privatschutz",
        formData: [
          { label: "Anrede", value: "Frau" },
          { label: "Versicherungsinteresse", value: "Haftpflicht und Hausrat" },
        ],
      },
    });
    const conv = await prisma.conversation.create({
      data: { customerId, contactPhone: phone, contactName: "Anna Becker", leadId: lead.id, windowExpiresAt: opts.fensterOffen ? new Date(now + H) : new Date(now - H) },
    });
    const appt = await prisma.appointment.create({
      data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "video", meetUrl: LINK, status: "booked", startsAt: new Date(now + opts.startsIn), createdAt: new Date(now - opts.bookedAgo) },
    });
    return { appt, phone };
  };
  /** Gesendete Vorlagen an diese Nummer: Name und Text-Parameter. */
  const vorlagenAn = (phone: string) =>
    waSend.mock.calls
      .filter((c) => c[0] === "template" && c[2] === phone)
      .map((c) => ({
        name: c[3] as string,
        params: ((c[5] as { type: string; parameters: { text: string }[] }[]).find((x) => x.type === "body")?.parameters ?? []).map((p) => p.text),
      }));
  const texteAn = (phone: string) => waSend.mock.calls.filter((c) => (c[0] === "text" || c[0] === "buttons") && c[2] === phone);

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    customerId = (await makeCustomer({ name: `Agentur Ole Kannapinn ${uid()}`, leadAddress: "sie" })).id;
    await prisma.erstinformation.create({ data: { customerId, name: "Ole Kannapinn", anrede: "Herr", token: `t${customerId}` } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: `pnid-${uid()}`, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(async () => {
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
    await prisma.messageTemplate.deleteMany({ where: { customerId } });
  });

  it("Vortag: nur v4 freigegeben → v4 mit alter Belegung; v5 freigegeben → v5 mit Wann, Nutzen, Zugang", async () => {
    await vorlage("reminder", 4);
    const alt = await termin({ startsIn: 23 * H, bookedAgo: 30 * H });
    await runReminders();
    const [a] = vorlagenAn(alt.phone);
    expect(a.name).toBe("pg_reminder_v4_sie");
    expect(a.params).toHaveLength(4);
    expect(a.params[0]).toBe("Frau Becker");
    expect(a.params.slice(2)).toEqual(["Videocall", LINK]);

    await vorlage("reminder", 5);
    const neu = await termin({ startsIn: 23 * H, bookedAgo: 30 * H });
    await runReminders();
    const [b] = vorlagenAn(neu.phone);
    expect(b.name).toBe("pg_reminder_v5_sie");
    expect(b.params[0]).toBe("Frau Becker");
    expect(b.params[1]).toMatch(/^morgen um \d+(:\d{2})? Uhr$/);
    expect(b.params[2]).toContain("Herr Kannapinn");
    expect(b.params[3]).toBe(LINK);
  });

  it("1 Stunde: v4 mit Uhrzeit, Art, Link; v5 mit Terminart und Vermittler im Dativ", async () => {
    await vorlage("reminder_soon", 4);
    const alt = await termin({ startsIn: 55 * MIN, bookedAgo: 3 * H });
    await runSoonReminders();
    const [a] = vorlagenAn(alt.phone);
    expect(a.name).toBe("pg_reminder_soon_v4_sie");
    expect(a.params[0]).toBe("Frau Becker");
    expect(a.params.slice(2)).toEqual(["Videocall", LINK]);

    await vorlage("reminder_soon", 5);
    const neu = await termin({ startsIn: 55 * MIN, bookedAgo: 3 * H });
    await runSoonReminders();
    expect(vorlagenAn(neu.phone)).toEqual([{ name: "pg_reminder_soon_v5_sie", params: ["Frau Becker", "Videotermin", "Herrn Kannapinn"] }]);
  });

  it("1 Stunde ohne eigene Vorlage: Rückfall auf die Erinnerungs-Vorlage, je Version richtig belegt", async () => {
    await vorlage("reminder", 5);
    const t = await termin({ startsIn: 55 * MIN, bookedAgo: 3 * H });
    await runSoonReminders();
    const [a] = vorlagenAn(t.phone);
    expect(a.name).toBe("pg_reminder_v5_sie");
    expect(a.params[1]).toMatch(/^(heute|morgen) um /);
    expect(a.params[3]).toBe(LINK);
  });

  it("15 Minuten: ohne freigegebene Vorlage still, mit v5 als Vorlage, im offenen Fenster Freitext", async () => {
    const ohne = await termin({ startsIn: 14 * MIN, bookedAgo: 3 * H });
    expect((await runStartReminders()).errors).toEqual([]);
    expect(waSend.mock.calls.filter((c) => c[2] === ohne.phone)).toHaveLength(0);

    await vorlage("reminder_start", 5);
    const mit = await termin({ startsIn: 14 * MIN, bookedAgo: 3 * H });
    await runStartReminders();
    const [a] = vorlagenAn(mit.phone);
    expect(a.name).toBe("pg_reminder_start_v5_sie");
    expect(a.params[0]).toBe("Frau Becker");
    expect(a.params[1]).toBe("Herr Kannapinn");
    expect(a.params[2]).toMatch(/^\d+(:\d{2})? Uhr$/);
    expect(a.params[3]).toBe(LINK);

    const offen = await termin({ startsIn: 14 * MIN, bookedAgo: 3 * H, fensterOffen: true });
    await runStartReminders();
    expect(vorlagenAn(offen.phone)).toHaveLength(0);
    expect(texteAn(offen.phone)).toHaveLength(1);
  });

  it("Wartet im Videoraum: ohne Vorlage nicht möglich, mit v5 als Vorlage, im offenen Fenster Freitext", async () => {
    const ohne = await termin({ startsIn: -2 * MIN, bookedAgo: 3 * H });
    expect(await sendeWartetNachricht(ohne.appt.id)).toBe("nicht_moeglich");

    await vorlage("appt_waiting", 5);
    const mit = await termin({ startsIn: -2 * MIN, bookedAgo: 3 * H });
    expect(await sendeWartetNachricht(mit.appt.id)).toBe("vorlage");
    expect(vorlagenAn(mit.phone)).toEqual([{ name: "pg_appt_waiting_v5_sie", params: ["Frau Becker", "Herr Kannapinn", LINK] }]);

    const offen = await termin({ startsIn: -2 * MIN, bookedAgo: 3 * H, fensterOffen: true });
    expect(await sendeWartetNachricht(offen.appt.id)).toBe("gesendet");
    expect(texteAn(offen.phone)[0][3]).toBe(`Guten Tag Frau Becker, Herr Kannapinn wartet schon im Videoraum auf Sie: ${LINK}`);
  });
});
