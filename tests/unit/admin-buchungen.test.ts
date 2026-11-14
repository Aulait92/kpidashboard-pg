// Admin → Zahlen → Buchungen (lib/admin-buchungen.ts): Zeilen aus jeder Quelle, keine Doppelungen,
// Summen, Filter und CSV. Reine Funktionen, ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  AUDIT_COVERED_BY_TABLES,
  buchungenCsv,
  buildBuchungen,
  filterBuchungen,
  sumBuchungen,
  type BuchungSources,
  type SrcAudit,
  type SrcCustomer,
  type SrcOffer,
} from "@/lib/admin-buchungen";

const NOW = new Date("2026-11-14T12:00:00Z");
const at = (iso: string) => new Date(iso);

const customer = (o: Partial<SrcCustomer> = {}): SrcCustomer => ({
  id: "c1",
  name: "Agentur Muster",
  contactId: "k1",
  retainerMonthly: 1400,
  retainerEnd: null,
  seatMonthly: 49,
  seatsBilled: 0,
  bestandMonthly: null,
  empfehlungMonthly: null,
  bestandRequestedAt: null,
  existingCustomersEnabled: false,
  bestandFreeUntil: null,
  ...o,
});

const offer = (o: Partial<SrcOffer> = {}): SrcOffer => ({
  id: "o1",
  number: "PG-2026-0001",
  customerId: "c1",
  company: "Agentur Muster",
  contactName: "Max Muster",
  salesContactId: "k1",
  acceptedAt: at("2026-11-03T10:00:00Z"),
  startDate: at("2026-12-01T00:00:00Z"),
  term: "12m",
  products: [{ name: "Sterbegeld", dailyBudget: 30 }],
  setupFee: 490,
  setupListFee: 990,
  setupDiscount: 500,
  setupDiscountLabel: "Empfehlungsrabatt (empfohlen von Erika)",
  monthlyFee: 1400,
  introMonthlyFee: null,
  introMonths: null,
  seats: 4,
  seatsIncluded: 3,
  seatMonthly: 49,
  bestandMonthly: 149,
  empfehlungMonthly: null,
  annualPrepay: false,
  annualFreeMonths: null,
  subscriptionStatus: "active",
  updatedAt: at("2026-11-03T10:00:00Z"),
  canceledAt: null,
  ...o,
});

const audit = (id: string, action: string, iso: string, details: Record<string, unknown> = {}, o: Partial<SrcAudit> = {}): SrcAudit => ({
  id,
  at: at(iso),
  action,
  customerId: "c1",
  actorRole: "ADMIN",
  details,
  ...o,
});

const empty = (): BuchungSources => ({ customers: [customer()], offers: [], productBookings: [], budgetChanges: [], pauses: [], packs: [], referrals: [], audits: [], tasks: [] });

