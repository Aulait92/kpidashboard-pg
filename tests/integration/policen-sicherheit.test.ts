// Sicherheit vor dem breiten Start der Policen (Ole, 18.11.2026): Virenprüfung (clamd-Attrappe mit EICAR), Zwei-Faktor-
// Pflicht zum Öffnen und Freischalten (Admin-Vorschau ausgenommen), Crypto-Shredding (eigener Datenschlüssel je Datei),
// Löschprotokoll mit erneuter Anwendung nach einer Wiederherstellung (Datenbank, Kopie im Bucket, Skript).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ ctx: null as unknown, push: [] as { an: string; title: string; body?: string }[], mails: 0 }));

const waSend = vi.fn();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return {
    ...real,
    sendText: (...a: unknown[]) => waSend("text", ...a),
    sendTemplate: (...a: unknown[]) => waSend("template", ...a),
    sendButtons: (...a: unknown[]) => waSend("buttons", ...a),
    sendDocument: (...a: unknown[]) => waSend("document", ...a),
  };
});
const media = vi.fn();
const mediaDelete = vi.fn();
vi.mock("@/lib/policen/media", () => ({ ladeMedia: (...a: unknown[]) => media(...a), loescheMedia: (...a: unknown[]) => mediaDelete(...a), downloadUrl: (u: string) => u }));
vi.mock("@/lib/push", () => ({
  sendToAdmins: async (p: { title: string; body?: string }) => {
    st.push.push({ an: "admins", ...p });
    return { sent: 1, removed: 0, errors: [] };
  },
  sendToBuyersOfCustomer: async (c: string, p: { title: string; body?: string }) => {
    st.push.push({ an: `kunde:${c}`, ...p });
    return { sent: 1, removed: 0, errors: [] };
  },
  sendToUser: async (u: string, p: { title: string; body?: string }) => {
    st.push.push({ an: `user:${u}`, ...p });
    return { sent: 1, removed: 0, errors: [] };
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: async () => ({ content: [{ type: "text", text: "Danke!" }], stop_reason: "end_turn" }) }; } }));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => st.ctx }));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: async () => {
    st.mails++;
    return { ok: true };
  },
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { listUnterlagen, loescheUnterlage, pruefeUngepruefteNach } from "@/lib/policen/server";
import { entschluessele, PROTOKOLL_PRAEFIX, setzeSpeicherFuerTests, verschluessele, type Speicher } from "@/lib/policen/ablage";
import { ladeFreischaltung, stimmeAvvZu } from "@/lib/policen/freischaltung";
import { confirmTotpSetup, sichererRuecksprung, startTotpSetup, zweiFaktorAktiv } from "@/lib/totp-account";
import { decryptSecret } from "@/lib/encryption";
import { totpCode } from "@/lib/totp";
import { eraseLead, ERASED_NAME } from "@/lib/erasure";
import { finalDeleteCustomer } from "@/lib/ruhend";
import { protokolliereLoeschung, pruneLoeschprotokoll, wendeLoeschprotokollAn, leseKopie } from "@/lib/loeschprotokoll";
import { saveLeadFile, listLeadFiles, pruefeUngepruefteLeadFilesNach } from "@/lib/lead-files";
import { GET as unterlageGET } from "@/app/api/buyer/leads/[id]/unterlagen/[docId]/route";
import { GET as dateiGET } from "@/app/api/buyer/policen/datei/route";
import { GET as leadFileGET } from "@/app/api/buyer/leads/[id]/dateien/[fileId]/route";
import { signiereLink } from "@/lib/policen/ablage";
import { pruefe as skriptPruefe, uebertrage as skriptUebertrage } from "../../scripts/loeschprotokoll.mjs";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";
import { EICAR, starteClamd, type ClamdAttrappe } from "../fixtures/clamd";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4916${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const DAY = 24 * 60 * 60 * 1000;
const PDF = Buffer.from("%PDF-1.4\n% Police Hausrat Beitrag 120 EUR\n%%EOF");
const VIRUS_PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), EICAR]);
const texts = () => waSend.mock.calls.filter((c) => c[0] === "text").map((c) => String(c[3]));

