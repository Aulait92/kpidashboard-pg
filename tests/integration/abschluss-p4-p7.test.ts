// P4 „Abschluss erkennen und melden“ und P7 „Nach dem Abschluss“ (Ole, 17.11.2026), gegen die Test-DB; WhatsApp, Push
// und LLM simuliert:
//   Abschluss mit einem Tipp: Beitrag aus dem Angebot, sonst typisch (≈), eingegeben = vermittler; Stimmt/Chip
//   Glückwunsch: nur im offenen 24-h-Fenster, einmal, Vorauswahl bis 3 Tage nach dem Termin
//   Vorabend-Push: Angebot mit Nachfassen morgen bzw. Termin heute, ein Push je Berater, einmal am Tag, 18 bis 21 Uhr
//   Werkzeug schon_abgeschlossen: Nachfassen stoppt, Push auf das Blatt, Status bleibt, kein „Chat ruht“
//   Aufgaben nach dem Abschluss: Cross-Selling wartet hinter „Police da?“ und rückt nach, statt zu entfallen
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
const st: { queue: Block[][] } = { queue: [] };
const waSend = vi.fn();
const pushes: { userId?: string; customerId?: string; p: { title: string; body: string; url?: string } }[] = [];
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
vi.mock("@/lib/push", () => ({
  sendToAdmins: async () => ({ sent: 1, removed: 0, errors: [] }),
  sendToBuyersOfCustomer: async (customerId: string, p: { title: string; body: string; url?: string }) => {
    pushes.push({ customerId, p });
    return { sent: 1, removed: 0, errors: [] };
  },
  sendToUser: async (userId: string, p: { title: string; body: string; url?: string }) => {
    pushes.push({ userId, p });
    return { sent: 1, removed: 0, errors: [] };
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: async () => ({ content: st.queue.shift() ?? [{ type: "text", text: "Vielen Dank für Ihre Rückmeldung!" }], stop_reason: "end_turn" }) };
  },
}));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { syncPrimaryContract, runCrossSellReminders, runPoliceReminders, addLeadContract, POLICE_TODO } from "@/lib/vertraege";
import { aktiviereAufgaben } from "@/lib/lead-aufgaben";
import { glueckwunschStand, ladeAbschlussStand, meldeAbschlussVomLead, pausiereNachfassen, runVorabendAbschluss, sendeGlueckwunsch, setzeAbschlussBeitrag, vorabendKandidaten } from "@/lib/abschluss-server";
import { restartSilentSequence } from "@/lib/lead-sequences";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { loadBeitragFehlt } from "@/lib/inbox";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4916${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const angebot = (beitragMonat: number) => ({ items: [{ sparte: "Privathaftpflicht", tarif: "Komfort", beitragMonat, empfohlen: true }] });

describe("P4 Abschluss erkennen und melden, P7 nach dem Abschluss", () => {
  let customerId = "";
  let ownerId = "";
  const ids: string[] = [];

  async function lead(extra: Record<string, unknown> = {}) {
    return prisma.lead.create({ data: { customerId, name: "Julia Becker", phone: newPhone(), source: "Privatschutz", status: "Angebot gesendet", formData: [{ label: "Anrede", value: "Frau" }], ...extra } });
  }
  async function chat(l: { id: string; phone: string | null }, windowH = 20) {
    return prisma.conversation.create({
      data: { customerId, leadId: l.id, contactPhone: l.phone!, contactName: "Julia Becker", botActive: true, qualified: true, windowExpiresAt: new Date(Date.now() + windowH * HOUR), lastMessageAt: new Date() },
    });
  }
  async function schliessen(leadId: string, closeValue: number | null = null) {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "Abschluss", closedAt: new Date(), closeValue } });
    await syncPrimaryContract(leadId, { reopen: true });
    return prisma.leadContract.findUniqueOrThrow({ where: { primaryLeadId: leadId } });
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    const c = await makeCustomer({ name: `Agentur Kannapinn ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    ids.push(c.id);
    ownerId = (await makeBuyer(customerId, "owner")).id;
    await prisma.erstinformation.create({ data: { customerId, token: `tok-${uid()}`, name: "Ole Kannapinn", anrede: "Herr" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, followUpSequencesEnabled: true, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: `pnid-p4-${uid()}`, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });
  beforeEach(() => {
    st.queue = [];
    pushes.length = 0;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  it("Abschluss mit einem Tipp: Beitrag aus dem Angebot, sonst typisch, eingegeben vom Vermittler; Zeile und Stand", async () => {
    const mitAngebot = await lead();
    await prisma.appointment.create({ data: { customerId, leadId: mitAngebot.id, mode: "video", startsAt: new Date(Date.now() - DAY), status: "completed", offersJson: angebot(51) } });
    const a = await schliessen(mitAngebot.id);
    expect({ premium: Number(a.premium), source: a.premiumSource, year: Number(a.premiumYear), sparte: a.sparte }).toEqual({ premium: 612, source: "angebot", year: 612, sparte: "privatschutz" });
    const stand = await ladeAbschlussStand(mitAngebot.id, customerId);
    expect(stand?.zeile).toBe("Privatschutz/Haftpflicht · 612 €/Jahr aus Ihrem Angebot · Provision ≈ 337 €");
    expect(stand?.geschlossen).toBe(true);

    const ohne = await lead();
    const b = await schliessen(ohne.id);
    expect({ premium: Number(b.premium), source: b.premiumSource }).toEqual({ premium: 600, source: "standard" });
    expect((await ladeAbschlussStand(ohne.id, customerId))?.chips).toEqual([350, 600, 900]);
    // Chip: Beitrag vom Vermittler, auch am Lead
    expect(await setzeAbschlussBeitrag(ohne.id, customerId, 350)).toEqual({ ok: true });
    const b2 = await prisma.leadContract.findUniqueOrThrow({ where: { primaryLeadId: ohne.id } });
    expect({ premium: Number(b2.premium), source: b2.premiumSource, year: Number(b2.premiumYear) }).toEqual({ premium: 350, source: "vermittler", year: 350 });
    expect(Number((await prisma.lead.findUniqueOrThrow({ where: { id: ohne.id } })).closeValue)).toBe(350);

    // „Stimmt“ bestätigt den typischen Beitrag
    const stimmt = await lead();
    await schliessen(stimmt.id);
    await setzeAbschlussBeitrag(stimmt.id, customerId, null);
    expect((await prisma.leadContract.findUniqueOrThrow({ where: { primaryLeadId: stimmt.id } })).premiumSource).toBe("vermittler");

    // Eingegeben: vom Vermittler
    const eingabe = await lead();
    const c = await schliessen(eingabe.id, 480);
    expect({ premium: Number(c.premium), source: c.premiumSource }).toEqual({ premium: 480, source: "vermittler" });
  });

  it("Glückwunsch: Text, Vorauswahl bis 3 Tage, nur im offenen Fenster, einmal", async () => {
    const l = await lead();
    const c = await chat(l);
    // wie im echten Verlauf: die erste Nachricht an den Lead (Erstanschreiben) trug die KI-Kennzeichnung; ohne sie bekäme
    // die erste Systemnachricht im Chat die Zeile „Digitaler KI-Assistent“ (tests/integration/ki-erste-nachricht.test.ts)
    await prisma.message.create({
      data: { conversationId: c.id, direction: "outbound", kind: "template", sentBy: "system", purpose: "outreach_privatschutz", status: "read", body: "[Erstinformation als PDF]\nHallo Frau Becker, danke für Ihre Anfrage! *Ist davon schon etwas versichert?*\n\nDigitaler KI-Assistent", createdAt: new Date(Date.now() - 6 * DAY) },
    });
    await prisma.appointment.create({ data: { customerId, leadId: l.id, mode: "video", startsAt: new Date(Date.now() - 2 * DAY), status: "completed" } });
    await schliessen(l.id);
    const g = await glueckwunschStand(l.id, customerId);
    expect(g).toMatchObject({ moeglich: true, offen: true, vorausgewaehlt: true, gesendet: false });
    expect(g.text).toBe("Schön, dass Sie sich für Ihren neuen Schutz entschieden haben, Frau Becker! Bei Fragen erreichen Sie Herrn Kannapinn jederzeit hier.");
    expect(await sendeGlueckwunsch(l.id, customerId, { userId: ownerId })).toEqual({ ok: true, gesendet: true });
    expect(waSend.mock.calls.map((c) => [c[0], c[3]])).toEqual([["text", g.text]]);
    // einmal
    expect(await sendeGlueckwunsch(l.id, customerId)).toEqual({ ok: true, gesendet: false });
    expect(waSend).toHaveBeenCalledTimes(1);
    expect((await glueckwunschStand(l.id, customerId)).gesendet).toBe(true);

    // Termin 4 Tage her: nicht vorausgewählt; Fenster zu: nicht möglich, keine Vorlage
    const alt = await lead();
    await chat(alt, -1);
    await prisma.appointment.create({ data: { customerId, leadId: alt.id, mode: "video", startsAt: new Date(Date.now() - 4 * DAY - HOUR), status: "completed" } });
    await schliessen(alt.id);
    expect(await glueckwunschStand(alt.id, customerId)).toMatchObject({ moeglich: true, offen: false, vorausgewaehlt: false });
    const r = await sendeGlueckwunsch(alt.id, customerId);
    expect(r.ok).toBe(false);
    expect(waSend).toHaveBeenCalledTimes(1);

    // Termin 4 Tage her, Fenster offen: möglich, aber nicht vorausgewählt
    const offen = await lead();
    await chat(offen);
    await prisma.appointment.create({ data: { customerId, leadId: offen.id, mode: "video", startsAt: new Date(Date.now() - 5 * DAY), status: "completed" } });
    await schliessen(offen.id);
    expect(await glueckwunschStand(offen.id, customerId)).toMatchObject({ offen: true, vorausgewaehlt: false });
  });

  it("Vorabend-Push: Termin heute ohne Ergebnis, ein Push je Berater, einmal am Tag, nur abends; Angebote fragt der Vorab-Check", async () => {
    const c = await makeCustomer({ name: `Agentur Vorabend ${uid()}` });
    ids.push(c.id);
    const berater = await makeBuyer(c.id, "advisor");
    // 19 Uhr Berliner Zeit (Winter: UTC+1)
    const abend = new Date("2026-11-24T18:00:00Z");
    const morgen10 = new Date("2026-11-25T09:00:00Z");
    const mk = (extra: Record<string, unknown>) => prisma.lead.create({ data: { customerId: c.id, name: "Test", source: "Privatschutz", ...extra } });
    const termin = (leadId: string, startsAt: string, extra: Record<string, unknown> = {}) =>
      prisma.appointment.create({ data: { customerId: c.id, leadId, mode: "video", startsAt: new Date(startsAt), status: "booked", ...extra } });
    const a = await mk({ name: "Julia Becker", status: "Termin vereinbart", formData: [{ label: "Anrede", value: "Frau" }] });
    const b = await mk({ name: "Tom Kurz", status: "Im Gespräch", formData: [{ label: "Anrede", value: "Herr" }] });
    const beimBerater = await mk({ name: "Eva Lang", status: "Termin vereinbart", assignedUserId: berater.id, formData: [{ label: "Anrede", value: "Frau" }] });
    const zu = await mk({ status: "Abschluss", closedAt: abend });
    const fehlt = await mk({ status: "Termin vereinbart" });
    const gestern = await mk({ status: "Termin vereinbart" });
    // Angebot gesendet, Nachfassen läuft: fragt der Vorab-Check (P3) mit demselben Blatt, hier kein zweiter Push
    const angebot = await mk({ status: "Angebot gesendet" });
    await prisma.leadSequence.create({ data: { leadId: angebot.id, customerId: c.id, kind: "offer", nextAt: morgen10 } });
    await termin(a.id, "2026-11-24T13:00:00Z", { attendance: "erschienen" });
    await termin(b.id, "2026-11-24T08:00:00Z"); // ohne Anwesenheit
    await termin(beimBerater.id, "2026-11-24T10:00:00Z", { status: "completed" });
    await termin(zu.id, "2026-11-24T10:00:00Z", { status: "completed" });
    await termin(fehlt.id, "2026-11-24T11:00:00Z", { attendance: "nicht_erschienen" });
    await termin(gestern.id, "2026-11-23T11:00:00Z");
    await termin(angebot.id, "2026-11-24T09:00:00Z", { status: "completed" });

    const k = (await vorabendKandidaten(abend)).filter((x) => x.customerId === c.id);
    expect(k.map((x) => x.leadId).sort()).toEqual([a.id, b.id, beimBerater.id].sort());

    const sent: { userId: string | null; p: { title: string; url: string; body: string } }[] = [];
    const push = async (userId: string | null, cid: string, p: { title: string; body: string; url: string; tag: string }) => {
      if (cid === c.id) sent.push({ userId, p });
    };
    expect((await runVorabendAbschluss(new Date("2026-11-24T14:00:00Z"), { push })).due).toBe(false);
    await runVorabendAbschluss(abend, { push });
    expect(sent).toHaveLength(2);
    const inhaber = sent.find((s) => s.userId === null)!;
    expect(inhaber.p.title).toMatch(/^Haben (Frau Becker und Herr Kurz|Herr Kurz und Frau Becker) abgeschlossen\?$/);
    expect(inhaber.p.url).toMatch(/^\/buyer\/abschluss\?l=/);
    expect(inhaber.p.url).toContain(a.id);
    expect(inhaber.p.url).toContain(b.id);
    const fuerBerater = sent.find((s) => s.userId === berater.id)!;
    expect(fuerBerater.p).toMatchObject({ title: "Hat Frau Lang abgeschlossen?", url: `/buyer/abschluss?l=${beimBerater.id}` });
    // einmal am Tag
    await runVorabendAbschluss(new Date(abend.getTime() + 30 * 60_000), { push });
    expect(sent).toHaveLength(2);

    // „Nachfassen pausieren“ im Blatt: nächster Schritt eine Woche später, Vorab-Check kommt dann noch einmal
    await prisma.leadSequence.updateMany({ where: { leadId: angebot.id }, data: { vorabCheckStep: 0 } });
    const p = await pausiereNachfassen(angebot.id, c.id, { now: abend, userId: null });
    expect(p.ok).toBe(true);
    const s = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: angebot.id } });
    expect(s.nextAt!.getTime()).toBe(morgen10.getTime() + 7 * DAY);
    expect(s.vorabCheckStep).toBeNull();
  });

  it("Werkzeug schon_abgeschlossen: Push auf das Blatt, Nachfassen gestoppt, kein Abschluss eingetragen, kein „Chat ruht“", async () => {
    const l = await lead();
    const conv = await chat(l);
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Ich habe den Antrag gestern unterschrieben, danke!" } });
    await prisma.leadSequence.create({ data: { leadId: l.id, customerId, kind: "offer", nextAt: new Date(Date.now() + DAY), startedAt: new Date(Date.now() - DAY) } });
    st.queue.push([{ type: "tool_use", id: "t1", name: "schon_abgeschlossen", input: { aussage: "Antrag gestern unterschrieben" } }], [{ type: "text", text: "Vielen Dank für Ihre Rückmeldung, das freut mich sehr!" }]);
    await runBotTurn(conv.id);

    const nach = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(nach.status).toBe("Angebot gesendet");
    expect(nach.abschlussGemeldetAt).not.toBeNull();
    expect(await prisma.leadContract.count({ where: { leadId: l.id } })).toBe(0);
    const s = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: l.id, kind: "offer" } });
    expect(s.stopReason).toBe("Lead meldet: schon abgeschlossen");
    const cv = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(cv.needsAttention).toBe(true);
    expect(cv.attentionReason).toBe("Meldet Abschluss: „Antrag gestern unterschrieben“. Bitte eintragen.");
    expect(pushes.map((p) => p.p)).toEqual([{ title: "Frau Becker meldet: abgeschlossen", body: "Mit einem Tipp eintragen. Das Nachfassen ist gestoppt.", url: `/buyer/abschluss?l=${l.id}`, tag: `abschluss-meldung:${l.id}` }]);
    // Antwort an den Lead
    expect(String(waSend.mock.calls.at(-1)?.[3])).toMatch(/Vielen Dank für Ihre Rückmeldung, das freut mich sehr!$/);
    // „Chat ruht“ startet nicht neu, zweite Meldung ohne zweiten Push
    expect(await restartSilentSequence(l.id)).toBeNull();
    expect(await meldeAbschlussVomLead(l.id, { conversationId: conv.id })).toBe("schon_gemeldet");
    expect(pushes).toHaveLength(1);
    // nicht im Vorabend-Push
    expect((await vorabendKandidaten(new Date())).some((k) => k.leadId === l.id)).toBe(false);
  });

  it("Heute: typische Beiträge ab dem nächsten Morgen gesammelt (nicht am selben Tag, nicht bestätigte)", async () => {
    const c = await makeCustomer({ name: `Agentur Beitrag ${uid()}` });
    ids.push(c.id);
    const mk = async (closedAt: Date, closeValue: number | null = null) => {
      const l = await prisma.lead.create({ data: { customerId: c.id, name: "Eva Lang", source: "Hausrat", status: "Abschluss", closedAt, closeValue, formData: [{ label: "Anrede", value: "Frau" }] } });
      await syncPrimaryContract(l.id);
      return l;
    };
    const gestern = await mk(new Date(Date.now() - DAY - HOUR));
    await mk(new Date()); // heute: erst morgen
    await mk(new Date(Date.now() - DAY - HOUR), 150); // eingetragen
    await mk(new Date(Date.now() - 20 * DAY)); // zu alt
    const rows = await loadBeitragFehlt({ customerId: c.id, userId: null, teamRole: "owner" });
    expect(rows).toEqual([{ leadId: gestern.id, name: "Frau Lang", sparte: "Hausrat", chips: [70, 120, 180], einheit: "/Jahr", ersparnis: false }]);
  });

  it("Cross-Selling nach 6 Wochen ohne Verdrängung: wartet hinter „Police da?“ und rückt danach nach", async () => {
    const now = new Date();
    const closedAt = new Date(now.getTime() - 43 * DAY);
    const l = await prisma.lead.create({ data: { customerId, source: "TKV-Katze", status: "Abschluss", closedAt } });
    await syncPrimaryContract(l.id);
    // Police-Aufgabe (z. B. aus der Woche davor) steht noch offen
    await prisma.lead.update({ where: { id: l.id }, data: { followUpAt: new Date(now.getTime() - 20 * DAY), followUpNote: POLICE_TODO } });
    expect(await runCrossSellReminders(now)).toBeGreaterThanOrEqual(1);
    let x = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(x.followUpNote).toBe(POLICE_TODO);
    expect(x.crossSellRemindedAt).not.toBeNull();
    expect(await prisma.leadTask.findFirst({ where: { leadId: l.id, kind: "cross_sell" } })).toMatchObject({ status: "wartet" });
    // Police erledigt → Cross-Selling rückt nach (Cron)
    await prisma.lead.update({ where: { id: l.id }, data: { followUpAt: null, followUpNote: null } });
    await aktiviereAufgaben(new Date(now.getTime() + 5 * 60_000));
    x = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(x.followUpNote).toBe("Weiteres Produkt anbieten? Naheliegend: Privatschutz/Haftpflicht, Unfall");
    expect(await prisma.leadTask.findFirst({ where: { leadId: l.id, kind: "cross_sell" } })).toMatchObject({ status: "aktiv" });
    // zweiter Lauf: nichts doppelt
    await runCrossSellReminders(now);
    expect(await prisma.leadTask.count({ where: { leadId: l.id } })).toBe(1);
  });

  it("Wartende Aufgaben entfallen, wenn sie nicht mehr nötig sind (weiterer Vertrag, Police da, Lead nicht mehr im Abschluss)", async () => {
    const now = new Date();
    const mk = (closedDaysAgo: number) =>
      prisma.lead.create({ data: { customerId, source: "TKV-Katze", status: "Abschluss", closedAt: new Date(now.getTime() - closedDaysAgo * DAY), followUpAt: now, followUpNote: "Police fertig machen" } });
    // Cross-Selling wartet, dann weiterer Vertrag
    const a = await mk(43);
    await syncPrimaryContract(a.id);
    await runCrossSellReminders(now);
    expect(await prisma.leadTask.findFirst({ where: { leadId: a.id, kind: "cross_sell" } })).toMatchObject({ status: "wartet" });
    await addLeadContract(a.id, customerId, { sparte: "privatschutz", premium: 600, signedAt: now, insurer: null, contractNo: null, fileId: null }, null);
    expect(await prisma.leadTask.findFirst({ where: { leadId: a.id, kind: "cross_sell" } })).toMatchObject({ status: "entfallen", endedReason: "Weiterer Vertrag eingetragen" });

    // Police wartet, Police kommt dazu → entfällt beim Aktivieren
    const b = await mk(15);
    await syncPrimaryContract(b.id);
    await runPoliceReminders(now);
    expect(await prisma.leadTask.findFirst({ where: { leadId: b.id, kind: "police" } })).toMatchObject({ status: "wartet" });
    const file = await prisma.leadFile.create({ data: { leadId: b.id, customerId, fileName: "police.pdf", kind: "police", contentType: "application/pdf", size: 1, data: Buffer.from("x") } });
    await prisma.leadContract.updateMany({ where: { primaryLeadId: b.id }, data: { fileId: file.id } });
    await prisma.lead.update({ where: { id: b.id }, data: { followUpAt: null, followUpNote: null } });
    await aktiviereAufgaben(now);
    expect(await prisma.leadTask.findFirst({ where: { leadId: b.id, kind: "police" } })).toMatchObject({ status: "entfallen", endedReason: "Police schon da" });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: b.id } })).followUpNote).toBeNull();

    // Lead nicht mehr im Abschluss
    const c = await mk(15);
    await syncPrimaryContract(c.id);
    await runPoliceReminders(now);
    await prisma.lead.update({ where: { id: c.id }, data: { status: "Kein Interesse", followUpAt: null, followUpNote: null } });
    await aktiviereAufgaben(now);
    expect(await prisma.leadTask.findFirst({ where: { leadId: c.id } })).toMatchObject({ status: "entfallen", endedReason: "Phase: Kein Interesse" });
  });
});
