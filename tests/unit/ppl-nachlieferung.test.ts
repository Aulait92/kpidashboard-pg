// Nachlieferung statt Gutschrift und Erstattung bei Leadbestellungen (Ole, 24.11.2026: „wir liefern Leads immer nach und
// erstatten nichts“; „Die Garantien etc. können aus Leadangeboten raus“).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  lead: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  revenue: { findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(async (x: unknown) => (Array.isArray(x) ? Promise.all(x) : x)),
}));
const redistributeParked = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({})) }));
vi.mock("@/lib/ppl/engine", () => ({ redistributeParked }));

import { planNachlieferung } from "@/lib/ppl/nachlieferung";
import { requestStorno } from "@/lib/ppl/storno";
import { AGB, AGB_NUR_LEADS, agbFuerAngebot, agbLinkFuerAngebot, agbPplSoftware, PPL_KUNDENKONTO_BEDINGUNGEN, PPL_NUR_LEADS_BEDINGUNGEN_ALT, type LegalSection } from "@/lib/legal-texts";
import { PPL_NACHLIEFERUNG, PPL_REKLAMATION, PPL_REKLAMATION_ALT } from "@/lib/vertrag-laufzeit";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const text = (secs: LegalSection[]) => secs.flatMap((s) => [s.title, ...s.items.map((i) => (typeof i === "string" ? i : `${i.sub} ${i.text}`))]).join(" ");
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("planNachlieferung", () => {
  it("offene Ersatzleads zuerst, ohne Bestellung", () => {
    const p = planNachlieferung([{ id: "o1", periodStart: d("2026-11-23"), quantity: 10, delivered: 4 }], ["l1", "l2"]);
    expect(p).toEqual({ offen: 8, ersatzOffen: 2, ersatzFuerId: "l1", orderId: null });
  });

  it("danach die älteste Bestellung mit Rest (Vorwoche vor laufender Woche)", () => {
    const p = planNachlieferung(
      [
        { id: "neu", periodStart: d("2026-11-23"), quantity: 10, delivered: 0 },
        { id: "alt", periodStart: d("2026-11-16"), quantity: 10, delivered: 7 },
        { id: "voll", periodStart: d("2026-11-09"), quantity: 5, delivered: 5 },
      ],
      [],
    );
    expect(p).toEqual({ offen: 13, ersatzOffen: 0, ersatzFuerId: null, orderId: "alt" });
  });

  it("nichts offen", () => {
    expect(planNachlieferung([{ id: "o", periodStart: d("2026-11-23"), quantity: 5, delivered: 5 }], [])).toEqual({ offen: 0, ersatzOffen: 0, ersatzFuerId: null, orderId: null });
  });
});

describe("requestStorno", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const lead = (stornoErsatz: boolean) => ({
    id: "lead1", customerId: "c1", name: "X", deliveredAt: new Date("2026-11-23T12:00:00Z"), stornoState: null, source: "PKV", status: "Neuer Lead",
    subscription: { id: "s1", label: null, productKey: "PKV", stornoDays: 7, stornoReasons: ["falsche Nummer"], stornoAutoApprove: false, stornoErsatz },
    revenues: [{ id: "r1", amount: 50 }],
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.lead.count.mockResolvedValue(20);
    db.revenue.findFirst.mockResolvedValue({ id: "r1", amount: 50 });
    db.lead.update.mockResolvedValue({});
    db.revenue.update.mockResolvedValue({});
  });

  it("Nachlieferung: Ersatzlead geschuldet, keine Gutschrift, Umsatz bleibt, Verteilung angestoßen", async () => {
    db.lead.findUnique.mockResolvedValue(lead(true));
    const r = await requestStorno("lead1", "falsche Nummer", "", { role: "BUYER" }, now);
    expect(r).toEqual({ ok: true, state: "approved", ersatz: true });
    const daten = db.lead.update.mock.calls.map((c) => c[0].data);
    expect(daten.some((x) => x.ersatzGeschuldet === true && x.status === "Storno")).toBe(true);
    expect(daten.some((x) => Number(x.creditAmount) > 0)).toBe(false);
    expect(db.revenue.update).not.toHaveBeenCalled();
    expect(redistributeParked).toHaveBeenCalledWith("PKV", now);
  });

  it("Grenzfall „Sonstiges“: auch ein ganzer Ersatzlead (kein 50:50)", async () => {
    db.lead.findUnique.mockResolvedValue(lead(true));
    const r = await requestStorno("lead1", "Sonstiges", "nie erreichbar gewesen", { role: "BUYER" }, now);
    expect(r).toEqual({ ok: true, state: "approved", ersatz: true });
    expect(db.revenue.update).not.toHaveBeenCalled();
  });

  it("alte Bedingungen (stornoErsatz aus): Gutschrift wie bisher", async () => {
    db.lead.findUnique.mockResolvedValue(lead(false));
    const r = await requestStorno("lead1", "falsche Nummer", "", { role: "BUYER" }, now);
    expect(r).toEqual({ ok: true, state: "approved", anteil: 1 });
    expect(db.lead.update.mock.calls.some((c) => Number(c[0].data.creditAmount) === 50)).toBe(true);
    expect(db.revenue.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { cancelled: true } });
  });
});

