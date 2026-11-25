// Ausgangsrechnungen aus Stripe als Belege (Ole, 23.11.2026: Stripe ersetzt Papierkram). Nachts: alle abgeschlossenen
// Rechnungen und Gutschriften ab 1.1.2026 mit PDF und exakten Beträgen aus Stripe (keine KI). Stornierte Rechnungen
// (void) bleiben als Beleg erhalten, Typ SALES_INVOICE_VOID. Eindeutig über hash = „stripe:<id>“.
// Dazu jede Rechnung und Gutschrift als Ausgangsrechnung (Quelle „stripe“) für die BWA (Ole, 25.11.2026: Software-
// Umsatz läuft über Stripe); stornierte fallen dort wieder raus. Bereich wie bei Papierkram (lib/ausgangsrechnungen.ts).

import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/billing";

const tag = (unix: number) => new Date(new Date(unix * 1000).toISOString().slice(0, 10) + "T00:00:00Z");

async function pdfLaden(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const b = Buffer.from(await res.arrayBuffer());
    return b.subarray(0, 4).toString("latin1") === "%PDF" ? b : null;
  } catch {
    return null;
  }
}

/** Ausgangsrechnung für die BWA anlegen bzw. aktualisieren (Bereich bleibt, wenn schon gesetzt); storniert = löschen. */
async function alsAusgangsrechnung(r: { nummer: string; datum: Date; kunde: string; netto: number; brutto: number; status: string; typ: string; storniert: boolean }) {
  if (r.storniert) {
    await prisma.ausgangsrechnung.deleteMany({ where: { nummer: r.nummer, quelle: "stripe" } });
    return;
  }
  const daten = { datum: r.datum, kunde: r.kunde, netto: r.netto, ust: Math.round((r.brutto - r.netto) * 100) / 100, brutto: r.brutto, status: r.status, typ: r.typ, quelle: "stripe" };
  const alt = await prisma.ausgangsrechnung.findUnique({ where: { nummer: r.nummer }, select: { quelle: true } });
  // Gleiche Nummer aus Papierkram nicht überschreiben
  if (alt && alt.quelle !== "stripe") return;
  await prisma.ausgangsrechnung.upsert({ where: { nummer: r.nummer }, create: { nummer: r.nummer, ...daten }, update: daten });
}

export async function syncStripeBelege(ab = "2026-01-01"): Promise<{ rechnungen: number; gutschriften: number; neu: number }> {
  const stripe = stripeClient();
  if (!stripe) return { rechnungen: 0, gutschriften: 0, neu: 0 };
  const seit = Math.floor(Date.parse(`${ab}T00:00:00Z`) / 1000);
  let rechnungen = 0;
  let gutschriften = 0;
  let neu = 0;

  for await (const inv of stripe.invoices.list({ created: { gte: seit }, limit: 100 })) {
    if (inv.status === "draft" || !inv.number) continue;
    rechnungen++;
    const hash = `stripe:${inv.id}`;
    const typ = inv.status === "void" ? "SALES_INVOICE_VOID" : "SALES_INVOICE";
    const brutto = (inv.total ?? 0) / 100;
    const steuer = (inv.total_taxes ?? []).reduce((s, t) => s + (t.amount ?? 0), 0) / 100;
    const netto = Math.round((brutto - steuer) * 100) / 100;
    const satz = netto > 0 && steuer > 0 ? Math.round((steuer / netto) * 100) : 0;
    await alsAusgangsrechnung({
      nummer: inv.number,
      datum: tag(inv.status_transitions?.finalized_at ?? inv.created),
      kunde: (inv.customer_name ?? inv.customer_email ?? "Kunde").slice(0, 200),
      netto,
      brutto,
      status: inv.status ?? "open",
      typ: "Rechnung",
      storniert: inv.status === "void" || (inv.currency ?? "eur").toLowerCase() !== "eur",
    });
    const vorhanden = await prisma.beleg.findUnique({ where: { hash }, select: { id: true, typ: true, datei: false } });
    if (vorhanden) {
      if (vorhanden.typ !== typ) await prisma.beleg.update({ where: { id: vorhanden.id }, data: { typ } });
      continue;
    }
    const pdf = await pdfLaden(inv.invoice_pdf);
    await prisma.beleg.create({
      data: {
        quelle: "stripe",
        hash,
        datei: pdf ? new Uint8Array(pdf) : null,
        mimeType: pdf ? "application/pdf" : null,
        dateiname: `Rechnung ${inv.number}.pdf`,
        absender: "Stripe",
        ausgelesen: "stripe",
        ocrFertig: true,
        typ,
        firma: (inv.customer_name ?? inv.customer_email ?? "Kunde").slice(0, 200),
        nummer: inv.number,
        datum: tag(inv.status_transitions?.finalized_at ?? inv.created),
        netto,
        ustSatz: satz,
        brutto,
        waehrung: (inv.currency ?? "eur").toUpperCase(),
      },
    });
    neu++;
  }

  for await (const cn of stripe.creditNotes.list({ limit: 100, expand: ["data.customer"] })) {
    if (cn.created < seit) continue;
    gutschriften++;
    const hash = `stripe:${cn.id}`;
    const brutto = (cn.total ?? 0) / 100;
    const steuer = (cn.total_taxes ?? []).reduce((s, t) => s + (t.amount ?? 0), 0) / 100;
    const netto = Math.round((brutto - steuer) * 100) / 100;
    const kundeName = typeof cn.customer === "string" ? null : (cn.customer as { name?: string | null } | null)?.name;
    await alsAusgangsrechnung({
      nummer: cn.number,
      datum: tag(cn.created),
      kunde: (kundeName ?? "Kunde").slice(0, 200),
      netto: -netto,
      brutto: -brutto,
      status: cn.status ?? "issued",
      typ: "Gutschrift",
      storniert: cn.status === "void" || (cn.currency ?? "eur").toLowerCase() !== "eur",
    });
    if (await prisma.beleg.findUnique({ where: { hash }, select: { id: true } })) continue;
    const pdf = await pdfLaden(cn.pdf);
    const kunde = typeof cn.customer === "string" ? null : (cn.customer as { name?: string | null } | null)?.name;
    await prisma.beleg.create({
      data: {
        quelle: "stripe",
        hash,
        datei: pdf ? new Uint8Array(pdf) : null,
        mimeType: pdf ? "application/pdf" : null,
        dateiname: `Gutschrift ${cn.number}.pdf`,
        absender: "Stripe",
        ausgelesen: "stripe",
        ocrFertig: true,
        // Gutschrift von uns an einen Kunden = Korrektur einer Ausgangsrechnung
        typ: "SALES_CREDIT_NOTE",
        firma: (kunde ?? "Kunde").slice(0, 200),
        nummer: cn.number,
        datum: tag(cn.created),
        netto: -netto,
        ustSatz: netto > 0 && steuer > 0 ? Math.round((steuer / netto) * 100) : 0,
        brutto: -brutto,
        waehrung: (cn.currency ?? "eur").toUpperCase(),
      },
    });
    neu++;
  }
  return { rechnungen, gutschriften, neu };
}
