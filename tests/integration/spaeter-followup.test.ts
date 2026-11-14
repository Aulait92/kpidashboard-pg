import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleWebhook, recordReply } from "@/lib/vertrieb/instantly";
import {
  approveFollowups,
  draftFollowup,
  planExistingFollowups,
  planFromOutcome,
  runFollowups,
  sendFollowupStep,
  stopFollowupOnStage,
} from "@/lib/vertrieb/followup";
import { laterTiming } from "@/lib/vertrieb/spaeter";
import { dayKey } from "@/lib/vertrieb/dates";
import type { LlmCall } from "@/lib/kampagnen/llm";
import { requireTestDb } from "./db";

// Später-Follow-up (Ole, 14.11.2026): Erkennung, Antwort im Instantly-Thread, Abbruch,
// Abwesenheitsnotiz, kein Doppelversand, Aufgabe „Wieder melden“ statt doppelt.
const tag = Math.random().toString(36).slice(2, 8);
const campaign = `Spaeter Test ${tag}`;
const emails: string[] = [];
const BOX = `ole-${tag}@growth.test`;

type Call = { method: string; path: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let n = 0;
let outId = 0;

async function makeContact(extra: Record<string, unknown> = {}) {
  const email = `kontakt-${tag}-${++n}@agentur.test`;
  emails.push(email);
  return prisma.salesContact.create({ data: { email, name: `Agentur ${n}`, salutation: "Herr", firstName: "Max", lastName: `Muster${n}`, ...extra } });
}

/** Später-Antwort aus Instantly (mit Postfach und Instantly-ID) */
async function laterReply(contactId: string, text = "Aktuell nicht, aber ab März gerne.\n\nAm 12.08.2026 schrieb Ole:\n> Hallo Herr Muster, wir bringen Ihnen neue Kunden …") {
  await recordReply(contactId, {
    instantlyId: `in-${contactId}-${Math.random()}`,
    subject: "AW: Neue Kunden für Ihre Agentur",
    text,
    fromEmail: (await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId } })).email,
    threadId: `thr-${contactId}`,
    eaccount: BOX,
    isAutoReply: false,
    sentAt: new Date(),
    campaign,
  });
  return prisma.salesFollowup.findUnique({ where: { activeFor: contactId } });
}

const replyPosts = () => calls.filter((c) => c.method === "POST" && c.path.startsWith("/emails/reply"));
// Montag, 16.11.2026, 10:00 Uhr deutsche Zeit (im Versandfenster)
const MONDAY = new Date("2026-11-16T09:00:00Z");

