// Instantly-Antworten nachholen (Ole, 16.11.2026: Antwort von Christina Dröge fehlte im CRM).
// Vorschau schreibt nichts; Nachholen legt Kontakt + Antwort an, plant Später-Follow-ups (ältere: Freigabe),
// beachtet Sperrliste und ausgeblendete Kampagnen und ist idempotent. Instantly wird nur gelesen.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { nachholenAntworten } from "@/lib/vertrieb/instantly-nachholen";
import { kontaktSucheWhere } from "@/lib/vertrieb/suche";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const droege = `christina.droege-${tag}@signal-iduna.test`;
const alt = `alt-${tag}@agentur.test`;
const known = `bekannt-${tag}@agentur.test`;
const blocked = `x-${tag}@minimi-kanzlei.de`;
const pflege = `pflege-${tag}@pflege.test`;
const auto = `auto-${tag}@agentur.test`;
const spam = `news-${tag}@newsletter.test`;
const CAMP = `camp-a-${tag}`;
const CAMP_P = `camp-p-${tag}`;
const BOX = "thurm@performancegrowth.org";
const day = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * day).toISOString();

const mail = (id: string, lead: string, campaign: string | null, text: string, at: string, extra: Record<string, unknown> = {}) => ({
  id: `${id}-${tag}`,
  eaccount: BOX,
  timestamp_email: at,
  timestamp_created: at,
  subject: "Re: Frage zur Neukundengewinnung für Ihre Agentur",
  from_address_email: lead,
  body: { text },
  content_preview: text,
  lead,
  campaign_id: campaign,
  thread_id: `thr-${id}-${tag}`,
  ue_type: 2,
  is_auto_reply: 0,
  i_status: null,
  ...extra,
});

const EMAILS = [
  mail("e1", droege, CAMP, "zu einem späteren Zeitpunkt 😉", ago(1)),
  mail("e2", alt, CAMP, "Gerne zu einem späteren Zeitpunkt nochmal melden.", ago(40)),
  mail("e3", blocked, CAMP, "Bitte melden Sie sich später.", ago(2)),
  mail("e4", pflege, CAMP_P, "Ja gerne, rufen Sie an.", ago(3)),
  mail("e5", auto, CAMP, "Ich bin bis zum 20.11. nicht im Büro.", ago(4), { is_auto_reply: 1, subject: "Abwesenheitsnotiz" }),
  mail("e6", known, CAMP, "Danke, kein Bedarf.", ago(5)),
  mail("e7", spam, null, "Unser Newsletter im November", ago(6)),
  { ...mail("e8", droege, CAMP, "gesendet", ago(1)), ue_type: 1 },
];

let calls: { method: string; path: string }[] = [];

