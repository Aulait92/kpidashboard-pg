// „Nie kontaktieren“ (Ole, 19.11.2026): Antwort mit Austragungswunsch bzw. Datenschutzfrage sperrt den Kontakt, trägt
// ihn in die Instantly-Blocklist ein und stoppt ihn in allen Kampagnen (Instantly gemockt), Wiederholung bei Fehlern,
// Nachhol-Lauf idempotent, Abgleich vor Upload, kein Später-Follow-up mehr.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleWebhook, recordReply } from "@/lib/vertrieb/instantly";
import { kontaktGesperrt } from "@/lib/vertrieb/sperrliste";
import { planFollowup, sendFollowupStep } from "@/lib/vertrieb/followup";
import { instantlySperrenNachholen, nieKontaktierenAufheben, sperrenAusAntworten, sperrZaehler, vorUploadPruefen } from "@/lib/vertrieb/nie-kontaktieren-server";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const campaign = `Sperre Test ${tag}`;
const BOX = `ole-${tag}@growth.test`;
const emails: string[] = [];
let n = 0;

type Call = { method: string; path: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let instantlyKaputt = false;
const blocklist: string[] = [];

async function makeContact(extra: Record<string, unknown> = {}) {
  const email = `sperre-${tag}-${++n}@agentur.test`;
  emails.push(email);
  return prisma.salesContact.create({ data: { email, name: `Agentur ${n}`, ...extra } });
}

async function antwort(contactId: string, text: string, sentAt = new Date()) {
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId } });
  await recordReply(contactId, {
    instantlyId: `in-${contactId}-${Math.random()}`,
    subject: "AW: Neue Kunden für Ihre Agentur",
    text,
    fromEmail: c.email,
    threadId: `thr-${contactId}`,
    eaccount: BOX,
    isAutoReply: false,
    sentAt,
    campaign,
  });
  return prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, include: { tasks: true, emails: true } });
}

const posts = (p: string) => calls.filter((c) => c.method === "POST" && c.path.startsWith(p));