/** Eine Zeile je Quelle (plus die Protokoll-Dubletten, die nicht als Zeile erscheinen dürfen). */
function fullSources(): BuchungSources {
  const s = empty();
  s.customers.push(customer({ id: "c2", name: "Büro Beispiel", contactId: "k2", bestandMonthly: 149, existingCustomersEnabled: true }));
  s.offers.push(offer());
  s.productBookings.push({
    id: "pb1",
    customerId: "c1",
    catalogKey: "tkv",
    product: "Katzenversicherung (TKV)",
    dailyBudget: 20,
    startWish: null,
    status: "live",
    feeFrom: 1000,
    feeTo: 1350,
    setupFee: 0,
    setupStatus: "none",
    pricing: "list",
    startedAt: at("2026-11-06T09:00:00Z"),
    endRequestedAt: null,
    createdAt: at("2026-11-05T09:00:00Z"),
    updatedAt: at("2026-11-06T09:00:00Z"),
  });
  s.budgetChanges.push({
    id: "bc1",
    customerId: "c1",
    changes: [{ product: "Sterbegeld", from: 30, to: 70 }],
    effectiveFrom: at("2026-11-07T00:00:00Z"),
    monthlyBudgetFrom: 900,
    monthlyBudgetTo: 2100,
    feeFrom: 1000,
    feeTo: 1000,
    status: "applied",
    decidedAt: at("2026-11-07T08:00:00Z"),
    feeAppliedAt: null,
    createdAt: at("2026-11-07T08:00:00Z"),
  });
  s.budgetChanges.push({
    id: "bc2",
    customerId: "c2",
    changes: [{ product: "Wechsel", from: 100, to: 400 }],
    effectiveFrom: at("2026-11-08T00:00:00Z"),
    monthlyBudgetFrom: 3000,
    monthlyBudgetTo: 12000,
    feeFrom: 1400,
    feeTo: null,
    status: "pending",
    decidedAt: null,
    feeAppliedAt: null,
    createdAt: at("2026-11-08T08:00:00Z"),
  });
  s.pauses.push({
    id: "p1",
    customerId: "c2",
    startsAt: at("2026-11-02T00:00:00Z"),
    endsAt: at("2026-11-09T00:00:00Z"),
    status: "ended",
    kind: "customer",
    createdBy: "customer",
    resumedAt: at("2026-11-09T06:00:00Z"),
    createdAt: at("2026-11-01T10:00:00Z"),
  });
  s.packs.push({ id: "pk1", customerId: "c2", messages: 500, amount: 99, purchasedAt: at("2026-11-10T10:00:00Z"), expiresAt: at("2027-02-10T10:00:00Z"), source: "kauf", stripeStatus: "added" });
  s.referrals.push({
    id: "r1",
    referrerId: "c2",
    name: "Erika",
    company: "Erika GmbH",
    rewardStatus: "credited",
    rewardAmount: 447,
    rewardNote: null,
    rewardedAt: at("2026-11-11T10:00:00Z"),
    wonAt: at("2026-11-03T10:00:00Z"),
    updatedAt: at("2026-11-11T10:00:00Z"),
  });
  s.audits.push(
    // Plätze: ein weiterer Verkäufer
    audit("a-seat", "billing.seats", "2026-11-12T10:00:00Z", { from: 0, to: 1, logins: 4, active: 4, price: 49 }),
    // Modul gebucht (Kunde c2 hat es schon; hier c1)
    audit("a-mod", "billing.bestand", "2026-11-12T11:00:00Z", { mode: "book", price: 149, from: null }),
    // Produkt-Anfrage außerhalb des Katalogs
    audit("a-anfrage", "produkt.anfrage", "2026-11-12T12:00:00Z", { wish: "Hundehaftpflicht für Züchter" }),
    // Dubletten zu Tabellenzeilen: dürfen NICHT als Zeile erscheinen
    audit("d-offer", "offer.accept", "2026-11-03T10:00:00Z", { number: "PG-2026-0001" }, { customerId: null }),
    audit("d-book", "produkt.book", "2026-11-05T09:00:00Z"),
    audit("d-budget", "budget.change", "2026-11-07T08:00:00Z"),
    audit("d-budget-req", "budget.request", "2026-11-08T08:00:00Z", {}, { customerId: "c2" }),
    audit("d-pause", "pause.plan", "2026-11-01T10:00:00Z", {}, { customerId: "c2" }),
    audit("d-pause-end", "pause.end", "2026-11-09T06:00:00Z", {}, { customerId: "c2" }),
    audit("d-pack", "bestand.paket", "2026-11-10T10:00:00Z", {}, { customerId: "c2" }),
    audit("d-reward", "referral.reward", "2026-11-11T10:00:00Z", { outcome: "credited", amount: 447 }, { customerId: "c2" }),
    // Preisänderung aus Budgetänderung/Produktstart: steht schon in der Tabelle
    audit("d-fee", "billing.retainer", "2026-11-06T09:00:00Z", { source: "budget", monthlyTotal: 1350 }),
  );
  s.tasks.push(
    { id: "t-anfrage", contactId: "k1", title: "Produkt-Anfrage Agentur Muster: Hundehaftpflicht für Züchter", createdAt: at("2026-11-12T12:00:01Z"), doneAt: null },
    { id: "t-budget", contactId: "k2", title: "Budget-Anfrage Büro Beispiel: 12.000 €/Monat, individuelles Angebot", createdAt: at("2026-11-08T08:00:01Z"), doneAt: null },
    // gehört zu keiner Buchung (anderer Zeitraum)
    { id: "t-alt", contactId: "k1", title: "Produkt-Anfrage Agentur Muster: Alt", createdAt: at("2026-09-01T10:00:00Z"), doneAt: null },
  );
  return s;
}