describe("Instantly: Antworten nachholen", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.INSTANTLY_API_KEY = "test";
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname.replace("/api/v2", "");
      const method = init?.method ?? "GET";
      calls.push({ method, path: path + u.search });
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.hostname !== "api.instantly.ai") return new Response("", { status: 404 });
      if (path === "/campaigns") return json({ items: [{ id: CAMP, name: `Neukundengewinnung ${tag}` }, { id: CAMP_P, name: `Pflegedienste ${tag}` }] });
      if (path === "/emails") return json({ items: EMAILS });
      if (path === "/leads/list") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { search?: string };
        return json({ items: body.search === droege ? [{ email: droege, first_name: "Christina", last_name: "Droege", company_name: "Generalagentur der SIGNAL IDUNA Detmold" }] : [] });
      }
      return json({ items: [] });
    });
    // bekannter Kontakt, Antwort schon per Abgleich da
    const k = await prisma.salesContact.create({ data: { email: known, name: "Agentur Bekannt" } });
    await prisma.salesEmail.create({ data: { contactId: k.id, instantlyId: `e6-${tag}`, direction: "IN", subject: "Re: x", text: "Danke, kein Bedarf.", sentAt: new Date(ago(5)) } });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.INSTANTLY_API_KEY;
    await prisma.salesContact.deleteMany({ where: { email: { in: [droege, alt, known, blocked, pflege, auto, spam] } } });
    await prisma.salesCampaign.deleteMany({ where: { instantlyId: { in: [CAMP, CAMP_P] } } });
  });

  it("Vorschau: zählt Fehlendes, schreibt nichts, Instantly nur lesend", async () => {
    calls = [];
    const r = await nachholenAntworten({ anwenden: false });
    expect(r).toMatchObject({ angewendet: false, gelesen: 7, fehlend: 2, neueKontakte: 2, spaeter: 2, gesperrt: 1, ignoriert: 1, automatisch: 1, schonImCrm: 1, ohneKampagne: 1, nachgeholt: 0 });
    expect(r.postfaecher).toEqual({ [BOX]: 2 });
    expect(r.liste.map((x) => x.lead)).toEqual([droege, alt]);
    expect(r.liste[0]).toMatchObject({ kontakt: "neu", spaeter: true, postfach: BOX, kampagne: `Neukundengewinnung ${tag}` });
    expect(await prisma.salesContact.count({ where: { email: { in: [droege, alt, blocked, pflege, auto, spam] } } })).toBe(0);
    // Instantly: nur GET bzw. die Lese-Suche /leads/list, keine Antworten oder Änderungen
    expect(calls.every((c) => c.method === "GET" || c.path.startsWith("/leads/list"))).toBe(true);
  });

  it("Nachholen: Kontakt mit Namen, Antwort, Später-Follow-up (neu: geplant nach 3 Monaten, alt: Freigabe)", async () => {
    calls = [];
    const r = await nachholenAntworten({ anwenden: true });
    expect(r).toMatchObject({ angewendet: true, fehlend: 2, neueKontakte: 2, nachgeholt: 2 });
    expect(calls.every((c) => c.method === "GET" || c.path.startsWith("/leads/list"))).toBe(true);

    const c = await prisma.salesContact.findUniqueOrThrow({ where: { email: droege }, include: { emails: true, followups: true, campaigns: true } });
    expect(c).toMatchObject({ name: "Generalagentur der SIGNAL IDUNA Detmold", firstName: "Christina", lastName: "Droege", stage: "SPAETER" });
    expect(c.emails).toHaveLength(1);
    expect(c.emails[0]).toMatchObject({ instantlyId: `e1-${tag}`, eaccount: BOX, sentiment: "SPAETER", direction: "IN" });
    expect(c.followups).toHaveLength(1);
    expect(c.followups[0].status).toBe("GEPLANT");
    const months = (c.followups[0].nextAt.getTime() - c.emails[0].sentAt.getTime()) / day;
    expect(months).toBeGreaterThan(85);
    expect(months).toBeLessThan(95);
    expect(c.campaigns[0]).toMatchObject({ replyCount: 1 });

    const old = await prisma.salesContact.findUniqueOrThrow({ where: { email: alt }, include: { followups: true } });
    expect(old.followups).toHaveLength(1);
    expect(old.followups[0].status).toBe("FREIGABE");

    // Sperrliste, Pflege-Kampagne, Abwesenheitsnotiz, Newsletter: nichts angelegt
    expect(await prisma.salesContact.count({ where: { email: { in: [blocked, pflege, auto, spam] } } })).toBe(0);
  });

  it("zweiter Lauf ändert nichts (idempotent)", async () => {
    const before = await prisma.salesFollowup.count({ where: { contact: { email: { in: [droege, alt] } } } });
    const r = await nachholenAntworten({ anwenden: true });
    expect(r).toMatchObject({ fehlend: 0, neueKontakte: 0, nachgeholt: 0, schonImCrm: 3 });
    expect(await prisma.salesFollowup.count({ where: { contact: { email: { in: [droege, alt] } } } })).toBe(before);
    expect(await prisma.salesEmail.count({ where: { contact: { email: droege } } })).toBe(1);
    expect(await prisma.salesContact.count({ where: { email: droege } })).toBe(1);
  });

  it("Suche „Dröge“ findet den Kontakt (Datenbank, umlaut-tolerant)", async () => {
    const hits = await prisma.salesContact.findMany({ where: { AND: [kontaktSucheWhere("Dröge"), { email: { contains: tag } }] }, select: { email: true } });
    expect(hits.map((h) => h.email)).toEqual([droege]);
    const hits2 = await prisma.salesContact.findMany({ where: { AND: [kontaktSucheWhere("Christina Dröge"), { email: { contains: tag } }] }, select: { email: true } });
    expect(hits2.map((h) => h.email)).toEqual([droege]);
  });

  it("Diagnose q=instantly: Befund zur Adresse und Suche, ohne Mailinhalte und Schlüssel", async () => {
    const { GET } = await import("@/app/api/ops/diagnose/route");
    const before = process.env.OPS_READ_TOKEN;
    const token = "test-read-token-0123456789-0123456789-abcdef";
    process.env.OPS_READ_TOKEN = token;
    try {
      const res = await GET(new Request(`https://app.test/api/ops/diagnose?q=instantly&email=${encodeURIComponent(droege)}&name=${encodeURIComponent("Dröge")}&nachholen=1`, { headers: { authorization: `Bearer ${token}` } }));
      expect(res.status).toBe(200);
      const raw = await res.text();
      const j = JSON.parse(raw) as { data: { konfiguration: { apiKey: boolean }; adresse: { kontakt: { stage: string; emails: { weg: string }[] }; inInstantly: { imCrm: boolean }[] }; suche: { name: string }[]; nachholenVorschau: { fehlend: number } } };
      expect(j.data.konfiguration.apiKey).toBe(true);
      expect(j.data.adresse.kontakt.stage).toBe("SPAETER");
      expect(j.data.adresse.kontakt.emails[0].weg).toBe("Abgleich");
      expect(j.data.adresse.inInstantly.some((e) => e.imCrm)).toBe(true);
      expect(j.data.suche.map((x) => x.name)).toContain("Generalagentur der SIGNAL IDUNA Detmold");
      expect(j.data.nachholenVorschau.fehlend).toBe(0);
      expect(raw).not.toContain("späteren");
      expect(raw).not.toContain('"test"');
    } finally {
      process.env.OPS_READ_TOKEN = before;
    }
  });

  it("Webhook ohne campaign_name: Kampagne behält ihren Namen, Antwort kommt an", async () => {
    const { handleWebhook } = await import("@/lib/vertrieb/instantly");
    await prisma.salesCampaign.upsert({ where: { name: "Instantly" }, create: { name: "Instantly" }, update: {} });
    const r = await handleWebhook({ event_type: "reply_received", lead_email: droege, campaign_id: CAMP, reply_subject: "Re: Nachfrage", reply_text: "Rufen Sie mich an.", timestamp: ago(0) });
    expect(r).toEqual({ ok: true });
    expect((await prisma.salesCampaign.findUniqueOrThrow({ where: { instantlyId: CAMP } })).name).toBe(`Neukundengewinnung ${tag}`);
    expect(await prisma.salesEmail.count({ where: { contact: { email: droege } } })).toBe(2);
  });
});

