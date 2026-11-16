import { Badge } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { SOURCE_LABEL } from "@/lib/vertrieb/crm";
import { kundenNachKanal } from "@/lib/vertrieb/kunden-kanal";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Zahlen → Übersicht → Vertrieb: Kunden nach Kanal (ohne Gekündigt), wie bisher in Kunden → Pipeline.
export async function KundenNachKanal() {
  const customers = await prisma.salesContact.findMany({
    where: { customerStage: { not: null } },
    select: { customerSource: true, customerStage: true, monthlyValue: true },
  });
  const zeilen = kundenNachKanal(customers);
  if (!zeilen.length) return null;
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5" data-funktion="page--kunden-nach-kanal-ohne-gekuendigt">
      <h2 className="text-[15px] font-semibold">Kunden nach Kanal</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-[color:var(--muted)]">Ohne Gekündigte, Monatsumsatz der aktiven Kunden.</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {zeilen.map((z) => (
          <li key={z.source ?? "none"} className="flex items-center gap-1.5">
            <Badge tone={z.source ? "brand" : "neutral"}>{z.source ? SOURCE_LABEL[z.source] : "Unbekannt"}</Badge>
            <span className="font-semibold tabular-nums">{z.count}</span>
            {z.mrrAktiv > 0 ? <span className="text-xs text-[color:var(--muted)]">· {eur(z.mrrAktiv)}/Monat</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