describe("Buchungen: Zeilen aus jeder Quelle", () => {
  const rows = buildBuchungen(fullSources(), NOW);
  const byId = (id: string) => rows.find((r) => r.id === id)!;

  it("Angebot mit Einrichtung zum Listenpreis und Empfehlungsrabatt als eigene Zeile", () => {
    const o = byId("offer:o1");
    expect(o.art).toBe("angebot");
    expect(o.oneOff).toBe(990);
    // 1.400 Paket + 1 weiterer Platz à 49 + Bestandskunden-Modul 149
    expect(o.monthly).toBe(1598);
    expect(o.status).toBe("geplant");
    expect(o.statusFrom?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    const rabatt = byId("offer-rabatt:o1");
    expect(rabatt.art).toBe("rabatt");
    expect(rabatt.oneOff).toBe(-500);
    expect(rabatt.title).toContain("Empfehlungsrabatt");
    // zusammen = gezahlte Einrichtung
    expect((o.oneOff ?? 0) + (rabatt.oneOff ?? 0)).toBe(490);
  });

  it("Produkt, Budget, Pause, Paket, Prämie, Plätze, Modul, Anfrage", () => {
    expect(byId("productBooking:pb1")).toMatchObject({ art: "produkt", monthly: 350, status: "aktiv", href: "/admin/kunden/c1/abrechnung" });
    expect(byId("budgetChange:bc1")).toMatchObject({ art: "budget", monthly: 0, status: "aktiv" });
    expect(byId("budgetChange:bc2")).toMatchObject({ art: "budget", monthly: null, status: "angefragt" });
    expect(byId("pause:p1")).toMatchObject({ art: "pause", status: "beendet" });
    expect(byId("pauseEnde:p1")).toMatchObject({ art: "pause", title: "Pausenende", status: "beendet" });
    expect(byId("pack:pk1")).toMatchObject({ art: "paket", oneOff: 99, status: "aktiv" });
    expect(byId("referral:r1")).toMatchObject({ art: "rabatt", oneOff: -447, customerId: "c2", title: "Kollegen-Prämie gutgeschrieben" });
    expect(byId("audit:a-seat")).toMatchObject({ art: "plaetze", monthly: 49, title: "1 weiterer Verkäufer-Platz" });
    expect(byId("audit:a-mod")).toMatchObject({ art: "modul", monthly: 149, title: "Bestandskunden-Modul gebucht" });
    expect(byId("audit:a-anfrage")).toMatchObject({ art: "produkt_anfrage", status: "angefragt", detail: "Hundehaftpflicht für Züchter" });
  });

  it("offene Aufgabe: passende Vertriebsaufgabe mit Link zum Kontakt", () => {
    expect(byId("audit:a-anfrage").task).toEqual({ open: true, title: "Produkt-Anfrage Agentur Muster: Hundehaftpflicht für Züchter", href: "/admin/vertrieb/kontakte/k1" });
    expect(byId("budgetChange:bc2").task?.open).toBe(true);
    expect(byId("productBooking:pb1").task).toBeNull();
  });

  it("erledigte Aufgabe beendet die Anfrage", () => {
    const s = fullSources();
    s.tasks[0] = { ...s.tasks[0], doneAt: at("2026-11-13T10:00:00Z") };
    const r = buildBuchungen(s, NOW).find((x) => x.id === "audit:a-anfrage")!;
    expect(r.task?.open).toBe(false);
    expect(r.status).toBe("beendet");
  });
});

describe("Buchungen: keine Doppelungen", () => {
  it("jede Zeile genau einmal, Protokoll-Dubletten zu Tabellen erscheinen nicht", () => {
    const rows = buildBuchungen(fullSources(), NOW);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows.filter((r) => r.id.startsWith("audit:d-"))).toEqual([]);
    // Ein Ereignis nie zugleich aus Protokoll und Tabelle: kein Protokoll-Eintrag mit Tabellen-Aktion
    expect(rows.filter((r) => r.source === "audit").map((r) => r.sourceId).sort()).toEqual(["a-anfrage", "a-mod", "a-seat"]);
    expect(AUDIT_COVERED_BY_TABLES).toContain("budget.change");
    // Angebot + Rabatt, Produkt, 2 × Budget, Pause + Pausenende, Paket, Prämie, Platz, Modul, Anfrage
    expect(rows).toHaveLength(12);
  });

  it("Protokoll gelöschter Kunden erscheint nicht", () => {
    const s = empty();
    s.audits.push(audit("weg", "billing.seats", "2026-11-12T10:00:00Z", { from: 0, to: 1, price: 49 }, { customerId: "geloescht" }));
    expect(buildBuchungen(s, NOW)).toEqual([]);
  });

  it("Kündigung des Empfehlungs-Moduls: billing.empfehlung + empfehlung.cancel = eine Zeile; Ablauf ohne neue Zeile", () => {
    const s = empty();
    s.audits.push(
      audit("e1", "empfehlung.book", "2026-10-01T10:00:00Z", { mode: "paid", price: 59 }),
      audit("e2", "billing.empfehlung", "2026-10-20T10:00:00Z", { mode: "cancel_at_period_end", until: "2026-10-31T23:00:00.000Z", price: 59 }),
      audit("e3", "empfehlung.cancel", "2026-10-20T10:00:01Z", { until: "2026-10-31T23:00:00.000Z" }),
      audit("e4", "billing.empfehlung", "2026-11-01T01:00:00Z", { mode: "expired" }),
    );
    const rows = buildBuchungen(s, NOW);
    expect(rows.map((r) => [r.id, r.monthly, r.status])).toEqual([
      ["audit:e2", -59, "beendet"],
      ["audit:e1", 59, "aktiv"],
    ]);
  });

  it("zurückgenommene Kündigung zählt nicht und erzeugt keine zweite Buchung", () => {
    const s = empty();
    s.audits.push(
      audit("b1", "billing.bestand", "2026-11-02T10:00:00Z", { mode: "cancel_at_period_end", until: "2026-11-30T23:00:00.000Z", price: 149 }),
      audit("b2", "billing.bestand", "2026-11-05T10:00:00Z", { mode: "book", price: 149, from: 149 }),
    );
    const rows = buildBuchungen(s, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "audit:b1", status: "zurueckgenommen", monthly: -149 });
    expect(sumBuchungen(rows).monthly).toBe(0);
  });

  it("Plätze: Konditionsänderung und anschließender Abgleich = eine Zeile", () => {
    const s = empty();
    s.customers[0].seatsBilled = 2;
    s.audits.push(
      audit("s0", "billing.seats", "2026-11-01T10:00:00Z", { from: 0, to: 2, price: 49 }),
      audit("s1", "billing.seats", "2026-11-10T10:00:00Z", { seatsIncluded: { from: 3, to: 2 }, seatMonthly: { from: 49, to: 39 } }),
      audit("s2", "billing.seats", "2026-11-10T10:00:05Z", { from: 2, to: 3, logins: 5, active: 5, price: 39 }),
    );
    const rows = buildBuchungen(s, NOW);
    expect(rows.map((r) => r.id)).toEqual(["audit:s1", "audit:s0"]);
    // 2 berechnete Plätze × (39 − 49) + 1 weiterer × 39
    expect(rows[0].monthly).toBe(19);
    expect(rows[1].monthly).toBe(98);
  });

  it("Stripe-Abo-Ende und Vertragsende von Hand = eine Kündigung", () => {
    const s = empty();
    s.customers[0].retainerEnd = at("2026-11-30T12:00:00Z");
    s.offers.push(offer({ setupListFee: null, setupDiscount: null, subscriptionStatus: "canceled", canceledAt: at("2026-11-30T23:10:00Z"), startDate: null }));
    s.audits.push(audit("k1", "billing.retainer", "2026-11-04T10:00:00Z", { monthly: { from: 1400, to: 1400 }, start: { from: "2026-01-01", to: "2026-01-01" }, end: { from: null, to: "2026-11-30" } }));
    const rows = buildBuchungen(s, NOW);
    const k = rows.filter((r) => r.art === "kuendigung");
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ id: "audit:k1", monthly: -1400, status: "geplant" });
    expect(k[0].detail).toContain("Abo bei Stripe beendet");
    expect(rows.find((r) => r.id === "offer:o1")?.status).toBe("beendet");
    // keine Preis-Zeile, weil der Monatsbetrag gleich blieb
    expect(rows.some((r) => r.art === "preis")).toBe(false);
  });

  it("Modul per Empfehlungsprämie: Modulzeile (gratis) und Gutschrift, nicht doppelt", () => {
    const s = empty();
    s.customers[0].bestandFreeUntil = at("2027-02-11T10:00:00Z");
    s.referrals.push({ id: "r9", referrerId: "c1", name: null, company: "Neu GmbH", rewardStatus: "credited", rewardAmount: 447, rewardNote: "Modul gratis bis 11.02.2027", rewardedAt: at("2026-11-11T10:00:05Z"), wonAt: null, updatedAt: at("2026-11-11T10:00:05Z") });
    s.audits.push(audit("m1", "billing.bestand", "2026-11-11T10:00:01Z", { mode: "book", price: 149, from: null }, { actorRole: "system" }));
    const rows = buildBuchungen(s, NOW);
    expect(rows.map((r) => r.id).sort()).toEqual(["audit:m1", "referral:r9"]);
    const m = rows.find((r) => r.id === "audit:m1")!;
    expect(m.title).toContain("Empfehlungsprämie");
    expect(m.detail).toContain("gratis bis 11.02.2027");
  });
});

