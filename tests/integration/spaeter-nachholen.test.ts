// Später-Erkennung und Nachholen (Ole, 18.11.2026: Norbert Tetenborg schrieb „später“, war aber nicht im
// Später-Follow-up). Erkennung über Regeln und KI (gemockt) auch bei anderem Instantly-Status, nie für Absagen und
// Abwesenheitsnotizen; Nachholen: Vorschau ändert nichts, Ausführen plant fehlende ein (frühestens in 3 Tagen),
// holt Antworten, die nur in Instantly liegen, sendet nichts, schreibt ein Audit und plant nie doppelt.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordReply } from "@/lib/vertrieb/instantly";
import { spaeterNachholen } from "@/lib/vertrieb/spaeter-nachholen";
import { dayKey } from "@/lib/vertrieb/dates";
import { requireTestDb } from "./db";

const ki = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/kampagnen/llm", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/kampagnen/llm")>();
  return {
    ...orig,
    // Keine echten KI-Aufrufe: „Frühjahr“ → später (1. März), sonst „sonstiges“
    claudeCall: async (req: { user: string }) => {
      ki.calls.push(req.user);
      const antwort = /frühjahr/i.test(req.user)
        ? { kategorie: "spaeter", datum: "2027-03-01", zeitpunkt: "im Frühjahr", grund: "Im Frühjahr wieder interessant." }
        : { kategorie: "sonstiges", datum: null, zeitpunkt: null, grund: "kein Bezug" };
      return { text: JSON.stringify(antwort), usage: { tokensIn: 1, tokensOut: 1, costCents: 0 } };
    },
  };
});

const tag = Math.random().toString(36).slice(2, 8);
const BOX = `ole-${tag}@growth.test`;
const CAMP = `camp-spaeter-${tag}`;
const CAMP_NAME = `Spaeter Nachholen ${tag}`;
const ACTOR = `test-spaeter-${tag}`;
// Mittwoch, 18.11.2026, 11 Uhr deutsche Zeit → frühester Termin Montag, 23.11.
const NOW = new Date("2026-11-18T10:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const FRUEHJAHR = "Wir sind gut aufgestellt. Im Frühjahr sieht das bestimmt anders aus.";

const emails: string[] = [];
let n = 0;
let calls: { method: string; path: string }[] = [];
let instantlyMails: Record<string, unknown>[] = [];

async function makeContact(extra: Record<string, unknown> = {}) {
  const email = `kontakt-${tag}-${++n}@agentur.test`;
  emails.push(email);
  return prisma.salesContact.create({ data: { email, name: `Agentur ${n} ${tag}`, firstName: "Max", lastName: `Muster${n}`, stage: "NEU", ...extra } });
}

/** Gespeicherte Antwort direkt in der DB (wie vom Abgleich, ohne Planung) */
async function storedReply(contactId: string, text: string, at: Date, extra: Record<string, unknown> = {}) {
  return prisma.salesEmail.create({
    data: { contactId, instantlyId: `st-${contactId}-${at.getTime()}`, direction: "IN", subject: "AW: Neue Kunden", text, eaccount: BOX, threadId: `thr-${contactId}`, campaign: CAMP_NAME, sentAt: at, ...extra },
  });
}

async function liveReply(contactId: string, text: string, extra: { isAutoReply?: boolean; interest?: number | null } = {}) {
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId } });
  await recordReply(contactId, {
    instantlyId: `in-${contactId}-${Math.random()}`,
    subject: "AW: Neue Kunden für Ihre Agentur",
    text,
    fromEmail: c.email,
    threadId: `thr-${contactId}`,
    eaccount: BOX,
    isAutoReply: extra.isAutoReply ?? false,
    sentAt: new Date(),
    campaign: CAMP_NAME,
    interest: extra.interest ?? null,
  });
  return prisma.salesFollowup.findUnique({ where: { activeFor: contactId } });
}