describe("Später-Follow-up", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.INSTANTLY_API_KEY = "test";
    process.env.INSTANTLY_AUTO_SYNC = "1";
    delete process.env.ANTHROPIC_API_KEY;
    await prisma.salesFollowupSettings.deleteMany({});
    await prisma.salesFollowupSettings.create({ data: { id: "default", useAi: false, backfillAt: new Date(), bookingUrl: "https://termin.test/ole" } });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname.replace("/api/v2", "") + u.search;
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
      // Kleine Pause, damit gleichzeitige Läufe sich wirklich überschneiden
      await new Promise((r) => setTimeout(r, 20));
      if (path.startsWith("/emails/reply")) return json({ id: `out-${++outId}-${tag}`, thread_id: "thr-x" });
      if (path.startsWith("/accounts/")) return json({ email: BOX, first_name: "Ole", last_name: "Muster", signature: "Ole Muster<br/>performancegrowth" });
      return json({ items: [] });
    });
  });
  beforeEach(() => {
    calls = [];
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.INSTANTLY_API_KEY;
    delete process.env.INSTANTLY_AUTO_SYNC;
    await prisma.salesContact.deleteMany({ where: { email: { in: emails } } });
    await prisma.salesCampaign.deleteMany({ where: { name: campaign } });
    await prisma.salesFollowupSettings.deleteMany({});
  });

  it("erkennt „aktuell nicht, aber ab März“ als Später-Interesse und plant Mail 1 für März", async () => {
    const c = await makeContact({ stage: "NEU" });
    const f = await laterReply(c.id);
    expect(f).not.toBeNull();
    expect(f!.status).toBe("GEPLANT");
    expect(f!.timing).toBe("ab März");
    expect(dayKey(f!.dueAt)).toBe(dayKey(laterTiming("Aktuell nicht, aber ab März gerne.", new Date(), c.id).date));
    expect(f!.dueAt.toISOString().slice(5, 7)).toBe("03");
    const contact = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { emails: true, tasks: true } });
    expect(contact.stage).toBe("SPAETER"); // keine Absage, nicht „Verloren“
    expect(contact.emails[0].sentiment).toBe("SPAETER");
    expect(contact.tasks.filter((t) => !t.doneAt)).toHaveLength(0); // keine sofortige Antwort-Aufgabe
  });

  it("antwortet im selben Thread aus demselben Postfach (reply_to_uuid, eaccount, Re:, Verlauf zitiert)", async () => {
    const c = await makeContact();
    const f = await laterReply(c.id);
    const reply = await prisma.salesEmail.findUniqueOrThrow({ where: { id: f!.replyEmailId! } });
    const r = await sendFollowupStep(f!.id, { now: MONDAY });
    expect(r.sent).toBe(1);
    const posts = replyPosts();
    expect(posts).toHaveLength(1);
    const body = posts[0].body as { eaccount: string; reply_to_uuid: string; subject: string; body: { html: string; text: string } };
    expect(body.reply_to_uuid).toBe(reply.instantlyId);
    expect(body.eaccount).toBe(BOX);
    expect(body.subject).toBe("Re: Neue Kunden für Ihre Agentur");
    expect(body.body.html).toContain("blockquote");
    expect(body.body.html).toContain("Aktuell nicht, aber ab März gerne.");
    expect(body.body.html).toContain("Ole Muster<br/>performancegrowth");
    expect(body.body.text).toMatch(/^Guten Tag Herr Muster\d+,/);
    expect(body.body.text).toContain("https://termin.test/ole");
    expect(body.body.text).not.toMatch(/[–—]/);
    const after = await prisma.salesFollowup.findUniqueOrThrow({ where: { id: f!.id } });
    expect(after.step).toBe(1);
    expect(dayKey(after.nextAt)).toBe("2026-11-23"); // 5 Werktage später
    const out = await prisma.salesEmail.findMany({ where: { contactId: c.id, direction: "OUT" } });
    expect(out).toHaveLength(1);
    expect(out[0].eaccount).toBe(BOX);
    const act = await prisma.salesActivity.findFirst({ where: { contactId: c.id, outcome: "Später-Follow-up: Mail 1 gesendet" } });
    expect(act).not.toBeNull();

    // Mail 2 zitiert Mail 1 und antwortet wieder auf die Mail des Kontakts
    calls = [];
    expect((await sendFollowupStep(f!.id, { now: new Date("2026-11-23T09:30:00Z") })).sent).toBe(2);
    const b2 = replyPosts()[0].body as { reply_to_uuid: string; body: { html: string; text: string } };
    expect(b2.reply_to_uuid).toBe(reply.instantlyId);
    expect(b2.body.text).toContain("Kurz nachgehakt");
    expect(b2.body.html).toContain(out[0].html!.slice(0, 40));
  });

  it("kein Doppelversand: gleichzeitige Läufe senden nur einmal, vor dem Termin gar nicht", async () => {
    const c = await makeContact();
    const f = await laterReply(c.id);
    await prisma.salesFollowup.update({ where: { id: f!.id }, data: { nextAt: new Date(MONDAY.getTime() - 60_000), dueAt: new Date(MONDAY.getTime() - 60_000) } });
    await Promise.all([runFollowups(MONDAY), runFollowups(MONDAY), sendFollowupStep(f!.id, { now: MONDAY })]);
    expect(replyPosts().filter((p) => (p.body as { reply_to_uuid: string }).reply_to_uuid.includes(c.id))).toHaveLength(1);
    // nochmal am selben Tag: Mail 2 ist erst in 5 Werktagen dran
    calls = [];
    await runFollowups(new Date(MONDAY.getTime() + 3600_000));
    expect(replyPosts().filter((p) => (p.body as { reply_to_uuid: string }).reply_to_uuid.includes(c.id))).toHaveLength(0);
  });

  it("bricht bei Antwort sofort ab", async () => {
    const c = await makeContact();
    const f = await laterReply(c.id);
    await sendFollowupStep(f!.id, { now: MONDAY });
    await recordReply(c.id, { subject: "AW: Neue Kunden", text: "Danke, rufen Sie mich gerne an.", fromEmail: c.email, isAutoReply: false, sentAt: new Date(MONDAY.getTime() + 86400_000), campaign });
    const after = await prisma.salesFollowup.findUniqueOrThrow({ where: { id: f!.id } });
    expect(after.status).toBe("GESTOPPT");
    expect(after.stopReason).toBe("Antwort erhalten");
    expect(after.activeFor).toBeNull();
    calls = [];
    const r = await sendFollowupStep(f!.id, { now: new Date("2026-11-23T09:30:00Z") });
    expect(r.skipped).toBeTruthy();
    expect(replyPosts()).toHaveLength(0);
  });

  it("Abwesenheitsnotiz verschiebt Mail 2 statt abzubrechen", async () => {
    const c = await makeContact();
    const f = await laterReply(c.id);
    await sendFollowupStep(f!.id, { now: MONDAY });
    const before = await prisma.salesFollowup.findUniqueOrThrow({ where: { id: f!.id } });
    await recordReply(c.id, {
      subject: "Abwesenheitsnotiz",
      text: "Ich bin bis zum 04.12. nicht im Büro.",
      fromEmail: c.email,
      isAutoReply: true,
      sentAt: new Date(MONDAY.getTime() + 3600_000),
      campaign,
    });
    const after = await prisma.salesFollowup.findUniqueOrThrow({ where: { id: f!.id } });
    expect(after.activeFor).toBe(c.id);
    expect(after.status).toBe("GEPLANT");
    expect(after.nextAt.getTime()).toBeGreaterThan(before.nextAt.getTime());
    expect(dayKey(after.nextAt) > "2026-12-04").toBe(true);
  });

  it("Ausgang „Später wieder“ ersetzt die 60-Tage-Aufgabe; nach Mail 2 genau eine Aufgabe „Wieder melden“", async () => {
    const c = await makeContact({ stage: "SPAETER" });
    // Mail aus Instantly vorhanden (neutral), damit im Thread geantwortet werden kann
    await recordReply(c.id, { instantlyId: `in-n-${c.id}`, subject: "AW: Neue Kunden", text: "Danke für die Info.", fromEmail: c.email, eaccount: BOX, isAutoReply: false, sentAt: new Date(Date.now() - 86400_000), campaign });
    const due60 = new Date(Date.now() + 84 * 86400_000);
    await prisma.salesTask.create({ data: { contactId: c.id, title: "Wieder melden", type: "ANRUF", dueAt: due60 } });
    const f = await planFromOutcome(c.id, "Hat aktuell keine Zeit", due60);
    expect(f).not.toBeNull();
    expect(dayKey(f!.dueAt) >= dayKey(due60)).toBe(true); // Datum der Aufgabe (auf Werktag), Notiz ohne Zeitpunkt
    expect(await prisma.salesTask.count({ where: { contactId: c.id, doneAt: null, title: "Wieder melden" } })).toBe(0);

    await sendFollowupStep(f!.id, { now: MONDAY });
    await sendFollowupStep(f!.id, { now: new Date("2026-11-23T09:30:00Z") });
    // inzwischen hat jemand von Hand doch wieder eine Aufgabe angelegt: wird verschoben, nicht verdoppelt
    await prisma.salesTask.create({ data: { contactId: c.id, title: "Wieder melden", type: "ANRUF", dueAt: due60 } });
    const r = await sendFollowupStep(f!.id, { now: new Date("2026-11-30T09:30:00Z") });
    expect(r.finished).toBe(true);
    const tasks = await prisma.salesTask.findMany({ where: { contactId: c.id, doneAt: null, title: "Wieder melden" } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe("ANRUF");
    expect(dayKey(tasks[0].dueAt)).toBe("2026-11-30");
    const done = await prisma.salesFollowup.findUniqueOrThrow({ where: { id: f!.id } });
    expect(done.status).toBe("FERTIG");
    expect(done.activeFor).toBeNull();
  });

  it("Stufe Termin und Abmeldung stoppen", async () => {
    const a = await makeContact();
    const fa = await laterReply(a.id);
    await stopFollowupOnStage(a.id, "TERMIN");
    expect((await prisma.salesFollowup.findUniqueOrThrow({ where: { id: fa!.id } })).status).toBe("GESTOPPT");

    const b = await makeContact();
    const fb = await laterReply(b.id);
    await handleWebhook({ event_type: "lead_unsubscribed", lead_email: b.email, campaign_name: campaign });
    expect((await prisma.salesFollowup.findUniqueOrThrow({ where: { id: fb!.id } })).stopReason).toBe("Abgemeldet");

    // Sicherheitsnetz beim Senden: Stufe direkt geändert (z. B. Calendly)
    const d = await makeContact();
    const fd = await laterReply(d.id);
    await prisma.salesContact.update({ where: { id: d.id }, data: { stage: "GEWONNEN" } });
    calls = [];
    const r = await sendFollowupStep(fd!.id, { now: MONDAY });
    expect(r.stopped).toBe("Stufe „Gewonnen“");
    expect(replyPosts()).toHaveLength(0);
  });

  it("Bestand: wird eingeplant, wartet auf Freigabe, sendet erst nach „Alle freigeben“", async () => {
    const c = await makeContact({ stage: "SPAETER" });
    await prisma.salesEmail.create({
      data: { contactId: c.id, instantlyId: `in-old-${c.id}`, direction: "IN", subject: "AW: Neue Kunden", text: "Melden Sie sich nächstes Jahr wieder.", eaccount: BOX, campaign, sentAt: new Date("2025-09-10T10:00:00Z") },
    });
    const planned = await planExistingFollowups(MONDAY);
    expect(planned).toBeGreaterThanOrEqual(1);
    const f = await prisma.salesFollowup.findUniqueOrThrow({ where: { activeFor: c.id } });
    expect(f.status).toBe("FREIGABE");
    expect(f.source).toBe("BESTAND");
    expect(f.dueAt.getTime()).toBeGreaterThan(MONDAY.getTime()); // vergangener Zeitpunkt → nächste Werktage
    calls = [];
    await runFollowups(new Date(f.dueAt.getTime() + 60_000)); // Zeitpunkt erreicht, aber nicht freigegeben
    expect(replyPosts().filter((p) => (p.body as { reply_to_uuid: string }).reply_to_uuid === `in-old-${c.id}`)).toHaveLength(0);
    await approveFollowups("all", MONDAY);
    const ok = await prisma.salesFollowup.findUniqueOrThrow({ where: { id: f.id } });
    expect(ok.status).toBe("GEPLANT");
  });

  it("KI-Texte: Gedankenstrich wird ersetzt (kein zweiter Versuch nötig), ungültige Texte → Vorlage", async () => {
    await prisma.salesFollowupSettings.update({ where: { id: "default" }, data: { useAi: true } });
    try {
      const c = await makeContact();
      const f = await laterReply(c.id);
      let turn = 0;
      const llm: LlmCall = async () => {
        turn++;
        const dash = turn === 1 ? " – " : ", ";
        return {
          text: JSON.stringify({
            mail1: `Guten Tag Herr Muster,\n\nSie hatten mir im August geschrieben${dash}dass es ab März passt. Hätten Sie 15 Minuten? https://termin.test/ole`,
            mail2: "Guten Tag Herr Muster,\n\nkurz nachgehakt: Passt Ihnen ein kurzes Gespräch? https://termin.test/ole",
          }),
          usage: { tokensIn: 1, tokensOut: 1, costCents: 0 },
        };
      };
      const d = await draftFollowup(f!.id, { llm, force: true });
      expect(turn).toBe(1);
      expect(d.textSource).toBe("KI");
      expect(d.body1).not.toMatch(/[–—]/);

      const bad: LlmCall = async () => ({ text: JSON.stringify({ mail1: "Hallo du – hier", mail2: "x" }), usage: { tokensIn: 1, tokensOut: 1, costCents: 0 } });
      const v = await draftFollowup(f!.id, { llm: bad, force: true });
      expect(v.textSource).toBe("VORLAGE");
      expect(v.body1).toContain("Deshalb melde ich mich wie versprochen");
      expect(v.body1).not.toMatch(/[–—]/);
    } finally {
      await prisma.salesFollowupSettings.update({ where: { id: "default" }, data: { useAi: false } });
    }
  });
});