describe("Buchungen: Summen", () => {
  it("zählt aktive, geplante und beendete Zeilen; Anfragen nur als offen", () => {
    const rows = buildBuchungen(fullSources(), NOW);
    const sums = sumBuchungen(rows);
    // monatlich: Angebot 1.598 + Produkt 350 + Budget 0 + Platz 49 + Modul 149
    expect(sums.monthly).toBe(2146);
    // einmalig: Einrichtung 990 − Rabatt 500 + Paket 99 − Prämie 447
    expect(sums.oneOff).toBe(142);
    // offen: Budget-Anfrage, Produkt-Anfrage
    expect(sums.open).toBe(2);
    expect(sums.count).toBe(rows.length);
  });

  it("abgelehnte Buchung zählt nicht", () => {
    const s = fullSources();
    s.productBookings[0] = { ...s.productBookings[0], status: "rejected", setupFee: 990, setupStatus: "removed" };
    const sums = sumBuchungen(buildBuchungen(s, NOW));
    expect(sums.monthly).toBe(2146 - 350);
  });
});

describe("Buchungen: Filter", () => {
  const rows = buildBuchungen(fullSources(), NOW);
  const old = buildBuchungen({ ...empty(), packs: [{ id: "alt", customerId: "c1", messages: 500, amount: 99, purchasedAt: at("2026-10-31T22:30:00Z"), expiresAt: at("2027-01-31T10:00:00Z"), source: "kauf", stripeStatus: "added" }] }, NOW);

  it("Standard: dieser Monat in Berliner Zeit (31.10. 23:30 Berlin gehört zum Oktober)", () => {
    expect(filterBuchungen([...rows, ...old], {}, NOW)).toHaveLength(rows.length);
    expect(filterBuchungen(old, { monat: "2026-10" }, NOW)).toHaveLength(1);
    expect(filterBuchungen(old, { monat: "alle" }, NOW)).toHaveLength(1);
    expect(filterBuchungen(rows, { von: "2026-11-10", bis: "2026-11-11" }, NOW).map((r) => r.id).sort()).toEqual(["pack:pk1", "referral:r1"]);
  });

  it("Art, Status, offen, Kunde und Suche", () => {
    expect(filterBuchungen(rows, { art: "pause" }, NOW)).toHaveLength(2);
    expect(filterBuchungen(rows, { status: "angefragt" }, NOW).map((r) => r.id).sort()).toEqual(["audit:a-anfrage", "budgetChange:bc2"]);
    expect(filterBuchungen(rows, { status: "offen" }, NOW)).toHaveLength(2);
    expect(filterBuchungen(rows, { kunde: "c2" }, NOW).every((r) => r.customerId === "c2")).toBe(true);
    expect(filterBuchungen(rows, { q: "hundehaft" }, NOW).map((r) => r.id)).toEqual(["audit:a-anfrage"]);
  });
});

describe("Buchungen: CSV", () => {
  it("Semikolon, BOM, Komma-Dezimalen, Status und Link", () => {
    const rows = buildBuchungen(fullSources(), NOW).filter((r) => ["offer-rabatt:o1", "audit:a-anfrage"].includes(r.id));
    const csv = buchungenCsv(rows, "https://app.example");
    expect(csv.startsWith("﻿Datum;Kunde;Art;Vorgang;Details;Einmalig netto;Monatlich netto (Änderung);Status;Offene Aufgabe;Aufgabe;Kundenakte")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.includes("Rabatt"))).toContain(";-500,00;");
    const anfrage = lines.find((l) => l.includes("Hundehaftpflicht"))!;
    expect(anfrage).toContain(";angefragt;ja;");
    expect(anfrage.endsWith(";https://app.example/admin/kunden/c1/abrechnung")).toBe(true);
  });

  it("maskiert Semikolon und Anführungszeichen", () => {
    const [r] = buildBuchungen({ ...empty(), audits: [audit("x", "produkt.anfrage", "2026-11-12T12:00:00Z", { wish: 'Hund; "Katze"' })] }, NOW);
    expect(buchungenCsv([r])).toContain('"Hund; ""Katze"""');
  });
});