/** Wie onDecline nach Instantly „Kein Interesse“ (lib/vertrieb/instantly.ts) */
async function autoVerloren(contactId: string, at: Date) {
  await prisma.salesContact.update({ where: { id: contactId }, data: { stage: "VERLOREN", lossReason: "KEIN_INTERESSE" } });
  await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: "Instantly: Kein Interesse", note: "Automatisch auf „Verloren“ gesetzt, offene Antwort-Aufgabe entfernt.", occurredAt: at } });
}

const replyPosts = () => calls.filter((c) => c.method === "POST" && c.path.startsWith("/emails/reply"));

describe("Später-Erkennung und Nachholen", () => {
  beforeAll(async () => {
    requireTestDb();
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    process.env.INSTANTLY_API_KEY = "test";
    process.env.ANTHROPIC_API_KEY = "test";
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname.replace("/api/v2", "");
      const method = init?.method ?? "GET";
      calls.push({ method, path });
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.hostname !== "api.instantly.ai") return new Response("", { status: 404 });
      if (path === "/campaigns") return json({ items: [{ id: CAMP, name: CAMP_NAME }] });
      if (path === "/emails" && method === "GET") return json({ items: instantlyMails });
      return json({ items: [] });
    });
    await prisma.salesCampaign.create({ data: { name: CAMP_NAME, instantlyId: CAMP } });
  });
  beforeEach(() => {
    calls = [];
    ki.calls = [];
  });
  afterAll(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.INSTANTLY_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await prisma.salesContact.deleteMany({ where: { email: { in: emails } } });
    await prisma.salesCampaign.deleteMany({ where: { name: CAMP_NAME } });
    await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR } });
  });

  describe("beim Eingang einer Antwort", () => {
    it("„später“ ohne passenden Instantly-Status (als interessiert markiert): KI erkennt es, Follow-up mit Datum", async () => {
      const c = await makeContact();
      const f = await liveReply(c.id, FRUEHJAHR, { interest: 1 });
      expect(ki.calls).toHaveLength(1);
      expect(f).not.toBeNull();
      expect(f!.status).toBe("GEPLANT");
      expect(dayKey(f!.dueAt)).toBe("2027-03-01");
      expect(f!.timing).toBe("im Frühjahr");
      const contact = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { emails: true, tasks: true } });
      expect(contact.stage).toBe("SPAETER");
      expect(contact.emails[0].sentiment).toBe("SPAETER");
      expect(contact.tasks.filter((t) => !t.doneAt)).toHaveLength(0); // keine Anruf-Aufgabe trotz „Interessiert“
      expect(replyPosts()).toHaveLength(0);
    });

    it("Regel greift auch ohne KI: „Momentan nicht, später vielleicht“", async () => {
      const c = await makeContact();
      const f = await liveReply(c.id, "Momentan nicht, später vielleicht.");
      expect(ki.calls).toHaveLength(0);
      expect(f).not.toBeNull();
      expect(dayKey(f!.dueAt)).toBe("2027-02-18"); // ohne Zeitpunkt: 3 Monate
    });

    it("klare Absage: kein Follow-up, keine KI", async () => {
      const c = await makeContact();
      const f = await liveReply(c.id, "Kein Interesse, bitte nicht mehr schreiben.");
      expect(f).toBeNull();
      expect(ki.calls).toHaveLength(0);
      expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } })).stage).toBe("VERLOREN");
    });

    it("Instantly meldete „Kein Interesse“ vor dem Text (automatisch Verloren): „später“ im Text hat Vorrang", async () => {
      const c = await makeContact();
      await autoVerloren(c.id, ago(0.01));
      const f = await liveReply(c.id, "Gerne später nochmal.");
      expect(f).not.toBeNull();
      expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } })).stage).toBe("SPAETER");
    });

    it("Abwesenheitsnotiz: kein Follow-up, keine KI", async () => {
      const c = await makeContact();
      const f = await liveReply(c.id, "Ich bin bis zum 15.01. nicht im Büro. Im Frühjahr gerne wieder.", { isAutoReply: true });
      expect(f).toBeNull();
      expect(ki.calls).toHaveLength(0);
    });
  });

  describe("Nachholen", () => {
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      // Tetenborg-Fall: „später“, von Instantly als interessiert markiert, nie eingeplant
      const tet = await makeContact({ firstName: "Norbert", lastName: `Tetenborg${tag}`, name: `Versicherungsbüro Tetenborg ${tag}` });
      await storedReply(tet.id, "Hallo, ich hätte später Interesse an Leads.\n\nAm 12.11.2026 schrieb Ole:\n> Hallo Herr Tetenborg", ago(6), { sentiment: "POSITIV" });
      ids.tet = tet.id;
      // nur per KI erkennbar
      const k = await makeContact();
      await storedReply(k.id, FRUEHJAHR, ago(10), { sentiment: "NEUTRAL" });
      ids.ki = k.id;
      // Zeitpunkt schon vorbei („in 4 Wochen“ vor 45 Tagen): frühestens in 3 Tagen
      const alt = await makeContact();
      await storedReply(alt.id, "Melden Sie sich in 4 Wochen nochmal.", ago(45), { sentiment: "NEUTRAL" });
      ids.alt = alt.id;
      // klare Absage
      const no = await makeContact();
      await storedReply(no.id, "Kein Interesse.", ago(3), { sentiment: "NEGATIV" });
      ids.no = no.id;
      // Abwesenheitsnotiz
      const auto = await makeContact();
      await storedReply(auto.id, "Ich bin bis 30.11. nicht im Büro, danach gerne später.", ago(2), { isAutoReply: true, sentiment: "NEUTRAL" });
      ids.auto = auto.id;
      // läuft schon
      const lauf = await makeContact();
      const m = await storedReply(lauf.id, "Gerne später nochmal.", ago(8), { sentiment: "SPAETER" });
      await prisma.salesFollowup.create({ data: { contactId: lauf.id, activeFor: lauf.id, status: "GEPLANT", source: "ANTWORT", dueAt: ago(-30), nextAt: ago(-30), replyEmailId: m.id } });
      ids.lauf = lauf.id;
      // Metzner-Fall: Instantly „Kein Interesse“ → automatisch Verloren, Text sagt „später“
      const met = await makeContact({ firstName: "Björn", lastName: `Metzner${tag}` });
      await storedReply(met.id, "Aktuell nicht, aber im neuen Jahr gerne wieder.", ago(9), { sentiment: "NEGATIV" });
      await autoVerloren(met.id, ago(8.9));
      ids.met = met.id;
      // von Hand auf Verloren gesetzt: bleibt verloren
      const hand = await makeContact();
      await storedReply(hand.id, "Gerne später nochmal.", ago(9), { sentiment: "SPAETER" });
      await autoVerloren(hand.id, ago(8.9));
      await prisma.salesActivity.create({ data: { contactId: hand.id, type: "STATUS", outcome: "Später → Verloren", occurredAt: ago(8) } });
      ids.hand = hand.id;
      // außerhalb von 60 Tagen
      const uralt = await makeContact();
      await storedReply(uralt.id, "Gerne später nochmal.", ago(70), { sentiment: "SPAETER" });
      ids.uralt = uralt.id;
      // Antwort liegt nur in Instantly
      const nur = await makeContact();
      ids.nur = nur.id;
      instantlyMails = [
        {
          id: `api-nur-${tag}`,
          eaccount: BOX,
          timestamp_email: ago(20).toISOString(),
          timestamp_created: ago(20).toISOString(),
          subject: "Re: Neue Kunden",
          from_address_email: nur.email,
          body: { text: "Aktuell nicht, aber nächstes Jahr gerne wieder." },
          content_preview: "Aktuell nicht, aber nächstes Jahr gerne wieder.",
          lead: nur.email,
          campaign_id: CAMP,
          thread_id: `thr-api-${tag}`,
          ue_type: 2,
          is_auto_reply: 0,
          i_status: null,
        },
      ];
    });

    const alle = () => Object.values(ids);
    const zustand = async () => ({
      followups: await prisma.salesFollowup.count({ where: { contactId: { in: alle() } } }),
      sentiments: (await prisma.salesEmail.findMany({ where: { contactId: { in: alle() } }, orderBy: { id: "asc" }, select: { sentiment: true } })).map((e) => e.sentiment),
      mails: await prisma.salesEmail.count({ where: { contactId: { in: alle() } } }),
      stufen: (await prisma.salesContact.findMany({ where: { id: { in: alle() } }, orderBy: { id: "asc" }, select: { stage: true } })).map((c) => c.stage),
      audit: await prisma.auditLog.count({ where: { action: "vertrieb.spaeter_nachholen", actorEmail: ACTOR } }),
    });

    it("Vorschau listet die fehlenden und ändert nichts", async () => {
      const vorher = await zustand();
      const r = await spaeterNachholen({ vorschau: true, now: NOW, nurKontakte: alle(), actor: { email: ACTOR } });
      expect(await zustand()).toEqual(vorher);
      expect(replyPosts()).toHaveLength(0);
      const byId = new Map(r.liste.map((x) => [x.kontaktId, x]));
      expect([...byId.keys()].sort()).toEqual([ids.tet, ids.ki, ids.alt, ids.nur, ids.met].sort());
      expect(byId.get(ids.met)).toMatchObject({ ausVerloren: true, name: `Björn Metzner${tag}` });
      expect(byId.get(ids.tet)).toMatchObject({ name: `Norbert Tetenborg${tag}`, agentur: `Versicherungsbüro Tetenborg ${tag}`, erkannt: "Regel" });
      expect(byId.get(ids.tet)!.zitat).toBe("Hallo, ich hätte später Interesse an Leads.");
      expect(byId.get(ids.ki)).toMatchObject({ erkannt: "KI", geplantDatum: "01.03.2027" });
      expect(byId.get(ids.nur)).toMatchObject({ nurInInstantly: true });
      expect(dayKey(new Date(byId.get(ids.alt)!.geplantFuer))).toBe("2026-11-23");
      expect(r.uebersprungen["klare Absage"]).toBe(1);
      expect(r.uebersprungen["Follow-up läuft schon"]).toBe(1);
      expect(r.vorschau).toBe(true);
      expect(r.eingeplant).toBe(0);
    });

    it("Ausführen plant die fehlenden ein (frühestens in 3 Tagen), holt die Instantly-Antwort, sendet nichts", async () => {
      const r = await spaeterNachholen({ vorschau: false, now: NOW, nurKontakte: alle(), actor: { email: ACTOR } });
      expect(r.eingeplant).toBe(5);
      expect(replyPosts()).toHaveLength(0);
      const fs = await prisma.salesFollowup.findMany({ where: { contactId: { in: [ids.tet, ids.ki, ids.alt, ids.nur, ids.met] }, activeFor: { not: null } } });
      expect(fs).toHaveLength(5);
      for (const f of fs) {
        expect(f.status).toBe("GEPLANT");
        expect(f.nextAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 3 * DAY);
        expect(f.mail1SentAt).toBeNull();
      }
      expect(dayKey(fs.find((f) => f.contactId === ids.ki)!.dueAt)).toBe("2027-03-01");
      expect(dayKey(fs.find((f) => f.contactId === ids.alt)!.dueAt)).toBe("2026-11-23");
      const tet = await prisma.salesContact.findUniqueOrThrow({ where: { id: ids.tet }, include: { emails: true } });
      expect(tet.stage).toBe("SPAETER");
      expect(tet.emails[0].sentiment).toBe("SPAETER");
      // Antwort aus Instantly gespeichert und als Grundlage verknüpft
      const nur = await prisma.salesEmail.findUniqueOrThrow({ where: { instantlyId: `api-nur-${tag}` } });
      expect(fs.find((f) => f.contactId === ids.nur)!.replyEmailId).toBe(nur.id);
      // nichts für Absage, Abwesenheit, uralt
      expect(await prisma.salesFollowup.count({ where: { contactId: { in: [ids.no, ids.auto, ids.uralt, ids.hand] } } })).toBe(0);
      expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: ids.met } })).stage).toBe("SPAETER");
      expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: ids.hand } })).stage).toBe("VERLOREN");
      expect(await prisma.auditLog.count({ where: { action: "vertrieb.spaeter_nachholen", actorEmail: ACTOR } })).toBe(1);
    });

    it("zweiter Lauf plant nichts doppelt", async () => {
      const vorher = await prisma.salesFollowup.count({ where: { contactId: { in: alle() } } });
      const r = await spaeterNachholen({ vorschau: false, now: NOW, nurKontakte: alle(), actor: { email: ACTOR } });
      expect(r.eingeplant).toBe(0);
      expect(await prisma.salesFollowup.count({ where: { contactId: { in: alle() } } })).toBe(vorher);
      expect(replyPosts()).toHaveLength(0);
    });

    it("Diagnose: q=instantly&name=… zeigt Antworten, Interesse und Follow-up; q=spaeter-nachholen ist ohne ausfuehren=1 nur Vorschau", async () => {
      const TOKEN = "test-read-token-0123456789-0123456789-abcdef";
      const before = process.env.OPS_READ_TOKEN;
      process.env.OPS_READ_TOKEN = TOKEN;
      try {
        const { GET } = await import("@/app/api/ops/diagnose/route");
        const get = (q: string) => GET(new Request(`https://app.test/api/ops/diagnose?q=${q}`, { headers: { authorization: `Bearer ${TOKEN}` } }));
        const j = (await (await get(`instantly&name=Tetenborg${tag}`)).json()) as {
          data: { suche: { id: string; antworten: { status: string; anfang: string }[]; spaeterFollowup: { ja: boolean; geplantFuer?: string }; instantlyInteresse: unknown }[] };
        };
        const t = j.data.suche.find((x) => x.id === ids.tet)!;
        expect(t.antworten[0]).toMatchObject({ status: "SPAETER", anfang: "Hallo, ich hätte später Interesse an Leads." });
        expect(t.spaeterFollowup.ja).toBe(true);
        expect(t.spaeterFollowup.geplantFuer).toBeTruthy();
        expect(t).toHaveProperty("instantlyInteresse");

        const neu = await makeContact();
        await storedReply(neu.id, "Gerne später nochmal.", ago(4), { sentiment: "NEUTRAL" });
        const v = (await (await get(`spaeter-nachholen&kontakt=${neu.id}`)).json()) as { data: { vorschau: boolean; liste: { kontaktId: string }[] } };
        expect(v.data.vorschau).toBe(true);
        expect(v.data.liste.map((x) => x.kontaktId)).toEqual([neu.id]);
        expect(await prisma.salesFollowup.count({ where: { contactId: neu.id } })).toBe(0);
        const a = (await (await get(`spaeter-nachholen&kontakt=${neu.id}&ausfuehren=1`)).json()) as { data: { vorschau: boolean; eingeplant: number } };
        expect(a.data).toMatchObject({ vorschau: false, eingeplant: 1 });
        expect(await prisma.auditLog.count({ where: { action: "vertrieb.spaeter_nachholen", actorEmail: "ops-diagnose", at: { gte: NOW } } })).toBeGreaterThanOrEqual(1);
        await prisma.auditLog.deleteMany({ where: { action: "vertrieb.spaeter_nachholen", actorEmail: "ops-diagnose", at: { gte: NOW } } });
      } finally {
        process.env.OPS_READ_TOKEN = before;
      }
    });
  });
});
