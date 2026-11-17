// Diagnose ?q=vertrieb-termine (Ole, 17.11.2026): gesendete Bestätigungen und Erinnerungen der Support-Nummer mit
// Termin, Zustellstatus und Auffälligkeiten, ohne Telefonnummern, Nachnamen, Inhalte und Tokens.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ops/diagnose/route";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { renderTemplate } from "@/lib/whatsapp/templates";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { TERMIN_VORLAGEN } from "@/lib/vertrieb/termin-whatsapp";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const TOKEN = "test-read-token-0123456789-0123456789-abcdef";
const tag = Math.random().toString(36).slice(2, 8);
const PH = `49171${Math.floor(1e6 + Math.random() * 8e6)}`;
const LAST = `Geheimname${tag}`;
const MANAGE = `tok${tag}abcdefghijklmnopq`;
const H = 3600_000;
const vorlage = (name: string) => TERMIN_VORLAGEN.find((v) => v.name === name)!;

describe("Diagnose: WhatsApp zu Vertriebsterminen", () => {
  const before = process.env.OPS_READ_TOKEN;
  let customerId = "";
  let contactId = "";
  let convId = "";
  let ownId = "";
  let calId = "";
  const start = new Date("2030-03-06T09:00:00Z"); // 10:00 Berlin
  const booked = new Date("2030-03-01T08:00:00Z");

  beforeAll(async () => {
    requireTestDb();
    process.env.OPS_READ_TOKEN = TOKEN;
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    await prisma.customer.upsert({ where: { id: SUPPORT_CUSTOMER_ID }, create: { id: SUPPORT_CUSTOMER_ID, name: "performancegrowth Support", plan: "internal" }, update: {} });
    await prisma.whatsAppAccount.upsert({
      where: { customerId: SUPPORT_CUSTOMER_ID },
      create: { customerId: SUPPORT_CUSTOMER_ID, status: "connected", apiKeyEnc: encryptSecret("k") },
      update: {},
    });
    customerId = (await makeCustomer()).id;
    // Gleiche Nummer ist auch Lead eines Vermittlers
    await prisma.lead.create({ data: { customerId, name: `Lead ${tag}`, phone: `+${PH}` } });
    const c = await prisma.salesContact.create({ data: { name: `Agentur ${tag}`, firstName: "Erika", lastName: LAST, phone: `+${PH}`, email: `e-${tag}@example.test`, stage: "TERMIN" } });
    contactId = c.id;
    const own = await prisma.salesMeeting.create({
      data: {
        contactId,
        title: "Meta-Leads-Call",
        startAt: start,
        createdAt: booked,
        manageToken: MANAGE,
        inviteePhone: `+${PH}`,
        inviteeName: `Erika ${LAST}`,
        location: "Videocall",
        waConfirmStatus: "sent",
        waConfirmAt: booked,
        waReminderAt: new Date(start.getTime() - 24 * H),
        waSoonAt: new Date(start.getTime() - H),
      },
    });
    ownId = own.id;
    // Derselbe Kontakt hat zur selben Zeit auch über Calendly gebucht (nicht gesendet, aber auffällig)
    const cal = await prisma.salesMeeting.create({
      data: { contactId, title: "Meta-Leads-Call", startAt: new Date(start.getTime() + 30 * 60_000), createdAt: booked, calendlyUri: `https://api.calendly.com/inv/${tag}`, waConfirmStatus: "failed", waConfirmAt: booked, waConfirmError: `360dialog 400: recipient +${PH} invalid` },
    });
    calId = cal.id;
    const conv = await prisma.conversation.create({ data: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: PH, contactName: `Erika ${LAST}`, botActive: false, salesContactId: contactId, lastMessageAt: start } });
    convId = conv.id;
    const link = `https://app.example/termin/verwalten/${MANAGE}`;
    const msg = (name: string, params: string[], at: Date, extra: Record<string, unknown> = {}) =>
      prisma.message.create({
        data: { conversationId: convId, direction: "outbound", kind: "template", body: renderTemplate(vorlage(name).body, params), status: "delivered", sentBy: "system", createdAt: at, waMessageId: `wamid.${tag}.${at.getTime()}.${Math.random()}`, ...extra },
      });
    await msg("pg_vertrieb_termin_v2", ["Frau " + LAST, "Mittwoch, 6. März", "10:00", link], new Date(booked.getTime() + 2000), {
      status: "failed",
      errorCode: 131026,
      errorTitle: `Message undeliverable for +${PH}`,
    });
    // 24 h: doppelt gesendet
    await msg("pg_vertrieb_erinnerung_v2", ["Frau " + LAST, "10:00", link], new Date(start.getTime() - 24 * H + 1000), { status: "read" });
    await msg("pg_vertrieb_erinnerung_v2", ["Frau " + LAST, "10:00", link], new Date(start.getTime() - 24 * H + 60_000));
    // Kontakt schreibt „STOPP“, danach kommt trotzdem die 1-Stunden-Erinnerung (und zu spät: 20 Minuten vorher)
    await prisma.message.create({ data: { conversationId: convId, direction: "inbound", kind: "text", body: "STOPP", createdAt: new Date(start.getTime() - 2 * H) } });
    await prisma.salesMeeting.update({ where: { id: ownId }, data: { waSoonAt: new Date(start.getTime() - 20 * 60_000) } });
    await msg("pg_vertrieb_gleich_v1", ["Frau " + LAST, "10:00", "per Video", link], new Date(start.getTime() - 20 * 60_000 + 1000), { status: "sent" });
  });

  afterAll(async () => {
    process.env.OPS_READ_TOKEN = before;
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.salesContact.deleteMany({ where: { id: contactId } });
    await cleanupCustomer(customerId);
  });

  it("liefert Termin, Quelle, Art, Zustellung und Auffälligkeiten, ohne Nummern, Nachnamen, Inhalte und Tokens", async () => {
    const r = await GET(new Request(`https://app.test/api/ops/diagnose?q=vertrieb-termine&seit=2030-02-01&link=1`, { headers: { authorization: `Bearer ${TOKEN}` } }));
    expect(r.status).toBe(200);
    const text = await r.text();
    type Zeile = { art: string; fehler: string | null };
    type A = Record<"doppelt" | "zuSpaet" | "nachStopp" | "fremdeEmpfaenger" | "calendlyUndEigen" | "bestaetigungFehler", unknown[]>;
    const d = (JSON.parse(text) as { data: { anzahl: number; ohneTermin: number; rows: Zeile[]; auffaelligkeiten: A; links: unknown[] } }).data;
    expect(d.anzahl).toBe(4);
    expect(d.ohneTermin).toBe(0);
    expect(d.rows.map((x: { art: string }) => x.art)).toEqual(["bestaetigung", "24h", "24h", "1h"]);
    expect(d.rows[0]).toMatchObject({ terminId: ownId, quelle: "buchungsseite", vorlage: "pg_vertrieb_termin_v2", zustellung: "failed", kontaktId: contactId, vorname: "Erika" });
    expect(d.rows[0].fehler).toMatch(/^131026 Message undeliverable for \[Nummer\]$/);
    const a = d.auffaelligkeiten;
    expect(a.doppelt).toEqual([{ terminId: ownId, art: "24h", anzahl: 2 }]);
    expect(a.zuSpaet).toEqual([expect.objectContaining({ terminId: ownId, art: "1h", grund: "später als geplant" })]);
    expect(a.nachStopp).toEqual([expect.objectContaining({ terminId: ownId, art: "1h", stoppGeschrieben: true, sperreGesetzt: false })]);
    expect(a.fremdeEmpfaenger).toEqual([expect.objectContaining({ kontaktId: contactId, leads: 1, bestandskunden: 0, kundenIds: [customerId] })]);
    expect(a.calendlyUndEigen).toEqual([expect.objectContaining({ calendlyTerminId: calId, eigenerTerminId: ownId, abstandMin: 30 })]);
    expect(a.bestaetigungFehler).toEqual([{ terminId: calId, quelle: "calendly", status: "failed", fehler: "360dialog 400: recipient [Nummer] invalid" }]);
    expect(d.links).toEqual([expect.objectContaining({ terminId: ownId, linkArt: "buchungsseite", tokenGueltig: true, gehoertZumTermin: true, aktuellerToken: true })]);
    // Keine Telefonnummer (auch nicht ohne Ländervorwahl), kein Nachname, kein Token, keine Inhalte
    expect(text).not.toContain(PH);
    expect(text).not.toContain(PH.slice(2));
    expect(text).not.toContain(LAST);
    expect(text).not.toContain(MANAGE);
    expect(text).not.toContain("Guten Tag");
    expect(text).not.toContain("STOPP");
  });
});
