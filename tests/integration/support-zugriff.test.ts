// Dokumente im Admin-Chat und Support-Zugriff (Ole, 25.11.2026, lib/support-zugriff.ts, lib/chat-dateien.ts):
// Metadaten inkl. „geschützt“, Pflicht-Grund, signierter Link, unveränderbares Protokoll für den Vermittler,
// Mitteilungstext, Sperre bei Gesundheitsbezug bzw. Policen-Ablage, keine Dateinamen mit Gesundheitsbezug im Log.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const media = vi.fn();
vi.mock("@/lib/policen/media", () => ({ ladeMedia: (...a: unknown[]) => media(...a), loescheMedia: async () => true, downloadUrl: (u: string) => u }));
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 0, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
// Policen-Strecke: hier nur, dass eingehende Dateien im Lead-Chat dort landen (eigene Tests in policen-*.test.ts)
vi.mock("@/lib/policen/server", async (orig) => ({ ...(await orig<typeof import("@/lib/policen/server")>()), handleInboundMedia: async () => ({ handled: true }) }));
vi.mock("@/lib/whatsapp/dialog360", async (orig) => ({ ...(await orig<typeof import("@/lib/whatsapp/dialog360")>()), sendText: async () => ({ messageId: "x", raw: {} }) }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { dateienImVerlauf, ladeZugriffInhalt, starteSupportZugriff, supportZugriffeFuer } from "@/lib/support-zugriff";
import { pruefeZugriffToken } from "@/lib/support-zugriff-link";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const jetzt = new Date("2026-11-25T13:03:00Z");

describe("Support-Zugriff auf Dokumente im Chat", () => {
  let customerId = "";
  let ownerId = "";
  let beraterId = "";
  let andererBeraterId = "";
  let adminId = "";
  let leadId = "";
  let chatId = "";
  const pnid = `pnid-sz-${uid()}`;
  const business = "4930123450000";
  const phone = newPhone();
  const mitteilungen: Array<{ customerId: string; userIds: string[]; mitteilung: string }> = [];
  const mitteilen = async (o: { customerId: string; userIds: string[]; mitteilung: string }) => void mitteilungen.push(o);

  const dok = (x: Record<string, unknown> = {}) =>
    prisma.message.create({
      data: {
        conversationId: chatId,
        direction: "outbound",
        kind: "document",
        body: "[document]",
        sentBy: "app",
        mediaId: `media-${uid()}`,
        mediaName: "Angebot_Hausrat.pdf",
        mediaMime: "application/pdf",
        mediaSize: 120 * 1024,
        createdAt: new Date(jetzt.getTime() - 60_000),
        ...x,
      },
    });

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.AUTH_SECRET ||= "localtestsecret_localtestsecret_0123456789";
    const c = await makeCustomer({ name: `Agentur Sz ${uid()}` });
    customerId = c.id;
    const owner = await makeBuyer(customerId, "owner");
    ownerId = owner.id;
    await prisma.user.update({ where: { id: ownerId }, data: { displayName: "Anid Beispiel" } });
    beraterId = (await makeBuyer(customerId, "advisor")).id;
    andererBeraterId = (await makeBuyer(customerId, "advisor")).id;
    adminId = (await prisma.user.create({ data: { email: `ole.kannapinn.${uid()}@test.local`, passwordHash: "x", role: "ADMIN", displayName: "Ole Kannapinn" } })).id;
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
    leadId = (await prisma.lead.create({ data: { customerId, name: "Max Muster", phone, source: "Hausrat", assignedUserId: beraterId } })).id;
    chatId = (await prisma.conversation.create({ data: { customerId, contactPhone: phone, contactName: "Max Muster", leadId, botActive: false } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: adminId } });
    await cleanupCustomer(customerId);
  });
  beforeEach(() => {
    mitteilungen.length = 0;
    media.mockReset();
  });

  it("Admin-Verlauf zeigt Name, Art, Größe, Absender; Policen-Ablage nur „Unterlage (geschützt)“", async () => {
    const m = await dok();
    const rein = await prisma.message.create({ data: { conversationId: chatId, direction: "inbound", kind: "document", body: "Dokument empfangen", mediaMime: "application/pdf", createdAt: jetzt } });
    await prisma.leadDocument.create({ data: { customerId, leadId, conversationId: chatId, messageId: rein.id, mimeType: "application/pdf", fileName: "Arztbrief_Diagnose.pdf", size: 2048 } });
    const msgs = await prisma.message.findMany({ where: { id: { in: [m.id, rein.id] } } });
    const d = await dateienImVerlauf({ id: chatId, customerId, leadId, contactName: "Max Muster" }, msgs, jetzt);
    expect(d.get(m.id)!.zeile).toBe("Angebot_Hausrat.pdf · PDF · 120 KB · von Anid");
    expect(d.get(m.id)!.zugriff).toBe("moeglich");
    const g = d.get(rein.id)!;
    expect(g.titel).toBe("Unterlage (geschützt)");
    expect(JSON.stringify(g)).not.toContain("Arztbrief");
    expect(g.zugriff).toBe("gesperrt");
  });

  it("Grund ist Pflicht: unter 10 Zeichen abgelehnt, kein Protokoll, keine Mitteilung", async () => {
    const m = await dok();
    const r = await starteSupportZugriff({ admin: { userId: adminId, email: "o@test.local" }, messageId: m.id, grund: "kurz", now: jetzt }, { mitteilen });
    expect(r).toEqual({ ok: false, fehler: "Bitte einen Grund mit mindestens 10 Zeichen angeben." });
    expect(await prisma.supportZugriff.count({ where: { messageId: m.id } })).toBe(0);
    expect(mitteilungen).toHaveLength(0);
  });

  it("Zugriff: Protokoll, Mitteilung mit genauem Wortlaut, Link 15 Minuten nur für diesen Admin", async () => {
    const m = await dok();
    const r = await starteSupportZugriff(
      { admin: { userId: adminId, email: "o@test.local" }, messageId: m.id, grund: "Vermittler bittet um Prüfung – Angebot unklar", now: jetzt },
      { mitteilen },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const z = await prisma.supportZugriff.findUniqueOrThrow({ where: { id: r.zugriffId } });
    expect(z).toMatchObject({ customerId, conversationId: chatId, messageId: m.id, leadId, adminUserId: adminId, adminName: "Ole Kannapinn", dateiName: "Angebot_Hausrat.pdf" });
    const text =
      "Ole Kannapinn hat am 25.11.2026 um 14:03 im Rahmen des Supports das Dokument „Angebot_Hausrat.pdf“ im Chat mit Max geöffnet. Grund: Vermittler bittet um Prüfung, Angebot unklar.";
    expect(z.mitteilung).toBe(text);
    expect(z.grund).not.toMatch(/[–—]/);
    expect(mitteilungen).toHaveLength(1);
    expect(mitteilungen[0].mitteilung).toBe(text);
    expect(new Set(mitteilungen[0].userIds)).toEqual(new Set([ownerId, beraterId]));
    // Änderungsprotokoll ohne Dateinamen
    const a = await prisma.auditLog.findFirstOrThrow({ where: { action: "support.zugriff", entityId: m.id } });
    expect(JSON.stringify(a.details)).not.toContain("Angebot_Hausrat");

    const token = decodeURIComponent(r.url.split("/").pop()!);
    expect(pruefeZugriffToken(token, adminId, new Date(jetzt.getTime() + 14 * 60_000)).ok).toBe(true);
    expect(pruefeZugriffToken(token, adminId, new Date(jetzt.getTime() + 16 * 60_000))).toEqual({ ok: false, grund: "abgelaufen" });
    expect(pruefeZugriffToken(token, ownerId, new Date(jetzt.getTime() + 60_000))).toEqual({ ok: false, grund: "fremd" });

    // Inhalt über die Media-ID (nur innerhalb von 15 Minuten)
    media.mockResolvedValue({ ok: true, data: Buffer.from("%PDF-1.4 test"), mime: "application/pdf" });
    const inhalt = await ladeZugriffInhalt(r.zugriffId, new Date(jetzt.getTime() + 60_000));
    expect(inhalt?.name).toBe("Angebot_Hausrat.pdf");
    expect(inhalt?.data.toString()).toContain("%PDF");
    expect(await ladeZugriffInhalt(r.zugriffId, new Date(jetzt.getTime() + 16 * 60_000))).toBeNull();
  });

  it("Protokoll ist unveränderbar (kein Update, kein Löschen)", async () => {
    const m = await dok();
    const r = await starteSupportZugriff({ admin: { userId: adminId, email: "o@test.local" }, messageId: m.id, grund: "Rückfrage des Vermittlers zum Dokument", now: jetzt }, { mitteilen });
    if (!r.ok) throw new Error(r.fehler);
    await expect(prisma.supportZugriff.update({ where: { id: r.zugriffId }, data: { grund: "geändert, geändert" } })).rejects.toThrow();
    await expect(prisma.supportZugriff.delete({ where: { id: r.zugriffId } })).rejects.toThrow();
    await expect(prisma.supportZugriff.deleteMany({ where: { customerId } })).rejects.toThrow();
    expect((await prisma.supportZugriff.findUniqueOrThrow({ where: { id: r.zugriffId } })).grund).toBe("Rückfrage des Vermittlers zum Dokument");
  });

  it("Vermittler sieht das Protokoll: Inhaber alles, zuständiger Berater seine Leads, andere nichts", async () => {
    const owner = await supportZugriffeFuer({ customerId, userId: ownerId, teamRole: "owner" });
    expect(owner.length).toBeGreaterThan(0);
    expect(owner[0].mitteilung).toMatch(/^Ole Kannapinn hat am .* im Chat mit Max geöffnet\. Grund: /);
    expect((await supportZugriffeFuer({ customerId, userId: beraterId, teamRole: "advisor" })).length).toBe(owner.length);
    expect(await supportZugriffeFuer({ customerId, userId: andererBeraterId, teamRole: "advisor" })).toEqual([]);
    expect(await supportZugriffeFuer({ customerId: "fremd", userId: ownerId, teamRole: "owner" })).toEqual([]);
  });

  it("gesperrt: Policen-Ablage, Dateiname mit Gesundheitsbezug, Lead aus Kranken/BU/Leben; kein Protokoll", async () => {
    const rein = await prisma.message.create({ data: { conversationId: chatId, direction: "inbound", kind: "document", body: "Dokument empfangen", mediaId: "m-x" } });
    const bu = await dok({ mediaName: "BU_Antrag_Gesundheitsfragen.pdf" });
    for (const id of [rein.id, bu.id]) {
      const r = await starteSupportZugriff({ admin: { userId: adminId, email: "o@test.local" }, messageId: id, grund: "Vermittler bittet um Prüfung", now: jetzt }, { mitteilen });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler).toContain("Break-Glass");
      expect(await prisma.supportZugriff.count({ where: { messageId: id } })).toBe(0);
    }
    const pkvLead = await prisma.lead.create({ data: { customerId, name: "Pia Kranz", phone: newPhone(), source: "PKV Vollversicherung" } });
    const pkvChat = await prisma.conversation.create({ data: { customerId, contactPhone: pkvLead.phone!, leadId: pkvLead.id } });
    const pkv = await prisma.message.create({ data: { conversationId: pkvChat.id, direction: "outbound", kind: "document", body: "[document]", sentBy: "app", mediaId: "m-y", mediaName: "Angebot.pdf" } });
    const r = await starteSupportZugriff({ admin: { userId: adminId, email: "o@test.local" }, messageId: pkv.id, grund: "Vermittler bittet um Prüfung", now: jetzt }, { mitteilen });
    expect(r.ok).toBe(false);
    expect(mitteilungen).toHaveLength(0);
  });

  it("nur Admins: Vermittler-Login kann keinen Zugriff auslösen", async () => {
    const m = await dok();
    const r = await starteSupportZugriff({ admin: { userId: ownerId, email: "x@test.local" }, messageId: m.id, grund: "Ich möchte das Dokument sehen", now: jetzt }, { mitteilen });
    expect(r).toEqual({ ok: false, fehler: "Nicht erlaubt." });
    expect(await prisma.supportZugriff.count({ where: { messageId: m.id } })).toBe(0);
  });

  it("Empfang: Lead-Chat nur Typ; WhatsApp-App mit Name und Media-ID; keine Dateinamen mit Gesundheitsbezug im Log", async () => {
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void logs.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === "string" ? x : JSON.stringify(x))).join(" "))),
    );
    try {
      const value = (extra: Record<string, unknown>) => ({ messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: business }, ...extra });
      const inId = `wamid.in-${uid()}`;
      await handleInboundPayload({
        entry: [{ changes: [{ field: "messages", value: value({ contacts: [{ profile: { name: "Max" } }], messages: [{ from: phone, id: inId, type: "document", document: { id: "media-in", mime_type: "application/pdf", filename: "Arztbrief_Diagnose_Max.pdf" } }] }) }] }],
      });
      const rein = await prisma.message.findUniqueOrThrow({ where: { waMessageId: inId } });
      expect(rein).toMatchObject({ kind: "document", mediaMime: "application/pdf", mediaName: null, mediaId: null });

      const echoId = `wamid.echo-${uid()}`;
      await handleInboundPayload({
        entry: [
          {
            changes: [
              {
                field: "smb_message_echoes",
                value: value({ message_echoes: [{ from: business, to: phone, id: echoId, type: "document", document: { id: "media-echo", mime_type: "application/pdf", filename: "Gesundheitsfragen_BU.pdf" } }] }),
              },
            ],
          },
        ],
      });
      const echo = await prisma.message.findUniqueOrThrow({ where: { waMessageId: echoId } });
      expect(echo).toMatchObject({ direction: "outbound", sentBy: "app", mediaId: "media-echo", mediaName: "Gesundheitsfragen_BU.pdf" });
      const d = await dateienImVerlauf({ id: chatId, customerId, leadId, contactName: "Max Muster" }, [echo], jetzt);
      expect(d.get(echo.id)!.titel).toBe("Unterlage (geschützt)");

      // Gesperrter Versuch, Fehler beim Laden und echte Mitteilung (ohne Mail-Schlüssel: Warnung im Log)
      await starteSupportZugriff({ admin: { userId: adminId, email: "o@test.local" }, messageId: echo.id, grund: "Vermittler bittet um Prüfung", now: jetzt });
      const ok = await dok();
      const r = await starteSupportZugriff({ admin: { userId: adminId, email: "o@test.local" }, messageId: ok.id, grund: "Vermittler bittet um Prüfung", now: jetzt });
      expect(r.ok).toBe(true);
      media.mockResolvedValue({ ok: false, grund: "fehler", detail: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=geheim" });
      if (r.ok) expect(await ladeZugriffInhalt(r.zugriffId, new Date(jetzt.getTime() + 60_000))).toBeNull();
    } finally {
      for (const s of spies) s.mockRestore();
    }
    const alles = logs.join("\n");
    expect(alles).not.toContain("Arztbrief");
    expect(alles).not.toContain("Gesundheitsfragen");
    expect(alles).not.toContain("lookaside");
  });
});

describe("Support-Zugriffe: Aufbewahrung 1 Jahr (Ole, 25.11.2026)", () => {
  it("pruneAudit löscht Protokolleinträge älter als 1 Jahr, neuere bleiben", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { pruneAudit } = await import("@/lib/audit");
    const tag = Math.random().toString(36).slice(2, 8);
    const alt = new Date(Date.now() - 400 * 86_400_000);
    await prisma.supportZugriff.createMany({
      data: [
        { customerId: `k-${tag}`, conversationId: "c", messageId: "m1", adminUserId: "a", adminName: "A", grund: "Test alt genug", dateiName: "x.pdf", mitteilung: "x", createdAt: alt },
        { customerId: `k-${tag}`, conversationId: "c", messageId: "m2", adminUserId: "a", adminName: "A", grund: "Test neu genug", dateiName: "y.pdf", mitteilung: "y" },
      ],
    });
    await pruneAudit(new Date());
    const rest = await prisma.supportZugriff.findMany({ where: { customerId: `k-${tag}` }, select: { messageId: true } });
    expect(rest.map((r) => r.messageId)).toEqual(["m2"]);
  });
});
