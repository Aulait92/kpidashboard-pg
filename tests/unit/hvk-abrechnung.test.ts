import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  centsOf,
  hvkCronDue,
  leadPlzOrt,
  matchReklamation,
  parseHvkInvoiceText,
  processHvkInvoice,
  reconcileWeek,
  sameOrt,
  type HvkBoughtLine,
  type HvkDeliveredLead,
  type HvkInvoiceInput,
  type HvkProcessResult,
  type HvkReklamationResult,
  type HvkStore,
} from "@/lib/ppl/hvk-abrechnung";
import { looksLikePdf, pdfText } from "@/lib/ppl/hvk-pdf-text";

// Synthetische Abrechnung im Format von Lead-Production (Rechnung 369-G-000034, 20.–26.07.2026: 7 gekaufte Leads,
// 1 Reklamation, Endsumme Netto −270,00 €). Lead IDs, PLZ und Orte sind ausgedacht.
const FIXTURE = readFileSync(path.join(__dirname, "..", "fixtures", "hvk-abrechnung", "369-G-000034.txt"), "utf8");

const lead = (id: string, date: string, plz: string | null, ort: string | null, extra: Partial<HvkDeliveredLead> = {}): HvkDeliveredLead => ({
  id,
  date,
  plz,
  ort,
  name: `Lead ${id}`,
  stornoState: null,
  ...extra,
});

describe("HvK-Abrechnung: PDF-Text lesen", () => {
  it("liest Rechnungsnummer, Zeitraum, 7 gekaufte Leads, 1 Reklamation und die Summen", () => {
    const p = parseHvkInvoiceText(FIXTURE)!;
    expect(p.invoiceNo).toBe("369-G-000034");
    expect(p.periodStart).toBe("2026-07-20");
    expect(p.periodEnd).toBe("2026-07-26");
    expect(p.invoiceDate).toBe("2026-07-27");
    expect(p.brokerId).toBe("3618");
    const bought = p.lines.filter((l) => l.kind === "gekauft");
    const rek = p.lines.filter((l) => l.kind === "reklamation");
    expect(bought).toHaveLength(7);
    expect(rek).toEqual([
      { kind: "reklamation", pos: 1, percent: 100, hvkLeadId: "4596925", product: "KVV-Opt", date: "2026-07-19", plz: "84032", ort: "Landshut", cents: 4500 },
    ]);
    expect(bought[0]).toEqual({ kind: "gekauft", pos: 2, hvkLeadId: "4595123", product: "KVV-Opt", plz: "41239", ort: "Mönchengladbach", cents: -4500 });
    expect(bought.map((b) => b.ort)).toContain("Bad Säckingen");
    expect(p.netCents).toBe(-27000);
    expect(p.vatCents).toBe(-5130);
    expect(p.grossCents).toBe(-32130);
    expect(p.warnings).toEqual([]);
  });

  it("verträgt Text ohne Zeilenumbrüche (alles in einer Zeile, wie aus manchen PDF-Lesern)", () => {
    const p = parseHvkInvoiceText(FIXTURE.replace(/\n/g, "  "))!;
    expect(p.lines).toHaveLength(8);
    expect(p.lines.filter((l) => l.kind === "reklamation")).toHaveLength(1);
    expect(p.netCents).toBe(-27000);
  });

  it("meldet, wenn die Zeilen nicht zur Endsumme passen, und erkennt fremde Dokumente nicht als Abrechnung", () => {
    const p = parseHvkInvoiceText(FIXTURE.replace("Endsumme Netto:   -270,00 €", "Endsumme Netto:   -315,00 €"))!;
    expect(p.warnings[0]).toMatch(/passt nicht zur Endsumme/);
    expect(parseHvkInvoiceText("Irgendein Brief ohne Rechnungsnummer")).toBeNull();
  });

  it("Beträge in Cent", () => {
    expect(centsOf("-45,00")).toBe(-4500);
    expect(centsOf("−1.045,50")).toBe(-104550);
    expect(centsOf("45,00")).toBe(4500);
    expect(centsOf("+ 3,10")).toBe(310);
  });

  it("liest den Text aus einem echten PDF (Spalten als einzelne Textstücke)", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    let y = 800;
    for (const line of FIXTURE.split("\n").filter(Boolean)) {
      // Tabellenzeilen in Spalten zerlegen wie im Original
      const cols = line.split(/ {3,}/);
      let x = 30;
      for (const c of cols) {
        page.drawText(c, { x, y, size: 7, font });
        x += Math.max(30, font.widthOfTextAtSize(c, 7) + 12);
      }
      y -= 14;
    }
    const bytes = await doc.save();
    expect(looksLikePdf(bytes)).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("hallo"))).toBe(false);
    const p = parseHvkInvoiceText(await pdfText(bytes))!;
    expect(p.invoiceNo).toBe("369-G-000034");
    expect(p.lines.filter((l) => l.kind === "gekauft")).toHaveLength(7);
    expect(p.lines.filter((l) => l.kind === "reklamation")).toHaveLength(1);
    expect(p.netCents).toBe(-27000);
    expect(p.warnings).toEqual([]);
  });
});

