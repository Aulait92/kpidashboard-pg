// Kundenakte: Anrede gegenüber dem Kunden (Vermittler) selbst, Sie oder Du (Ole, 18.11.2026).
// Kommt beim Annehmen aus dem Angebot (Offer.mailDu), hier änderbar. Nicht die Ansprache seiner Leads (leadAddress).

import { setVermittlerDuAction } from "@/app/admin/kunden/[id]/whatsapp/module-actions";
import { ladeVermittlerAnrede } from "@/lib/vermittler-ansprache-server";
import { vermittlerAnredeLabel } from "@/lib/vermittler-ansprache";

const KNOEPFE = [
  { key: "sie", label: "Sie" },
  { key: "du", label: "Du" },
] as const;

export async function VermittlerAnredeCard({ customerId }: { customerId: string }) {
  const a = await ladeVermittlerAnrede(customerId);
  const aktiv = a.du ? "du" : "sie";
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-vermittler-anrede>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          Anrede gegenüber dem Kunden{" "}
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{vermittlerAnredeLabel(a)}</span>
        </div>
        <p className="text-[color:var(--muted)]">Begrüßung im Kundenbereich und persönliche Mails an ihn, nicht die Ansprache seiner Leads.</p>
      </div>
      <form action={setVermittlerDuAction} className="flex gap-1.5">
        <input type="hidden" name="customerId" value={customerId} />
        {KNOEPFE.map((k) => {
          // Gilt gerade (auch aus dem Angebot bzw. Standard); ein Klick speichert die Anrede fest am Kunden
          const an = aktiv === k.key;
          return (
            <button
              key={k.key}
              name="anrede"
              value={k.key}
              aria-pressed={an}
              className={`h-9 rounded-[var(--radius-sm)] px-3 text-sm font-semibold ${an ? "bg-[color:var(--brand)] text-white" : "border border-[color:var(--border)] bg-white"}`}
            >
              {k.label}
            </button>
          );
        })}
      </form>
    </section>
  );
}