describe("Texte: Nachlieferung, keine Erstattung außer der engen Ausnahme", () => {
  it("Vertragszeilen: Ersatzlead und Nachlieferung, keine Gutschrift", () => {
    for (const t of [PPL_REKLAMATION, PPL_NACHLIEFERUNG]) {
      expect(t).not.toMatch(/gutgeschrieben|Gutschrift|erstatten sie/i);
      expect(hatGedankenstrich(t)).toBe(false);
    }
    expect(PPL_REKLAMATION).toContain("Ersatzlead nach");
    expect(PPL_NACHLIEFERUNG).toContain("liefern wir Ihnen nach");
    expect(PPL_REKLAMATION_ALT).toContain("gut");
  });

  it("Lead-AGB: „erstatt“ nur im Ausnahme-Absatz, Reklamation ohne Gutschrift", () => {
    for (const secs of [AGB_NUR_LEADS, agbPplSoftware({ zugaenge: true, zusatzmodule: true })]) {
      const liefer = secs.find((s) => s.title === "Lieferung, Nachlieferung und Erstattung")!;
      expect(liefer).toBeTruthy();
      const [nach, keine, ausnahme] = liefer.items as string[];
      expect(nach).toContain("liefert er danach nach");
      expect(keine).toContain("erstattet sie nicht");
      expect(ausnahme).toMatch(/erstattet der Anbieter.*wenn er den Vertrag kündigt.*dauerhaft nicht liefern kann/);
      const rekl = text(secs.filter((s) => s.title === "Abrechenbare Leads und Reklamation"));
      expect(rekl).toContain("kostenlos einen Ersatzlead");
      expect(rekl).not.toMatch(/schreibt .* gut|Hälfte/);
      // außerhalb des Abschnitts zur Lieferung keine Erstattungszusage (nur Verweise auf ihn, Umsatzsteuer „nachberechnen“)
      const rest = text(secs.filter((s) => s !== liefer)).replace(/„Lieferung, Nachlieferung und Erstattung“/g, "");
      expect(rest).not.toMatch(/erstatte/i);
      expect(hatGedankenstrich(text(secs))).toBe(false);
    }
  });

  it("Nur-Leads-AGB ohne Garantie, Setupgebühr, Kampagnen, Werbebudget; fortlaufend und vollständig", () => {
    const t = text(AGB_NUR_LEADS);
    expect(t).not.toMatch(/garantie/i);
    expect(t).not.toMatch(/setupgebühr|einrichtungsgebühr/i);
    expect(t).not.toMatch(/werbebudget|preisstaffel|pause und urlaub/i);
    expect(t).not.toMatch(/zugänge|zusatzmodule|vorauszahlung/i);
    for (const titel of ["Geltungsbereich", "Vertragsschluss und Rangfolge", "Umsatzsteuer auf Leads", "Haftung", "Datenschutz", "Schlussbestimmungen", "Laufzeit und Vertragsende"]) {
      expect(AGB_NUR_LEADS.some((s) => s.title === titel)).toBe(true);
    }
    expect(new Set(AGB_NUR_LEADS.map((s) => s.title)).size).toBe(AGB_NUR_LEADS.length);
  });

  it("Pay-per-Lead + Software: ohne Garantien, Setup, Pause, Halteangebote; Zugänge nur wenn im Angebot", () => {
    const ohne = text(agbPplSoftware());
    expect(ohne).not.toMatch(/garantie/i);
    expect(ohne).not.toMatch(/setupgebühr|werbebudget|preisstaffel|meta-werbekonto/i);
    expect(ohne).not.toMatch(/Zugänge:|Zusatzmodule:/);
    expect(text(agbPplSoftware({ zugaenge: true }))).toContain("Zugänge");
    expect(agbPplSoftware().some((s) => s.title === "Angebote vor einer Kündigung" || s.title === "Pause und Urlaub")).toBe(false);
  });

  it("agbFuerAngebot: Leadangebote gefiltert, alte Annahmen und andere Pakete unverändert", () => {
    expect(agbFuerAngebot({ package: "ppl" })).toEqual({ agb: AGB_NUR_LEADS, besondere: null, lead: true });
    expect(agbFuerAngebot({ package: "ppl", leadAltBedingungen: true })).toEqual({ agb: AGB, besondere: PPL_NUR_LEADS_BEDINGUNGEN_ALT, lead: false });
    expect(agbFuerAngebot({ package: "software" }).agb).toBe(AGB);
    const kk = agbFuerAngebot({ package: "ppl_software", kundenkonto: true });
    expect(kk.besondere).toBe(PPL_KUNDENKONTO_BEDINGUNGEN);
    expect(kk.agb.some((s) => s.title === "Garantien")).toBe(false);
    expect(text(agbFuerAngebot({ package: "ppl_software" }).agb)).not.toMatch(/garantie/i);
  });

  it("AGB-Link an der Annahme", () => {
    expect(agbLinkFuerAngebot("https://x.de/rechtliches/agb", { package: "ppl" })).toBe("https://x.de/rechtliches/agb?paket=ppl");
    expect(agbLinkFuerAngebot("https://x.de/rechtliches/agb", { package: "ppl_software", kundenkonto: true })).toBe("https://x.de/rechtliches/agb?paket=ppl_software&variante=kundenkonto");
    expect(agbLinkFuerAngebot("https://x.de/rechtliches/agb", { package: "software" })).toBe("https://x.de/rechtliches/agb");
    expect(agbLinkFuerAngebot("https://andere.de/agb.pdf", { package: "ppl" })).toBe("https://andere.de/agb.pdf");
  });
});
