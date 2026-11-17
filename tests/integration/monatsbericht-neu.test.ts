// Monatsbericht neu (Ole, 14.11.2026) gegen die Datenbank: Zahlen identisch mit /buyer/zahlen (gleiche
// Funktionen), Maßnahmen aus allen Quellen gesammelt, ohne Maßnahme zur Prüfung statt automatisch,
// Betreff bei Gewinn und Verlust, Abschnitte ohne Daten entfallen, Checker blockt erfundene Zahlen,
// Kollegen-Tipp aus. Die KI ist gemockt (tests/integration/bericht-llm).
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerMailOpts } from "@/lib/email";

const mail = vi.hoisted(() => ({ sent: [] as CustomerMailOpts[] }));
vi.mock("@/lib/email", async (orig) => {
  const real = await orig<typeof import("@/lib/email")>();
  return {
    ...real,
    sendCustomerMail: async (o: CustomerMailOpts) => {
      mail.sent.push(o);
      return { ok: true };
    },
  };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: async () => ({}) }));

import { prisma } from "@/lib/prisma";
import { collectMeasures, collectReportData, loadReportSettings, monthRangeInclusive, NO_MEASURE_REASON, runMonthlyReports, saveReportSettings, type ReportBody } from "@/lib/monatsbericht/server";
import { addManualMeasure } from "@/lib/optimierung/server";
import { computeKpis } from "@/lib/kpis";
import { ertragForRange, loadErtragData, summarizeBestand } from "@/lib/ertrag";
import { resolveRange } from "@/lib/date-ranges";
import { customerMailHtml } from "@/lib/email";
import { SECTION_TITLES } from "@/lib/monatsbericht/bericht";
import { DEFAULT_INTRO, fakeLlm, writerData } from "./bericht-llm";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const MONTH = "2026-10";
const NOW = new Date("2026-11-02T08:00:00Z");
const oct = (day: number, h = 10) => new Date(Date.UTC(2026, 9, day, h));
const POOL = `Testpool Bericht ${Math.random().toString(36).slice(2, 8)}`;

/**
 * Kunde mit 95 bezahlten Leads im Oktober (davon 4 Abschlüsse Privatschutz à 600 € Beitrag), 12 Terminen,
 * Werbeausgaben an 25 Tagen, 10 Leads im September; optional Empfehlung/Bestandskampagne und Lead-Kosten.
 */
async function setupCustomer(o: { extras?: boolean; leadCost?: number } = {}) {
  const c = await makeCustomer({ plan: "software" });
  await makeBuyer(c.id, "owner");
  await prisma.customerAdSpend.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ customerId: c.id, accountId: "act_test", date: oct(i + 2, 12), amount: 24 })) });
  await prisma.lead.createMany({
    data: Array.from({ length: 95 }, (_, i) => ({
      customerId: c.id,
      name: `L${i}`,
      source: "Allianz Privatschutz",
      status: i < 4 ? "Abschluss" : i % 2 ? "Termin" : "Nicht erreicht",
      reached: i < 4 || i % 2 === 1,
      closeValue: i < 4 ? 600 : null,
      closedAt: i < 4 ? oct(20) : null,
      createdAt: oct(3 + (i % 20)),
    })),
  });
  await prisma.lead.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ customerId: c.id, name: `S${i}`, source: "Allianz Privatschutz", status: "Nicht erreicht", createdAt: new Date(Date.UTC(2026, 8, 5 + i, 10)) })) });
  await prisma.appointment.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ customerId: c.id, mode: "phone", startsAt: oct(5 + i, 9), status: "completed" })) });
  if (o.extras) {
    await prisma.lead.create({ data: { customerId: c.id, name: "Empfohlen", source: "Empfehlung", status: "Abschluss", reached: true, closeValue: 600, closedAt: oct(22), createdAt: oct(12) } });
    await prisma.lead.create({ data: { customerId: c.id, name: "Bestand", source: "Bestandskunde", status: "Abschluss", reached: true, closeValue: 600, closedAt: oct(23), createdAt: oct(14) } });
    await prisma.lead.create({ data: { customerId: c.id, name: "Bestand offen", source: "Bestandskunde", status: "In Beratung", createdAt: oct(15) } });
    // Verlustgründe (lib/verlustgruende.ts): im Oktober verloren, angelegt im August (zählt nicht im Trichter)
    const verloren = [...Array(3).fill("passt_nicht"), ...Array(2).fill("schon_versichert"), "kein_interesse"];
    await prisma.lead.createMany({
      data: verloren.map((r, i) => ({ customerId: c.id, name: `V${i}`, source: "Allianz Privatschutz", status: "Kein Interesse", lostReason: r, lostAt: oct(10 + i), reached: true, createdAt: new Date(Date.UTC(2026, 7, 5 + i, 10)) })),
    });
  }
  if (o.leadCost) await prisma.revenue.create({ data: { customerId: c.id, amount: o.leadCost, occurredAt: oct(10) } });
  return c.id;
}

