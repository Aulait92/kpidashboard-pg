// Ausgangsrechnungen aus Stripe als Belege (Ole, 23.11.2026: Stripe ersetzt Papierkram). Nachts: alle abgeschlossenen
// Rechnungen und Gutschriften ab 1.1.2026 mit PDF und exakten Beträgen aus Stripe (keine KI). Stornierte Rechnungen
// (void) bleiben als Beleg erhalten, Typ SALES_INVOICE_VOID. Eindeutig über hash = „stripe:<id>“.

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

  for await (const cn of stripe.creditNotes.list({ limit: 100 })) {
    if (cn.created < seit) continue;
    gutschriften++;
    const hash = `stripe:${cn.id}`;
    if (await prisma.beleg.findUnique({ where: { hash }, select: { id: true } })) continue;
    const brutto = (cn.total ?? 0) / 100;
    const steuer = (cn.total_taxes ?? []).reduce((s, t) => s + (t.amount ?? 0), 0) / 100;
    const netto = Math.round((brutto - steuer) * 100) / 100;
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