describe("Nie kontaktieren", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.INSTANTLY_API_KEY = "test";
    process.env.INSTANTLY_AUTO_SYNC = "1";
    delete process.env.ANTHROPIC_API_KEY;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname.replace("/api/v2", "") + u.search;
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      if (instantlyKaputt && (path.startsWith("/block-lists-entries") || path.startsWith("/campaigns/search-by-contact"))) return json({ message: "kaputt" }, 500);
      if (path.startsWith("/block-lists-entries") && method === "GET") {
        const s = u.searchParams.get("search");
        return json({ items: blocklist.filter((b) => !s || b === s).map((b) => ({ bl_value: b })) });
      }
      if (path.startsWith("/block-lists-entries") && method === "POST") {
        const v = String((calls[calls.length - 1].body as { bl_value: string }).bl_value);
        blocklist.push(v);
        return json({ id: `bl-${blocklist.length}`, bl_value: v, is_domain: false });
      }
      if (path.startsWith("/campaigns/search-by-contact")) return json({ items: [{ id: "camp-a", name: "A" }, { id: "camp-b", name: "B" }] });
      if (path.startsWith("/leads/update-interest-status")) return json({ message: "Lead interest status update background job submitted" }, 202);
      if (path.startsWith("/emails/reply")) return json({ id: `out-${Math.random()}`, thread_id: "thr-x" });
      if (path.startsWith("/accounts/")) return json({ email: BOX, first_name: "Ole", last_name: "Muster", signature: "Ole" });
      return json({ items: [] });
    });
  });
  beforeEach(() => {
    calls = [];
    instantlyKaputt = false;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.INSTANTLY_API_KEY;
    delete process.env.INSTANTLY_AUTO_SYNC;
    await prisma.salesContact.deleteMany({ where: { email: { in: emails } } });
    await prisma.salesCampaign.deleteMany({ where: { name: campaign } });
  });

  it("Antwort „bitte austragen“ sperrt, trägt in die Blocklist ein und stoppt alle Kampagnen", async () => {
    const c = await makeContact();
    const nach = await antwort(c.id, "Bitte tragen Sie mich aus Ihrem Verteiler aus.\n\nMit freundlichen Grüßen\nMax Muster");
    expect(nach.nieKontaktierenAt).not.toBeNull();
    expect(nach.nieKontaktierenGrund).toBe("austragen");
    expect(nach.instantlyGesperrtAt).not.toBeNull();
    expect(nach.emails[0].sentiment).toBe("NEGATIV");
    expect(await kontaktGesperrt(c.id)).toBe(true);
    // Blocklist mit genau der Adresse, Interessenstatus „kein Interesse“ in beiden Kampagnen
    expect(posts("/block-lists-entries").map((p) => p.body)).toEqual([{ bl_value: c.email }]);
    const stops = posts("/leads/update-interest-status").map((p) => p.body);
    expect(stops).toEqual([
      { lead_email: c.email, campaign_id: "camp-a", interest_value: -1 },
      { lead_email: c.email, campaign_id: "camp-b", interest_value: -1 },
    ]);
    // Verlauf
    expect(await prisma.salesActivity.count({ where: { contactId: c.id, outcome: "Nie kontaktieren" } })).toBe(1);

    // Zweite Antwort: bleibt bei der ersten Sperre, kein zweiter Blocklist-Eintrag
    calls = [];
    await antwort(c.id, "Nochmal: abmelden!");
    expect(posts("/block-lists-entries")).toHaveLength(0);
    expect(await prisma.salesActivity.count({ where: { contactId: c.id, outcome: "Nie kontaktieren" } })).toBe(1);
  });

  it("Datenschutzfrage sperrt und legt die Aufgabe „Auskunft nach Art. 15“ mit Frist an", async () => {
    const c = await makeContact();
    const eingang = new Date("2026-11-19T10:00:00Z");
    const nach = await antwort(c.id, "Woher haben Sie meine E-Mail-Adresse? Ich verlange Auskunft nach Art. 15 DSGVO.", eingang);
    expect(nach.nieKontaktierenGrund).toBe("datenschutz");
    const aufgaben = nach.tasks.filter((t) => t.title.startsWith("Auskunft nach Art. 15"));
    expect(aufgaben.map((t) => t.title)).toEqual(["Auskunft nach Art. 15 beantworten, Frist 19.12.2026"]);
    // keine Antwort-Aufgabe für den Vertrieb
    expect(nach.tasks.filter((t) => t.title === "Auf Cold-Mail-Antwort reagieren")).toHaveLength(0);
  });

  it("Zitat unserer Cold-Mail mit Abmeldehinweis löst keine Sperre aus", async () => {
    const c = await makeContact();
    const nach = await antwort(
      c.id,
      "Klingt interessant, rufen Sie mich gerne an.\n\nAm 12.11.2026 um 10:02 schrieb Ole Muster:\n> Wenn Sie keine weiteren E-Mails wünschen, antworten Sie mit „abmelden“.",
    );
    expect(nach.nieKontaktierenAt).toBeNull();
    expect(posts("/block-lists-entries")).toHaveLength(0);
    expect(await kontaktGesperrt(c.id)).toBe(false);
  });

  it("Instantly-Fehler: Sperre bleibt offen und der Cron-Lauf holt sie nach", async () => {
    const c = await makeContact();
    instantlyKaputt = true;
    const nach = await antwort(c.id, "Bitte nicht mehr anschreiben.");
    expect(nach.nieKontaktierenAt).not.toBeNull();
    expect(nach.instantlyGesperrtAt).toBeNull();
    expect(nach.instantlySperreVersuche).toBe(1);
    expect(nach.instantlySperreFehler).toMatch(/500/);
    expect(await kontaktGesperrt(c.id)).toBe(true); // in der App sofort gesperrt

    instantlyKaputt = false;
    calls = [];
    const r = await instantlySperrenNachholen();
    expect(r.erledigt).toBeGreaterThanOrEqual(1);
    const danach = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(danach.instantlyGesperrtAt).not.toBeNull();
    expect(danach.instantlySperreFehler).toBeNull();
    expect(posts("/block-lists-entries").some((p) => p.body?.bl_value === c.email)).toBe(true);
  });

  it("ohne INSTANTLY_AUTO_SYNC wird Instantly nicht beschrieben (bleibt offen für die Produktion)", async () => {
    process.env.INSTANTLY_AUTO_SYNC = "0";
    try {
      const c = await makeContact();
      const nach = await antwort(c.id, "Unsubscribe");
      expect(nach.nieKontaktierenAt).not.toBeNull();
      expect(nach.instantlyGesperrtAt).toBeNull();
      expect(posts("/block-lists-entries")).toHaveLength(0);
    } finally {
      process.env.INSTANTLY_AUTO_SYNC = "1";
    }
    await instantlySperrenNachholen(100);
  });

  it("Abmeldung in Instantly (Webhook) sperrt; Versand an Gesperrte meldet Instantly erneut zum Sperren", async () => {
    const c = await makeContact();
    await handleWebhook({ lead_email: c.email, event_type: "lead_unsubscribed", campaign_name: campaign });
    const nach = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(nach.nieKontaktierenGrund).toBe("austragen");
    expect(nach.instantlyGesperrtAt).not.toBeNull();
    await handleWebhook({ lead_email: c.email, event_type: "email_sent", campaign_name: campaign });
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } })).instantlyGesperrtAt).toBeNull();
    await instantlySperrenNachholen(100);
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } })).instantlyGesperrtAt).not.toBeNull();
  });

  it("Später-Follow-up: wird für Gesperrte nicht geplant und ein laufendes sendet nicht", async () => {
    const c = await makeContact({ stage: "SPAETER" });
    await prisma.salesEmail.create({
      data: { contactId: c.id, direction: "IN", instantlyId: `in-f-${c.id}`, subject: "AW: Test", text: "Gerne im März.", eaccount: BOX, campaign, sentAt: new Date(Date.now() - 86400000) },
    });
    const f = await planFollowup(c.id, { source: "ANTWORT", dueAt: new Date(Date.now() - 60_000) });
    expect(f).not.toBeNull();
    // Sperre direkt in der Datenbank (ohne den Stopp in nieKontaktierenSetzen): der Versand selbst muss prüfen
    await prisma.salesContact.update({ where: { id: c.id }, data: { nieKontaktierenAt: new Date(), nieKontaktierenGrund: "manuell" } });
    calls = [];
    const res = await sendFollowupStep(f!.id, { manual: true });
    expect(res).toEqual({ stopped: "Sperrliste" });
    expect(posts("/emails/reply")).toHaveLength(0);
    expect(await planFollowup(c.id, { source: "AUSGANG" })).toBeNull();
    // von Hand aufheben: wieder planbar
    expect(await nieKontaktierenAufheben(c.id)).toBe(true);
    expect(await kontaktGesperrt(c.id)).toBe(false);
  });

  it("Abgleich vor Upload filtert Sperrliste, nie kontaktieren, Abmeldung, harte Bounces und Blocklist", async () => {
    const gesperrt = await makeContact({ nieKontaktierenAt: new Date(), nieKontaktierenGrund: "austragen" });
    const bounce = await makeContact();
    const abgemeldet = await makeContact();
    const frei = await makeContact();
    const camp = await prisma.salesCampaign.upsert({ where: { name: campaign }, create: { name: campaign }, update: {} });
    await prisma.salesCampaignLead.create({ data: { contactId: bounce.id, campaignId: camp.id, bounced: true } });
    await prisma.salesCampaignLead.create({ data: { contactId: abgemeldet.id, campaignId: camp.id, unsubscribed: true } });
    const r = await vorUploadPruefen(
      [gesperrt.email.toUpperCase(), bounce.email, abgemeldet.email, frei.email, "info@minimi-kanzlei.de", "x@blockiert.example", "neu@frei.example"],
      { blocklist: new Set(["blockiert.example"]) },
    );
    expect(r.erlaubt.sort()).toEqual([frei.email, "neu@frei.example"].sort());
    expect(Object.fromEntries(r.gesperrt.map((g) => [g.email, g.grund]))).toEqual({
      [gesperrt.email]: "nie_kontaktieren",
      [bounce.email]: "bounce_hart",
      [abgemeldet.email]: "abgemeldet",
      "info@minimi-kanzlei.de": "sperrliste",
      "x@blockiert.example": "blocklist",
    });
  });

  it("Nachhol-Lauf: Vorschau schreibt nichts, Anwenden sperrt, zweiter Lauf ändert nichts", async () => {
    const alt = new Date("2026-10-01T09:00:00Z");
    const aus = await makeContact();
    const ds = await makeContact();
    const umentschieden = await makeContact();
    const nichts = await makeContact();
    const camp = await prisma.salesCampaign.upsert({ where: { name: campaign }, create: { name: campaign }, update: {} });
    const abgemeldet = await makeContact();
    await prisma.salesCampaignLead.create({ data: { contactId: abgemeldet.id, campaignId: camp.id, unsubscribed: true } });
    const mail = (contactId: string, text: string, sentAt = alt, sentiment = "NEGATIV") =>
      prisma.salesEmail.create({ data: { contactId, direction: "IN", subject: "AW: Neue Kunden", text, sentiment, sentAt, campaign } });
    await mail(aus.id, "Bitte entfernen Sie mich aus Ihrem Verteiler.");
    await mail(ds.id, "Woher haben Sie meine Daten?");
    await mail(umentschieden.id, "Bitte austragen.");
    await mail(umentschieden.id, "Ich habe es mir überlegt, rufen Sie mich an.", new Date("2026-10-10T09:00:00Z"), "POSITIV");
    await mail(nichts.id, "Kein Interesse, danke.\n\nAm 30.09.2026 schrieb Ole:\n> Antworten Sie mit „abmelden“, wenn Sie keine weiteren E-Mails wünschen.");

    const vorschau = await sperrenAusAntworten({ anwenden: false });
    expect(vorschau.angewendet).toBe(false);
    expect(vorschau.neu.austragen).toBeGreaterThanOrEqual(2); // aus + abgemeldet
    expect(vorschau.neu.datenschutz).toBeGreaterThanOrEqual(1);
    expect(vorschau.uebersprungen).toBeGreaterThanOrEqual(1);
    expect(await prisma.salesContact.count({ where: { id: { in: [aus.id, ds.id, abgemeldet.id] }, nieKontaktierenAt: { not: null } } })).toBe(0);

    calls = [];
    const lauf = await sperrenAusAntworten({ anwenden: true });
    expect(lauf.angewendet).toBe(true);
    const stand = await prisma.salesContact.findMany({ where: { id: { in: [aus.id, ds.id, umentschieden.id, nichts.id, abgemeldet.id] } } });
    const grund = Object.fromEntries(stand.map((c) => [c.id, c.nieKontaktierenGrund]));
    expect(grund).toEqual({ [aus.id]: "austragen", [ds.id]: "datenschutz", [umentschieden.id]: null, [nichts.id]: null, [abgemeldet.id]: "austragen" });
    // Zeitpunkt der Antwort, nicht des Laufs
    expect(stand.find((c) => c.id === aus.id)!.nieKontaktierenAt!.toISOString()).toBe(alt.toISOString());
    expect(await prisma.salesTask.findMany({ where: { contactId: ds.id }, select: { title: true } })).toEqual([{ title: "Auskunft nach Art. 15 beantworten, Frist 01.11.2026" }]);
    // Instantly im selben Lauf gesperrt
    expect(stand.filter((c) => c.nieKontaktierenAt).every((c) => c.instantlyGesperrtAt)).toBe(true);
    expect(posts("/block-lists-entries").map((p) => p.body?.bl_value)).toEqual(expect.arrayContaining([aus.email, ds.email, abgemeldet.email]));

    // Idempotent: nichts Neues, keine zweite Aufgabe, keine weiteren Instantly-Aufrufe
    calls = [];
    const nochmal = await sperrenAusAntworten({ anwenden: true });
    expect(nochmal.neu).toEqual({ austragen: 0, widerspruch: 0, datenschutz: 0, bounce_hart: 0, manuell: 0 });
    expect(nochmal.aufgaben).toBe(0);
    expect(nochmal.schonGesperrt).toBeGreaterThanOrEqual(3);
    expect(await prisma.salesTask.count({ where: { contactId: ds.id } })).toBe(1);
    expect(posts("/block-lists-entries")).toHaveLength(0);

    // Diagnose: Zähler je Grund, ohne Adressen
    const z = await sperrZaehler();
    expect(z.jeGrund.austragen).toBeGreaterThanOrEqual(2);
    expect(z.jeGrund.datenschutz).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(z)).not.toContain("@");
  });
});