describe("HvK-Abrechnung: PLZ und Ort unserer Leads", () => {
  it("korrigierte Stammdaten vor Formular vor Pool-Eingang", () => {
    expect(leadPlzOrt({ formData: [{ label: "Postleitzahl", value: "84032" }, { label: "Ort", value: "Landshut" }] })).toEqual({ plz: "84032", ort: "Landshut" });
    expect(leadPlzOrt({ contactOverrides: { zip: "80331", city: "München" }, formData: [{ label: "PLZ", value: "84032" }] })).toEqual({ plz: "80331", ort: "München" });
    expect(leadPlzOrt({ formData: [{ label: "Stadt", value: "Ulm" }], poolPlz: "89073" })).toEqual({ plz: "89073", ort: "Ulm" });
    expect(leadPlzOrt({ formData: null })).toEqual({ plz: null, ort: null });
    expect(leadPlzOrt({ formData: [{ label: "PLZ", value: "D-1234" }] }).plz).toBeNull();
  });

  it("Ort tolerant vergleichen", () => {
    expect(sameOrt("Mönchengladbach", "Moenchengladbach")).toBe(true);
    expect(sameOrt("Frankfurt am Main", "Frankfurt")).toBe(true);
    expect(sameOrt("königsbach", "Königsbach")).toBe(true);
    expect(sameOrt("Ulm", "Neu-Ulm")).toBe(false);
    expect(sameOrt(null, "Ulm")).toBe(false);
  });
});

describe("HvK-Abrechnung: Reklamation zuordnen (Lieferdatum + PLZ)", () => {
  const r = { date: "2026-07-19", plz: "84032" };
  it("genau ein Kandidat: eindeutig", () => {
    const m = matchReklamation(r, [lead("a", "2026-07-19", "84032", "Landshut"), lead("b", "2026-07-18", "84032", "Landshut"), lead("c", "2026-07-19", "84034", "Landshut")]);
    expect(m).toEqual({ outcome: "eindeutig", lead: expect.objectContaining({ id: "a" }) });
  });
  it("kein Kandidat: nicht raten", () => {
    expect(matchReklamation(r, [lead("b", "2026-07-18", "84032", "Landshut")])).toEqual({ outcome: "keiner", candidates: [] });
  });
  it("mehrere Kandidaten: nicht raten, alle zeigen", () => {
    const m = matchReklamation(r, [lead("a", "2026-07-19", "84032", "Landshut"), lead("d", "2026-07-19", "84032", "Ergolding")]);
    expect(m.outcome).toBe("mehrere");
    expect(m.outcome !== "eindeutig" && m.candidates.map((c) => c.id)).toEqual(["a", "d"]);
  });
});