const addMeasure = (customerId: string, title = "Zwei neue Motive für die Katzenkampagne") =>
  addManualMeasure({ customerId, topic: "anzeigen", title, executedAt: oct(15) }, { email: "ole@test.local" }, NOW);

describe("Monatsbericht neu", () => {
  const ids: string[] = [];
  beforeAll(async () => {
    requireTestDb();
    process.env.RESEND_API_KEY = "test";
    process.env.APP_URL ??= "https://app.test";
  });
  beforeEach(async () => {
    mail.sent = [];
    await saveReportSettings({ targetCpl: 6, autoSendGood: true, bookingUrl: "https://cal.test/ole" });
  });
  afterAll(async () => {
    await prisma.mediaBuyerAction.deleteMany({ where: { poolLabel: POOL } });
    await prisma.metaAdActivity.deleteMany({ where: { customerId: { in: ids } } });
    for (const id of ids) {
      const name = (await prisma.customer.findUnique({ where: { id } }))?.name;
      if (name) await prisma.salesTask.deleteMany({ where: { title: { contains: name } } });
      await cleanupCustomer(id);
    }
    await prisma.reportSettings.deleteMany({});
  });

  it("Zahlen identisch mit /buyer/zahlen (gleiche Funktionen, Monat = Filter „Letzter Monat“)", async () => {
    const id = await setupCustomer({ extras: true, leadCost: 450 });
    ids.push(id);
    const d = await collectReportData(id, MONTH, await loadReportSettings(), NOW);

    // So rechnet /buyer/zahlen mit range=lastMonth (Seite: BuyerDashboardBody)
    const range = resolveRange("lastMonth", NOW);
    expect(monthRangeInclusive(MONTH)).toEqual(range);
    const k = await computeKpis({ range, customerId: id, product: null, origin: "paid" });
    const data = await loadErtragData(id);
    const cur = await ertragForRange(id, data, range, NOW, Number(k.revenue));
    const bestand = summarizeBestand(data.contracts, data.rates, data.typ, NOW);

    expect(d.funnel!.steps.map((s) => s.value)).toEqual([k.nettoLeads, k.reachedLeads, k.terminLeads, k.closedLeads]);
    expect(d.funnel!.steps.map((s) => s.rate)).toEqual([null, k.reachabilityRate, k.terminRate, k.closingRate]);
    expect(d.funnel!.steps[0].previous).toBe(10);
    expect(d.closings).toBe(cur.provision.leads);
    const line = (key: string) => d.result!.lines.find((l) => l.key === key)?.amount;
    expect(line("paid")).toBe(cur.provision.byOrigin.paid.amount);
    expect(line("empfehlung")).toBe(cur.provision.byOrigin.empfehlung.amount);
    expect(line("bestand")).toBe(cur.provision.byOrigin.bestand.amount);
    expect(line("leadkosten")).toBe(cur.leadCosts);
    expect(line("leadkosten")).toBe(450);
    expect(line("betreuung")).toBe(cur.agency.total);
    expect(d.result!.gewinn).toBe(cur.gewinn);
    expect(d.bestand?.perYear ?? 0).toBe(bestand.perYear);
    // Empfehlungen und Bestandskampagnen über die Herkunft aus lib/lead-herkunft
    expect(d.empfehlungen).toMatchObject({ empfehlungen: 1, abschluesse: 1, provision: cur.provision.byOrigin.empfehlung.amount });
    expect(d.bestandskampagnen).toEqual({ leads: 2, abschluesse: 1, provision: cur.provision.byOrigin.bestand.amount });
    // nur bezahlte Leads im Trichter
    expect(d.funnel!.steps[0].value).toBe(95);
    // Kollegen-Tipp ist aus
    expect(d.tips.length).toBeLessThanOrEqual(2);
    expect(d.tips.some((t) => t.key === "kollegen")).toBe(false);
  });

  it("Maßnahmen aus allen Quellen: Optimierung, von Hand, Meta-Protokoll, Media Buyer, Kampagne, Budget", async () => {
    const id = await setupCustomer();
    ids.push(id);
    await addMeasure(id, "Umkreis der Zielgruppe angepasst");
    await prisma.leadSubscription.create({ data: { customerId: id, productKey: POOL, price: 30 } });
    await prisma.mediaBuyerAction.createMany({
      data: [
        { poolKey: `product:${POOL}`, poolLabel: POOL, action: "increase", reason: "unter Ziel", leadsMtd: 10, leadsGoal: 30, projected: 20, daysElapsed: 10, daysTotal: 31, createdAt: oct(10) },
        { poolKey: `product:${POOL}`, poolLabel: POOL, action: "decrease", reason: "nur simuliert", leadsMtd: 10, leadsGoal: 30, projected: 20, daysElapsed: 10, daysTotal: 31, dryRun: true, createdAt: oct(11) },
        { poolKey: `product:${POOL}`, poolLabel: POOL, action: "none", reason: "alles ok", leadsMtd: 10, leadsGoal: 30, projected: 30, daysElapsed: 12, daysTotal: 31, createdAt: oct(12) },
      ],
    });
    await prisma.metaAdActivity.createMany({
      data: [
        { adAccountId: "act_test", customerId: id, eventTime: oct(8), eventType: "create_ad", dedupeKey: `${id}|1` },
        { adAccountId: "act_test", customerId: id, eventTime: oct(9), eventType: "create_ad", dedupeKey: `${id}|2` },
        { adAccountId: "act_test", customerId: id, eventTime: oct(9), eventType: "update_ad_friendly_name", dedupeKey: `${id}|3` },
      ],
    });
    await prisma.campaignRun.create({ data: { customerId: id, product: "Katze", status: "built", steps: [], kind: "auffrischung" } });
    await prisma.campaignRun.updateMany({ where: { customerId: id }, data: { updatedAt: oct(18) } });
    await prisma.budgetChange.createMany({
      data: [
        { customerId: id, changes: [], effectiveFrom: oct(1), monthlyBudgetFrom: 600, monthlyBudgetTo: 900, status: "applied" },
        { customerId: id, changes: [], effectiveFrom: oct(2), monthlyBudgetFrom: 900, monthlyBudgetTo: 1500, status: "pending" },
      ],
    });
    const raw = await collectMeasures(id, MONTH);
    const bySource = (s: string) => raw.filter((r) => r.source === s).map((r) => r.text);
    expect(bySource("manuell")).toEqual(["Umkreis der Zielgruppe angepasst"]);
    expect(bySource("meta")).toEqual(["Werbekonto: Anzeige erstellt (mehrfach)"]);
    expect(bySource("mediabuyer")).toEqual([`Budget der Kampagne ${POOL} erhöht, damit genug Anfragen kommen`]);
    expect(bySource("kampagne")).toEqual(["Neue Anzeigenmotive für Katze in die laufende Kampagne gebracht"]);
    expect(bySource("budget")).toEqual(["Werbebudget erhöht"]);
    expect(raw.map((r) => r.at)).toEqual([...raw.map((r) => r.at)].sort());
    // November zählt nicht für Oktober
    expect(await collectMeasures(id, "2026-09")).toEqual([]);
  });

  it("ohne Maßnahme: kein Platzhalter, nicht automatisch senden, sondern zur Prüfung an Ole", async () => {
    const id = await setupCustomer();
    ids.push(id);
    const llm = fakeLlm();
    await runMonthlyReports(NOW, { month: MONTH, llm, customerIds: [id] });
    const r = await prisma.monthlyReport.findFirstOrThrow({ where: { customerId: id } });
    expect(r).toMatchObject({ rating: "gut", status: "draft" });
    expect(mail.sent).toHaveLength(0);
    expect(r.reasons).toContain(NO_MEASURE_REASON);
    const writer = llm.mock.calls.map((c) => c[0]).find((q) => q.agent === "Berichtsschreiber")!;
    expect(writerData(writer).massnahmen_roh).toEqual([]);
    expect(writer.user).not.toMatch(/laufende Optimierung/);
    const body = r.body as unknown as ReportBody;
    expect(body.model!.measures).toEqual([]);
    // Abschnitte ohne Daten entfallen
    expect(body.model!.empfehlungen).toBeNull();
    expect(body.model!.bestandskampagnen).toBeNull();
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id } })).name;
    expect(await prisma.salesTask.count({ where: { title: `Monatsbericht prüfen: ${name} (gut): keine Maßnahme im Monat, bitte eintragen und prüfen` } })).toBe(1);
  });

  it("mit Maßnahme und Gewinn: automatisch gesendet, Betreff mit Ergebnis, alle Abschnitte in der Mail", async () => {
    const id = await setupCustomer({ extras: true });
    ids.push(id);
    await addMeasure(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(), customerIds: [id] });
    const r = await prisma.monthlyReport.findFirstOrThrow({ where: { customerId: id } });
    expect(r.status).toBe("sent");
    expect(mail.sent).toHaveLength(1);
    const m = mail.sent[0];
    expect(m.subject).toMatch(/^Ihr Oktober: 6 Abschlüsse und [\d.]+ € Gewinn$/);
    expect(m.paragraphs).toEqual([DEFAULT_INTRO]);
    for (const t of Object.values(SECTION_TITLES)) expect(m.html).toContain(t.replace("&", "&amp;"));
    expect(m.html).toContain("Zwei neue Motive für die Katzenkampagne");
    // Die zwei häufigsten Verlustgründe mit Tipp
    expect(m.html).toContain("Zu teuer oder passt nicht: 3 von 6 verlorenen Leads (50 %)");
    expect(m.html).toContain("Schon versichert: 2 von 6 verlorenen Leads (33 %)");
    expect(m.html).toContain("Tipp: Zeigen Sie im Termin mehrere Tarifstufen");
    expect(m.html).not.toContain("Kein Interesse: 1 von 6");
    expect(m.html).not.toContain("Gespräch vereinbaren"); // kein Gesprächs-Knopf (Ole, 14.11.2026)
    expect(m.html).toContain("/buyer/zahlen?range=custom&amp;from=2026-10-01&amp;to=2026-10-31");
    expect(m.textBlocks!.join("\n")).toContain("Alle Zahlen ansehen: ");
    const out = process.env.MONATSBERICHT_HTML;
    if (out) {
      const html = customerMailHtml(m);
      writeFileSync(out, `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${m.subject}</title></head><body style="margin:0;background:#ffffff">${html}</body></html>`);
    }
  });

  it("negativer Gewinn: Betreff nennt Abschlüsse bzw. Termine, nicht den Verlust", async () => {
    const id = await setupCustomer({ leadCost: 5000 });
    ids.push(id);
    await addMeasure(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(), customerIds: [id] });
    const r = await prisma.monthlyReport.findFirstOrThrow({ where: { customerId: id } });
    const body = r.body as unknown as ReportBody;
    expect(body.model!.result!.gewinn).toBeLessThan(0);
    expect(r.subject).toMatch(/^Ihr Oktober: 4 Abschlüsse und \d+ Termine$/);
    expect(r.subject).not.toMatch(/Gewinn|Verlust|−|-/);
  });

  it("Checker lässt keine erfundenen Zahlen durch: Entwurf statt Versand", async () => {
    const id = await setupCustomer();
    ids.push(id);
    await addMeasure(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm("Im Oktober hatten Sie 4711 Leads und damit so viele wie nie. Wir bleiben für Sie dran."), customerIds: [id] });
    const r = await prisma.monthlyReport.findFirstOrThrow({ where: { customerId: id } });
    const check = r.check as { ok: boolean; issues: string[] };
    expect(check.ok).toBe(false);
    expect(check.issues.join()).toMatch(/4711/);
    expect(r.status).toBe("draft");
    expect(mail.sent).toHaveLength(0);
  });
});
