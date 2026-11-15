// Kundenakte: Vertreter oder Makler (bestimmt die Standard-Provisionssätze)
// plus Hinweis, ob der Kunde eigene Sätze unter „Meine Provisionen“ hinterlegt hat.

import { setVermittlerTypAction } from "@/app/admin/kunden/[id]/whatsapp/module-actions";
import { loadCustomerProvision } from "@/lib/provision-server";
import { prisma } from "@/lib/prisma";
import { vermittlerStatusLabel } from "@/lib/erstinformation-shared";

const STATUS_KNOEPFE = [
  { key: "vertreter", label: "Vertreter (AO)" },
  { key: "mehrfachvertreter", label: "Mehrfachvertreter" },
  { key: "makler", label: "Makler" },
] as const;

export async function VermittlerCard({ customerId }: { customerId: string }) {
  const p = await loadCustomerProvision(customerId);
  const roh = (await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerTyp: true } }))?.vermittlerTyp ?? "vertreter";
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          Vermittlertyp: {vermittlerStatusLabel(roh)}{" "}
          <span
            className={
              p.hasCustom
                ? "ml-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700"
                : "ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
            }
          >
            {p.hasCustom ? "eigene Provisionssätze hinterlegt" : "Standard-Provisionssätze"}
          </span>
        </div>
        <p className="text-[color:var(--muted)]">
          Bestimmt die Provisionsschätzung je Abschluss (Mehrfachvertreter wie Vertreter) und den Status in der Erstinformation. Makler: Sach als Bestandscourtage, Leben/BU in Promille der Beitragssumme, PKV-Tarifoptimierung als Honorar.
        </p>
      </div>
      <form action={setVermittlerTypAction} className="flex gap-1.5">
        <input type="hidden" name="customerId" value={customerId} />
        {STATUS_KNOEPFE.map((t) => (
          <button
            key={t.key}
            name="typ"
            value={t.key}
            aria-pressed={roh === t.key}
            className={`h-9 rounded-[var(--radius-sm)] px-3 text-sm font-semibold ${
              roh === t.key ? "bg-[color:var(--brand)] text-white" : "border border-[color:var(--border)] bg-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </form>
    </section>
  );
}
