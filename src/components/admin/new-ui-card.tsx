// Kundenakte: neue Oberfläche des Kundenbereichs (Vertreter-A) für diesen Kunden an/aus.
// Steht in der Übersicht, damit man ihn ohne Suchen findet (auch bei „Nur Betreuung“).

import { toggleNewUiAction } from "@/app/admin/kunden/[id]/whatsapp/module-actions";
import { prisma } from "@/lib/prisma";

export async function NewUiCard({ customerId }: { customerId: string }) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { newUi: true } });
  const on = !!c?.newUi;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          Neue Oberfläche (Vertreter-A){" "}
          <span className={on ? "ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700" : "ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"}>
            {on ? "an" : "aus"}
          </span>
        </div>
        <p className="text-[color:var(--muted)]">
          Heute, Kontakte, Nachrichten, Wachstum, Anrufmodus. Gilt für alle Logins dieses Kunden; aus = bisherige Oberfläche.
        </p>
      </div>
      <form action={toggleNewUiAction}>
        <input type="hidden" name="customerId" value={customerId} />
        <button className={`h-9 rounded-[var(--radius-sm)] px-3 text-sm font-semibold ${on ? "border border-[color:var(--border)] bg-white" : "bg-[color:var(--brand)] text-white"}`}>
          {on ? "Ausschalten" : "Einschalten"}
        </button>
      </form>
    </section>
  );
}