describe("HvK-Abrechnung: Wochenabgleich gekauft ↔ geliefert", () => {
  const b = (id: string, plz: string, ort: string): HvkBoughtLine => ({ kind: "gekauft", pos: null, hvkLeadId: id, product: "KVV-Opt", plz, ort, cents: -4500 });
  it("ordnet über PLZ und Ort zu und zeigt beide Abweichungen", () => {
    const res = reconcileWeek(
      [b("1", "41239", "Mönchengladbach"), b("2", "80331", "München"), b("3", "99999", "Nirgendwo"), b("4", "89073", "Ulm")],
      [
        lead("x", "2026-07-20", "41239", "Moenchengladbach"),
        lead("y", "2026-07-21", "80331", "München"),
        lead("z", "2026-07-22", "10115", "Berlin"),
        lead("u", "2026-07-23", null, "Ulm"),
      ],
    );
    expect(res.matched).toEqual([
      { hvkLeadId: "1", leadId: "x" },
      { hvkLeadId: "2", leadId: "y" },
      { hvkLeadId: "4", leadId: "u" },
    ]);
    expect(res.unbilled.map((d) => d.id)).toEqual(["z"]);
    expect(res.foreign.map((f) => f.hvkLeadId)).toEqual(["3"]);
  });
  it("gleiche PLZ zweimal: zuerst der passende Ort", () => {
    const res = reconcileWeek([b("1", "84032", "Ergolding"), b("2", "84032", "Landshut")], [lead("l", "2026-07-20", "84032", "Landshut"), lead("e", "2026-07-21", "84032", "Ergolding")]);
    expect(res.matched).toEqual([
      { hvkLeadId: "1", leadId: "e" },
      { hvkLeadId: "2", leadId: "l" },
    ]);
  });
});

// Speicher im Arbeitsspeicher: zählt Schreibzugriffe
function memoryStore(leads: HvkDeliveredLead[]) {
  const invoices = new Map<string, { id: string; result: HvkProcessResult }>();
  const stornos: { leadId: string; reason: string; note: string }[] = [];
  const saved: HvkReklamationResult[][] = [];
  let creates = 0;
  const store: HvkStore = {
    findInvoice: async (no) => (invoices.has(no) ? { id: invoices.get(no)!.id } : null),
    deliveredLeads: async (from, to) => leads.filter((l) => l.date >= from && l.date <= to),
    createInvoice: async (input, result) => {
      creates++;
      if (invoices.has(input.parsed.invoiceNo)) return "exists";
      const id = `inv${invoices.size + 1}`;
      invoices.set(input.parsed.invoiceNo, { id, result });
      return { id };
    },
    recordStorno: async (leadId, reason, note) => {
      const already = stornos.some((s) => s.leadId === leadId);
      stornos.push({ leadId, reason, note });
      return { ok: true, already };
    },
    saveReklamationen: async (_id, rows) => {
      saved.push(rows);
    },
  };
  return { store, invoices, stornos, saved, creates: () => creates };
}

const input = (text = FIXTURE): HvkInvoiceInput => ({ parsed: parseHvkInvoiceText(text)!, pdf: new Uint8Array([37, 80, 68, 70, 45]), pdfName: "Gutschrift.pdf", mailMessageId: "m1", receivedAt: null, source: "mail" });

// Unsere Lieferungen: Landshut am 19.07. (Vorwoche, reklamiert), 7 Leads in der Woche passend zu den gekauften,
// dazu einer, den HvK nicht abgerechnet hat
const WEEK: HvkDeliveredLead[] = [
  lead("rek", "2026-07-19", "84032", "Landshut"),
  lead("l1", "2026-07-20", "41239", "Mönchengladbach"),
  lead("l2", "2026-07-20", "26382", "Wilhelmshaven"),
  lead("l3", "2026-07-21", "80331", "München"),
  lead("l4", "2026-07-22", "79713", "Bad Säckingen"),
  lead("l5", "2026-07-23", "76307", "Karlsbad"),
  lead("l6", "2026-07-24", "49835", "Wietmarschen"),
  lead("l7", "2026-07-26", "71364", "Winnenden"),
  lead("l8", "2026-07-26", "50667", "Köln"),
];

