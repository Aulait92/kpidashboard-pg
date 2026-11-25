// Dateien im Chat für Vermittler (Ole, 25.11.2026, lib/chat-dateien-vermittler.ts, api/buyer/chats/datei/[id]):
// Inhaber öffnet eigene Chat-Dateien, Berater nur in Chats seiner Leads, fremde Kunden und Admin-Vorschau nie,
// Gesundheitsbezug nur mit Zwei-Faktor-Login (Weiterleitung zur Einrichtung), Policen-Ablage nur im Kontakt,
// kein Support-Protokoll.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ ctx: null as null | Record<string, unknown> }));
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => st.ctx }));
const media = vi.fn();
vi.mock("@/lib/policen/media", () => ({ ladeMedia: (...a: unknown[]) => media(...a), loescheMedia: async () => true, downloadUrl: (u: string) => u }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { ladeVermittlerDatei, vermittlerDateienImVerlauf } from "@/lib/chat-dateien-vermittler";
import { GET } from "@/app/api/buyer/chats/datei/[id]/route";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4916${String(Date.now()).slice(-5)}${String(++seq).padStart(3, "0")}`;

describe("Chat-Dateien im Kundenbereich", () => {
  let customerId = "";
  let fremdId = "";
  let ownerId = "";
  let beraterId = "";
  let andererBeraterId = "";
  let chatBerater = "";
  let chatAnderer = "";
  let chatGesundheit = "";
  let leadBerater = "";

  const owner = () => ({ customerId, userId: ownerId, teamRole: "owner" as const, preview: false, email: "inhaber@test.local" });
  const berater = (id = beraterId) => ({ customerId, userId: id, teamRole: "advisor" as const, preview: false });

  async function chat(o: { source: string; assignedUserId: string | null }) {
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId, name: "Max Muster", phone, source: o.source, assignedUserId: o.assignedUserId } });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: lead.id, status: "open" } });
    return { lead, conv };
  }
  const dok = (conversationId: string, x: Record<string, unknown> = {}) =>
    prisma.message.create({
      data: {
        conversationId,
        direction: "outbound",
        kind: "document",
        body: "[document]",
        sentBy: "app",
        mediaId: `media-${uid()}`,
        mediaName: "Angebot_Hausrat.pdf",
        mediaMime: "application/pdf",
        mediaSize: 1234,
        ...x,
      },
    });

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    customerId = (await makeCustomer()).id;
    fremdId = (await makeCustomer()).id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    beraterId = (await makeBuyer(customerId, "advisor")).id;
    andererBeraterId = (await makeBuyer(customerId, "advisor")).id;
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: `pn-cdv-${uid()}`, apiKeyEnc: encryptSecret("k") } });
    const a = await chat({ source: "hausrat", assignedUserId: beraterId });
    chatBerater = a.conv.id;
    leadBerater = a.lead.id;
    chatAnderer = (await chat({ source: "hausrat", assignedUserId: andererBeraterId })).conv.id;
    chatGesundheit = (await chat({ source: "pkv", assignedUserId: beraterId })).conv.id;
  });
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
    await cleanupCustomer(fremdId);
  });
  beforeEach(() => {
    media.mockReset();
    media.mockResolvedValue({ ok: true, data: Buffer.from("%PDF-1.4 test"), mime: "application/pdf" });
  });

  it("Inhaber und zuständiger Berater öffnen, anderer Berater, fremder Kunde und Admin-Vorschau nicht; kein Support-Protokoll", async () => {
    const m = await dok(chatBerater);
    expect(await ladeVermittlerDatei(owner(), m.id)).toMatchObject({ ok: true, name: "Angebot_Hausrat.pdf", mime: "application/pdf" });
    expect(await ladeVermittlerDatei(berater(), m.id)).toMatchObject({ ok: true });
    expect(await ladeVermittlerDatei(berater(andererBeraterId), m.id)).toEqual({ ok: false, grund: "nicht_gefunden" });
    expect(await ladeVermittlerDatei({ customerId: fremdId, userId: ownerId, teamRole: "owner", preview: false }, m.id)).toEqual({ ok: false, grund: "nicht_gefunden" });
    expect(await ladeVermittlerDatei({ ...owner(), preview: true }, m.id)).toEqual({ ok: false, grund: "nicht_gefunden" });
    expect(await prisma.supportZugriff.count({ where: { messageId: m.id } })).toBe(0);
    // anderer Berater: eigener Chat geht
    const n = await dok(chatAnderer);
    expect(await ladeVermittlerDatei(berater(andererBeraterId), n.id)).toMatchObject({ ok: true });
  });

  it("Gesundheitsbezug: ohne Zwei-Faktor-Login Weiterleitung zur Einrichtung, mit Zwei-Faktor-Login Abruf mit Protokoll ohne Dateinamen", async () => {
    const m = await dok(chatGesundheit, { mediaName: "Angebot_PKV.pdf" });
    st.ctx = berater();
    const r = await GET(new Request(`https://app.example.de/api/buyer/chats/datei/${m.id}`), { params: Promise.resolve({ id: m.id }) });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`/buyer/konto/sicherheit/zwei-faktor?zurueck=${encodeURIComponent(`/buyer/chats?c=${chatGesundheit}`)}`);
    expect(media).not.toHaveBeenCalled();

    await prisma.user.update({ where: { id: beraterId }, data: { totpEnabledAt: new Date(), totpSecretEnc: encryptSecret("JBSWY3DPEHPK3PXP") } });
    const ok = await GET(new Request(`https://app.example.de/api/buyer/chats/datei/${m.id}`), { params: Promise.resolve({ id: m.id }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(ok.headers.get("content-disposition")).toContain("inline");
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    const log = await prisma.auditLog.findFirst({ where: { action: "chat.datei_abruf", entityId: m.id } });
    expect(log).toBeTruthy();
    expect(JSON.stringify(log)).not.toContain("PKV");
    await prisma.user.update({ where: { id: beraterId }, data: { totpEnabledAt: null, totpSecretEnc: null } });
  });

  it("Policen-Ablage: im Chat kein Abruf, Karte verweist auf die Unterlagen im Kontakt", async () => {
    const m = await prisma.message.create({ data: { conversationId: chatBerater, direction: "inbound", kind: "document", body: "[document]", mediaMime: "application/pdf" } });
    await prisma.leadDocument.create({
      data: { customerId, leadId: leadBerater, messageId: m.id, fileName: "Police_Kfz.pdf", mimeType: "application/pdf", size: 2048, status: "gespeichert" },
    });
    expect(await ladeVermittlerDatei(owner(), m.id)).toEqual({ ok: false, grund: "nicht_abrufbar", conversationId: chatBerater });
    const karten = await vermittlerDateienImVerlauf({ id: chatBerater, leadId: leadBerater }, [{ ...m }], { vorschau: false });
    expect(karten.get(m.id)).toMatchObject({ titel: "Police_Kfz.pdf", oeffnen: null, kontaktHref: `/buyer/leads/${leadBerater}#dokumente` });
    // Admin-Vorschau: geschützt ohne Namen, kein Weg
    const vorschau = await vermittlerDateienImVerlauf({ id: chatBerater, leadId: leadBerater }, [{ ...m }], { vorschau: true });
    expect(vorschau.get(m.id)).toMatchObject({ titel: "Unterlage (geschützt)", kontaktHref: null });
  });

  it("Route: ohne Login bzw. App-Demo 404, abgelaufene Datei mit klarer Meldung", async () => {
    const m = await dok(chatBerater);
    st.ctx = null;
    expect((await GET(new Request("https://x/"), { params: Promise.resolve({ id: m.id }) })).status).toBe(404);
    st.ctx = { ...owner(), preview: true, demo: true };
    expect((await GET(new Request("https://x/"), { params: Promise.resolve({ id: m.id }) })).status).toBe(404);
    st.ctx = owner();
    media.mockResolvedValue({ ok: false, grund: "fehler" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await GET(new Request("https://x/"), { params: Promise.resolve({ id: m.id }) });
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("nicht mehr abrufbar");
  });
});