const bucket = new Map<string, Buffer>();
const memory: Speicher = {
  put: async (k, b) => void bucket.set(k, b),
  get: async (k) => bucket.get(k) ?? null,
  del: async (ks) => ks.forEach((k) => bucket.delete(k)),
  list: async (p) => [...bucket.keys()].filter((k) => k.startsWith(p)).map((key) => ({ key, at: new Date(0) })),
};
const MASTER = Buffer.alloc(32, 13);
const ABLAGE_ENV = {
  POLICEN_S3_ENDPOINT: "https://test456.eu.r2.cloudflarestorage.com",
  POLICEN_S3_BUCKET: "pg-policen-eu",
  POLICEN_S3_ACCESS_KEY_ID: "id",
  POLICEN_S3_SECRET_ACCESS_KEY: "secret",
  POLICEN_SCHLUESSEL: MASTER.toString("base64"),
};

describe("Policen: Sicherheit vor dem breiten Start", () => {
  let clamd: ClamdAttrappe;
  let customerId = "";
  let ownerId = "";
  let ohne2faId = "";
  const kunden: string[] = [];
  const pnid = `pnid-sich-${uid()}`;
  const send = (from: string, msg: Record<string, unknown>) =>
    handleInboundPayload({
      entry: [{ changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "4930123" }, contacts: [{ profile: { name: "Julia" } }], messages: [{ from, id: `wamid.in-${uid()}`, ...msg }] } }] }],
    });
  const doc = (from: string, filename = "Hausrat.pdf") => send(from, { type: "document", document: { id: `media-${uid()}`, mime_type: "application/pdf", filename } });
  const einverstanden = (from: string) => send(from, { type: "interactive", interactive: { type: "button_reply", button_reply: { id: "policen:ja", title: "Einverstanden" } } });
  const mitClamd = () => Object.assign(process.env, { CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(clamd.port) });
  const ohneClamd = () => {
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
  };

  async function leadMitChat() {
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, source: "Privatschutz", status: "Im Gespräch", reached: true, outreachAt: new Date(), assignedUserId: ownerId } });
    await prisma.conversation.create({
      data: { customerId, leadId: lead.id, contactPhone: phone, contactName: "Julia", botActive: true, windowExpiresAt: new Date(Date.now() + DAY), lastMessageAt: new Date(), messages: { create: [{ direction: "outbound", body: "Hallo", sentBy: "bot" }] } },
    });
    await einverstanden(phone);
    return { lead, phone };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    clamd = await starteClamd();
    const c = await makeCustomer({ name: `Agentur Sicherheit ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    kunden.push(c.id);
    ownerId = (await makeBuyer(customerId, "owner")).id;
    ohne2faId = (await makeBuyer(customerId, "owner")).id;
    await prisma.user.update({ where: { id: ownerId }, data: { totpEnabledAt: new Date(), totpSecretEnc: encryptSecret("JBSWY3DPEHPK3PXP") } });
    await prisma.erstinformation.create({ data: { customerId, token: `t-${uid()}`, name: "Ole Kannapinn", anrede: "Herr", firma: "Kannapinn Versicherungen" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(async () => {
    setzeSpeicherFuerTests(null);
    for (const k of Object.keys(ABLAGE_ENV)) delete process.env[k];
    ohneClamd();
    delete process.env.VIRENPRUEFUNG_PFLICHT;
    await clamd.stop();
    for (const id of kunden) await cleanupCustomer(id);
  });
  beforeEach(() => {
    Object.assign(process.env, ABLAGE_ENV);
    mitClamd();
    delete process.env.VIRENPRUEFUNG_PFLICHT;
    setzeSpeicherFuerTests(memory);
    st.ctx = null;
    st.push = [];
    st.mails = 0;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
    media.mockReset();
    media.mockImplementation(async () => ({ ok: true, data: Buffer.from(PDF), mime: "application/pdf" }));
    mediaDelete.mockReset();
    mediaDelete.mockImplementation(async () => true);
  });

  // ─── Virenprüfung ───────────────────────────────────────────────────────

  it("Virenfund per WhatsApp: verworfen, Lead neutral informiert, Hinweis an den Vermittler, Protokoll, Medium gelöscht", async () => {
    const { lead, phone } = await leadMitChat();
    media.mockImplementation(async () => ({ ok: true, data: Buffer.from(VIRUS_PDF), mime: "application/pdf" }));
    waSend.mockClear();
    await doc(phone);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(texts().at(-1)).toBe("Diese Datei konnte ich leider nicht annehmen. Schicken Sie die Police gern als Foto oder als PDF direkt aus Ihren Unterlagen.");
    expect(texts().at(-1)).not.toMatch(/virus/i);
    expect(mediaDelete).toHaveBeenCalled();
    expect(st.push.some((p) => p.title === "Datei von Julia Schneider nicht angenommen")).toBe(true);
    const a = await prisma.auditLog.findFirstOrThrow({ where: { action: "viren.befund", entityId: lead.id } });
    expect(a.details).toMatchObject({ quelle: "policen_whatsapp", signatur: "Eicar-Test-Signature" });
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, text: { contains: "Virenprüfung abgelehnt" } } })).toBe(1);
    const m = await prisma.message.findFirst({ where: { conversation: { leadId: lead.id }, direction: "inbound", body: { contains: "Sicherheitsprüfung" } } });
    expect(m?.body).toBe("Dokument nicht gespeichert (Sicherheitsprüfung)");
  });

  it("ohne ClamAV: angenommen als ungeprüft, nicht angeboten, Hinweis an die Admins; nachgeprüft beim Öffnen und im Cron", async () => {
    ohneClamd();
    const { lead, phone } = await leadMitChat();
    await doc(phone);
    const d = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(d.virenStatus).toBe("ungeprueft");
    expect((await listUnterlagen(lead.id, { preview: false, userId: ownerId }))[0]).toMatchObject({ gesperrt: "pruefung" });
    expect(await prisma.auditLog.count({ where: { action: "viren.ungeprueft_hinweis", at: { gt: new Date(Date.now() - DAY) } } })).toBeGreaterThanOrEqual(1);
    // Höchstens ein Hinweis am Tag
    await doc(phone, "Kfz.pdf");
    expect(st.push.filter((p) => p.an === "admins" && p.title === "Virenprüfung fehlt").length).toBeLessThanOrEqual(1);

    st.ctx = { customerId, email: "o@x", preview: false, userId: ownerId, teamRole: "owner" };
    const params = { params: Promise.resolve({ id: lead.id, docId: d.id }) };
    const loc = (await unterlageGET(new Request(`http://localhost/x`), params)).headers.get("location")!;
    const gesperrt = await dateiGET(new Request(`http://localhost${loc}`));
    expect(gesperrt.status).toBe(409);
    expect(await gesperrt.text()).toContain("noch auf Viren geprüft");

    // ClamAV läuft: Öffnen prüft nach und liefert aus
    mitClamd();
    const ok = await dateiGET(new Request(`http://localhost${loc}`));
    expect(ok.status).toBe(200);
    expect(Buffer.from(await ok.arrayBuffer()).equals(PDF)).toBe(true);
    expect((await prisma.leadDocument.findUniqueOrThrow({ where: { id: d.id } })).virenStatus).toBe("sauber");

    // Cron: ungeprüfte Datei mit Befund wird gelöscht, Lead neutral informiert, Löschprotokoll
    ohneClamd();
    media.mockImplementation(async () => ({ ok: true, data: Buffer.from(VIRUS_PDF), mime: "application/pdf" }));
    await doc(phone, "Haftpflicht.pdf");
    const v = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id, fileName: { contains: "Haftpflicht" } } });
    expect(v.virenStatus).toBe("ungeprueft");
    mitClamd();
    waSend.mockClear();
    const r = await pruefeUngepruefteNach(100);
    expect(r.befund).toBeGreaterThanOrEqual(1);
    expect(await prisma.leadDocument.count({ where: { id: v.id } })).toBe(0);
    expect(texts().at(-1)).toContain("Diese Datei konnte ich leider nicht annehmen.");
    expect(await prisma.loeschprotokoll.findFirst({ where: { art: "policen_dokument", entityId: v.id } })).toMatchObject({ grund: "virus" });
  });

  it("VIRENPRUEFUNG_PFLICHT ohne erreichbare Prüfung: nichts gespeichert, Bitte um späteres Senden", async () => {
    ohneClamd();
    process.env.VIRENPRUEFUNG_PFLICHT = "1";
    const { lead, phone } = await leadMitChat();
    waSend.mockClear();
    await doc(phone);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(texts().at(-1)).toBe("Ich kann die Datei gerade nicht annehmen. Schicken Sie sie gern später noch einmal oder bringen Sie sie zum Termin mit.");
  });

  it("Upload am Kontakt: EICAR abgelehnt; ungeprüfte Police erst nach der Prüfung angeboten", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Max Muster", phone: newPhone(), source: "Privatschutz", status: "Termin" } });
    const virus = await saveLeadFile({ leadId: lead.id, customerId, kind: "police", fileName: "police.pdf", data: VIRUS_PDF, userId: ownerId });
    expect(virus).toEqual({ ok: false, error: "Die Virenprüfung hat diese Datei abgelehnt. Sie wurde nicht gespeichert." });
    expect(await prisma.leadFile.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "viren.befund", entityId: lead.id } })).toBe(1);

    const sauber = await saveLeadFile({ leadId: lead.id, customerId, kind: "angebot", fileName: "angebot.pdf", data: PDF, userId: ownerId });
    expect(sauber.ok).toBe(true);
    ohneClamd();
    const ungeprueft = await saveLeadFile({ leadId: lead.id, customerId, kind: "police", fileName: "alt.pdf", data: PDF, userId: ownerId });
    expect(ungeprueft.ok).toBe(true);
    const liste = await listLeadFiles(lead.id);
    expect(liste.find((f) => f.fileName === "alt.pdf")?.wirdGeprueft).toBe(true);
    expect(liste.find((f) => f.fileName === "angebot.pdf")?.wirdGeprueft).toBe(false);
    st.ctx = { customerId, email: "o@x", preview: false, userId: ownerId, teamRole: "owner" };
    const id = (ungeprueft as { id: string }).id;
    expect((await leadFileGET(new Request("http://localhost/x"), { params: Promise.resolve({ id: lead.id, fileId: id }) })).status).toBe(409);
    mitClamd();
    expect(await pruefeUngepruefteLeadFilesNach()).toMatchObject({ befund: 0 });
    expect((await prisma.leadFile.findUniqueOrThrow({ where: { id } })).virenStatus).toBe("sauber");
    expect((await leadFileGET(new Request("http://localhost/x"), { params: Promise.resolve({ id: lead.id, fileId: id }) })).status).toBe(200);
    // Pflicht ohne Prüfung: abgelehnt
    ohneClamd();
    process.env.VIRENPRUEFUNG_PFLICHT = "1";
    expect(await saveLeadFile({ leadId: lead.id, customerId, kind: "police", fileName: "neu.pdf", data: PDF, userId: ownerId })).toMatchObject({ ok: false });
  });

  // ─── Zwei-Faktor-Pflicht ────────────────────────────────────────────────

  it("Zwei-Faktor-Pflicht: ohne kein Öffnen (Einrichtung, dann zurück) und keine Freischaltung; Admin-Vorschau ausgenommen", async () => {
    const { lead, phone } = await leadMitChat();
    await doc(phone);
    const d = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id } });
    expect((await listUnterlagen(lead.id, { preview: false, userId: ohne2faId }))[0]).toMatchObject({ ansehen: false, gesperrt: "zwei_faktor" });
    expect((await listUnterlagen(lead.id, { preview: false, userId: ownerId }))[0]).toMatchObject({ ansehen: true, gesperrt: null });
    expect((await listUnterlagen(lead.id, { preview: true }))[0]).toMatchObject({ ansehen: false, gesperrt: null });

    st.ctx = { customerId, email: "n@x", preview: false, userId: ohne2faId, teamRole: "owner" };
    const r = await unterlageGET(new Request("http://localhost/x"), { params: Promise.resolve({ id: lead.id, docId: d.id }) });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`/buyer/konto/sicherheit/zwei-faktor?zurueck=${encodeURIComponent(`/buyer/leads/${lead.id}#dokumente`)}`);
    // Auch mit einem (älteren) signierten Link keine Datei
    const t = signiereLink({ leadId: lead.id, docId: d.id, userId: ohne2faId, download: false });
    const f = await dateiGET(new Request(`http://localhost/api/buyer/policen/datei?t=${encodeURIComponent(t)}`));
    expect(f.status).toBe(303);
    expect(await prisma.auditLog.count({ where: { action: "policen.abruf", entityId: d.id, actorId: ohne2faId } })).toBe(0);

    // Freischaltung Kranken/BU/Leben: nur mit Zwei-Faktor-Login
    await prisma.customer.update({ where: { id: customerId }, data: { policenAvvZugestimmtAt: null, policenAvvVersion: null, policenIntern: false, isTest: false } });
    const ohne = { customerId, userId: ohne2faId, preview: false, teamRole: "owner" };
    expect((await ladeFreischaltung(ohne))?.zweiFaktor).toBe(false);
    expect(await stimmeAvvZu(ohne)).toBe(false);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).policenAvvZugestimmtAt).toBeNull();

    // Einrichten: Schlüssel, Code aus der App, Notfall-Codes; danach erlaubt
    await startTotpSetup(ohne2faId);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ohne2faId } });
    const res = await confirmTotpSetup(ohne2faId, totpCode(decryptSecret(u.totpSecretEnc!)), { keepCurrent: false });
    expect(res.backupCodes).toHaveLength(8);
    expect(await zweiFaktorAktiv(ohne2faId)).toBe(true);
    expect((await ladeFreischaltung(ohne))?.zweiFaktor).toBe(true);
    expect(await stimmeAvvZu(ohne)).toBe(true);
    expect((await unterlageGET(new Request("http://localhost/x"), { params: Promise.resolve({ id: lead.id, docId: d.id }) })).headers.get("location")).toMatch(/^\/api\/buyer\/policen\/datei\?t=/);
  });

  it("Rücksprung nach dem Einrichten nur auf eigene Seiten", () => {
    expect(sichererRuecksprung("/buyer/leads/abc#dokumente")).toBe("/buyer/leads/abc#dokumente");
    expect(sichererRuecksprung("/buyer/termine/x/vorbereitung")).toBe("/buyer/termine/x/vorbereitung");
    expect(sichererRuecksprung("https://evil.example")).toBe("/buyer/konto/sicherheit");
    expect(sichererRuecksprung("//evil.example/buyer")).toBe("/buyer/konto/sicherheit");
    expect(sichererRuecksprung("/admin")).toBe("/buyer/konto/sicherheit");
    expect(sichererRuecksprung(null)).toBe("/buyer/konto/sicherheit");
  });

  // ─── Crypto-Shredding ──────────────────────────────────────────────────

  it("Crypto-Shredding: eigener Datenschlüssel je Datei, ohne ihn nicht lesbar; Format 1 bleibt lesbar", async () => {
    const { lead, phone } = await leadMitChat();
    await doc(phone, "A.pdf");
    await doc(phone, "B.pdf");
    const docs = await prisma.leadDocument.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
    expect(docs).toHaveLength(2);
    expect(docs[0].dateiSchluessel).toBeTruthy();
    expect(docs[0].dateiSchluessel).not.toBe(docs[1].dateiSchluessel);
    const obj = bucket.get(docs[0].storageKey!)!;
    expect(obj[0]).toBe(2);
    expect(entschluessele(MASTER, customerId, docs[0].storageKey!, obj, docs[0].dateiSchluessel).equals(PDF)).toBe(true);
    expect(() => entschluessele(MASTER, customerId, docs[0].storageKey!, obj, null)).toThrow();
    expect(() => entschluessele(MASTER, customerId, docs[0].storageKey!, obj, docs[1].dateiSchluessel)).toThrow();
    expect(() => entschluessele(MASTER, "anderer-kunde", docs[0].storageKey!, obj, docs[0].dateiSchluessel)).toThrow();
    // Kopie der Datei (z. B. Versionierung beim Anbieter) ist nach dem Löschen des Eintrags wertlos
    const kopie = Buffer.from(obj);
    await loescheUnterlage(lead.id, docs[0].id, customerId, ownerId);
    expect(await prisma.leadDocument.count({ where: { id: docs[0].id } })).toBe(0);
    expect(() => entschluessele(MASTER, customerId, docs[0].storageKey!, kopie, null)).toThrow();
    // Format 1 (bis 18.11.2026)
    const alt = verschluessele(MASTER, customerId, "policen/a/b/c", PDF);
    expect(entschluessele(MASTER, customerId, "policen/a/b/c", alt).equals(PDF)).toBe(true);
  });

  // ─── Löschprotokoll ────────────────────────────────────────────────────

  it("Löschprotokoll: Art. 17, Policen und Vertragsende greifen nach einer Wiederherstellung erneut (auch aus der Kopie im Bucket)", async () => {
    // Lead (Art. 17)
    const lead = await prisma.lead.create({ data: { customerId, name: "Erika Beispiel", phone: newPhone(), email: "erika@example.org", source: "Privatschutz", status: "Termin" } });
    await eraseLead(lead.id);
    const pLead = await prisma.loeschprotokoll.findFirstOrThrow({ where: { art: "lead", entityId: lead.id } });
    expect(pLead).toMatchObject({ customerId, grund: "art17" });
    expect(leseKopie(bucket.get(`${PROTOKOLL_PRAEFIX}${pLead.id}.json`)!.toString("utf8"))).toMatchObject({ id: pLead.id, art: "lead", entityId: lead.id });

    // Policen-Dokument (vom Vermittler gelöscht)
    const { lead: l2, phone } = await leadMitChat();
    await doc(phone);
    const d = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: l2.id } });
    await loescheUnterlage(l2.id, d.id, customerId, ownerId);
    expect(await prisma.loeschprotokoll.findFirst({ where: { art: "policen_dokument", entityId: d.id } })).toMatchObject({ ref: d.storageKey, grund: "vermittler" });

    // Vertragsende: Kunde endgültig gelöscht (eine Mail)
    const k = await makeCustomer({ name: `Ende ${uid()}` });
    kunden.push(k.id);
    await makeBuyer(k.id, "owner");
    await prisma.lead.create({ data: { customerId: k.id, name: "Kunde Alt", phone: newPhone(), source: "x", status: "Neu" } });
    await finalDeleteCustomer(k.id, { reason: "Test" });
    expect(st.mails).toBe(1);
    expect(await prisma.loeschprotokoll.count({ where: { art: "kunde", entityId: k.id } })).toBe(1);

    // Vertriebskontakt
    const sc = await prisma.salesContact.create({ data: { name: "Vermittler Test", email: `v-${uid()}@example.org` } });
    await prisma.salesContact.delete({ where: { id: sc.id } });
    await protokolliereLoeschung([{ art: "vertriebskontakt", entityId: sc.id, grund: "admin" }]);

    // Im normalen Betrieb: nichts offen
    expect((await wendeLoeschprotokollAn({ nurPruefen: true })).offen.filter((o) => [lead.id, d.id, k.id, sc.id].includes(o.entityId))).toEqual([]);

    // „Wiederherstellung“ auf einen Stand vor den Löschungen: Daten zurück, Protokollzeile des Leads fehlt (nur im Bucket)
    await prisma.lead.update({ where: { id: lead.id }, data: { name: "Erika Beispiel", email: "erika@example.org", erasedAt: null } });
    await prisma.loeschprotokoll.delete({ where: { id: pLead.id } });
    await prisma.leadDocument.create({ data: { id: d.id, customerId, leadId: l2.id, status: "gespeichert", mimeType: d.mimeType, fileName: d.fileName, size: d.size, storageKey: d.storageKey, dateiSchluessel: d.dateiSchluessel } });
    await prisma.customer.update({ where: { id: k.id }, data: { dataDeletedAt: null, archived: false } });
    const altLead = await prisma.lead.create({ data: { customerId: k.id, name: "Wieder Da", phone: newPhone(), source: "x", status: "Neu" } });
    await prisma.salesContact.create({ data: { id: sc.id, name: "Vermittler Test", email: `w-${uid()}@example.org` } });

    const vorher = await skriptPruefe(process.env.DATABASE_URL);
    expect(vorher.offen.dokumente).toBeGreaterThanOrEqual(1);
    expect(vorher.offen.kunden).toBeGreaterThanOrEqual(1);

    const r = await wendeLoeschprotokollAn();
    expect(r.uebernommen).toBeGreaterThanOrEqual(1);
    expect(r.fehler).toBe(0);
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ name: ERASED_NAME, email: null });
    expect(await prisma.leadDocument.count({ where: { id: d.id } })).toBe(0);
    expect(await prisma.salesContact.count({ where: { id: sc.id } })).toBe(0);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: k.id } })).dataDeletedAt).not.toBeNull();
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: altLead.id } })).toMatchObject({ name: ERASED_NAME });
    // Keine zweite Mail, keine doppelten Einträge, Protokoll im Änderungsprotokoll
    expect(st.mails).toBe(1);
    expect(await prisma.loeschprotokoll.count({ where: { entityId: { in: [lead.id, d.id, k.id, sc.id] } } })).toBe(4);
    expect(await prisma.auditLog.count({ where: { action: "loeschprotokoll.angewendet" } })).toBeGreaterThanOrEqual(1);
    const nachher = await skriptPruefe(process.env.DATABASE_URL);
    expect(nachher.summe).toBe(0);
    // Übertragen in dieselbe Datenbank: nichts neu (idempotent)
    expect((await skriptUebertrage(process.env.DATABASE_URL, process.env.DATABASE_URL)).uebertragen).toBe(0);
  });

  it("Löschprotokoll: Einträge nach 13 Monaten gelöscht (Datenbank und Kopie)", async () => {
    const id = `alt${uid()}`;
    await protokolliereLoeschung([{ art: "vertriebskontakt", entityId: id, grund: "admin" }], new Date(Date.now() - 500 * DAY));
    const z = await prisma.loeschprotokoll.findFirstOrThrow({ where: { entityId: id } });
    expect(bucket.has(`${PROTOKOLL_PRAEFIX}${z.id}.json`)).toBe(true);
    expect(await pruneLoeschprotokoll()).toBeGreaterThanOrEqual(1);
    expect(await prisma.loeschprotokoll.count({ where: { entityId: id } })).toBe(0);
    expect(bucket.has(`${PROTOKOLL_PRAEFIX}${z.id}.json`)).toBe(false);
  });
});