describe("HvK-Abrechnung: Ablauf je Rechnung", () => {
  it("trägt den eindeutigen Storno ein und gleicht die Woche ab", async () => {
    const m = memoryStore(WEEK);
    const r = await processHvkInvoice(input(), m.store);
    expect(r.status).toBe("neu");
    expect(r.invoiceId).toBe("inv1");
    expect(r.delivered).toBe(8);
    expect(r.billed).toBe(7);
    expect(r.netCents).toBe(-27000);
    expect(r.matched).toBe(7);
    expect(r.unbilled.map((u) => u.id)).toEqual(["l8"]);
    expect(r.foreign).toEqual([]);
    expect(r.stornoAuto).toBe(1);
    expect(r.stornoReview).toBe(0);
    expect(m.stornos).toEqual([{ leadId: "rek", reason: "Reklamation HvK-Abrechnung 369-G-000034", note: "HvK Lead ID 4596925, 84032 Landshut, geliefert 19.07.2026" }]);
    expect(m.saved[0][0]).toMatchObject({ outcome: "eindeutig", leadId: "rek", storno: "eingetragen" });
  });

  it("ist idempotent über die Rechnungsnummer: zweiter Lauf ändert nichts", async () => {
    const m = memoryStore(WEEK);
    await processHvkInvoice(input(), m.store);
    const again = await processHvkInvoice({ ...input(), mailMessageId: "andere-mail" }, m.store);
    expect(again.status).toBe("vorhanden");
    expect(again.invoiceId).toBe("inv1");
    expect(m.creates()).toBe(1);
    expect(m.stornos).toHaveLength(1);
    expect(m.saved).toHaveLength(1);
  });

  it("gleichzeitiger zweiter Lauf (Rechnungsnummer schon angelegt) trägt keinen Storno ein", async () => {
    const m = memoryStore(WEEK);
    const store: HvkStore = { ...m.store, findInvoice: async () => null, createInvoice: async () => "exists" };
    const r = await processHvkInvoice(input(), store);
    expect(r.status).toBe("vorhanden");
    expect(m.stornos).toHaveLength(0);
  });

  it("Vorschau (dryRun) schreibt nichts", async () => {
    const m = memoryStore(WEEK);
    const r = await processHvkInvoice(input(), m.store, { dryRun: true });
    expect(r.status).toBe("vorschau");
    expect(r.reklamationen[0]).toMatchObject({ outcome: "eindeutig", leadId: "rek", storno: "würde eingetragen" });
    expect(m.creates()).toBe(0);
    expect(m.stornos).toHaveLength(0);
    expect(m.saved).toHaveLength(0);
  });

  it("mehrere Kandidaten: kein Storno, Fall zum Prüfen mit Kandidaten", async () => {
    const m = memoryStore([...WEEK, lead("rek2", "2026-07-19", "84032", "Landshut")]);
    const r = await processHvkInvoice(input(), m.store);
    expect(r.stornoAuto).toBe(0);
    expect(r.stornoReview).toBe(1);
    expect(r.reklamationen[0]).toMatchObject({ outcome: "mehrere", leadId: null, candidateIds: ["rek", "rek2"], storno: null });
    expect(m.stornos).toHaveLength(0);
    expect(m.saved[0]).toHaveLength(1);
  });

  it("kein Kandidat: kein Storno, Fall zum Prüfen; HvK-Lead ohne Lieferung von uns wird gezeigt", async () => {
    const m = memoryStore(WEEK.filter((l) => l.id !== "rek" && l.id !== "l3"));
    const r = await processHvkInvoice(input(), m.store);
    expect(r.reklamationen[0]).toMatchObject({ outcome: "keiner", candidateIds: [] });
    expect(r.stornoReview).toBe(1);
    expect(r.foreign).toEqual([{ hvkLeadId: "4597002", plz: "80331", ort: "München", product: "KVV-Opt" }]);
    expect(m.stornos).toHaveLength(0);
  });

  it("schon stornierter Lead wird als „schon storniert“ gemeldet", async () => {
    const m = memoryStore(WEEK.map((l) => (l.id === "rek" ? { ...l, stornoState: "approved" } : l)));
    const r = await processHvkInvoice(input(), m.store, { dryRun: true });
    expect(r.reklamationen[0].storno).toBe("schon storniert");
  });
});

describe("HvK-Abrechnung: Abruf im Cron", () => {
  it("Mo–Mi stündlich 7–20 Uhr Berlin, sonst nicht", () => {
    expect(hvkCronDue(new Date("2026-07-28T06:02:00Z"))).toBe(true); // Di 08:02 Berlin (Sommerzeit)
    expect(hvkCronDue(new Date("2026-11-16T06:01:00Z"))).toBe(true); // Mo 07:01 Berlin (Winterzeit)
    expect(hvkCronDue(new Date("2026-11-16T05:01:00Z"))).toBe(false); // Mo 06:01
    expect(hvkCronDue(new Date("2026-07-28T06:07:00Z"))).toBe(false); // nicht in den ersten 5 Minuten
    expect(hvkCronDue(new Date("2026-07-30T06:02:00Z"))).toBe(false); // Donnerstag
  });
});
