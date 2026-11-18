"use client";

// Heute: „Beiträge ergänzen“ (P4, Ole 17.11.2026). Abschlüsse, die mit einem Tipp und typischem Beitrag gespeichert
// wurden, stehen am nächsten Morgen gesammelt in einer Karte: je Kontakt drei Chips, „Anderer“ und „Passt so“.
// Ein Tipp genügt; kein eigener Push. Zahlen und Provision rechnen bis dahin mit dem typischen Beitrag („≈“).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Euro } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { abschlussBeitragAction } from "@/app/buyer/abschluss-actions";
import type { InboxBeitragFehlt } from "@/lib/inbox";

const eur = (n: number) => `${n.toLocaleString("de-DE")} €`;
const chipCls =
  "h-10 rounded-full border border-[color:var(--border)] bg-white px-3.5 text-sm font-semibold text-[color:var(--foreground)] transition hover:border-[color:var(--border-strong)] active:scale-[0.98] sm:h-8 sm:text-xs";

export function BeitragFehltKarte({ items }: { items: InboxBeitragFehlt[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [weg, setWeg] = useState<Set<string>>(new Set());
  const [anders, setAnders] = useState<string | null>(null);
  const [wert, setWert] = useState("");
  const offen = items.filter((i) => !weg.has(i.leadId));
  if (!offen.length) return null;

  const speichern = (i: InboxBeitragFehlt, eingabe: number | null) =>
    start(async () => {
      const r = await abschlussBeitragAction(i.leadId, eingabe);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      setWeg((w) => new Set(w).add(i.leadId));
      setAnders(null);
      setWert("");
      toast.show({ message: eingabe == null ? `${i.name}: typischer Beitrag bleibt` : `${i.name}: ${eur(eingabe)}${i.einheit} gespeichert` });
      router.refresh();
    });

  return (
    <Card data-beitrag-fehlt>
      <CardHeader icon={Euro} title="Beiträge ergänzen" count={offen.length} hint="Damit Provision und Zahlen stimmen." />
      <ul className="divide-y divide-[color:var(--border)]">
        {offen.map((i) => (
          <li key={i.leadId} className="px-5 py-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{i.name}</span>
                <span className="text-[color:var(--muted)]"> · {i.sparte} · {i.ersparnis ? "Ersparnis" : i.einheit === "/Monat" ? "Monatsbeitrag" : "Jahresbeitrag"}?</span>
              </p>
              <button type="button" disabled={pending} className="h-10 shrink-0 px-1 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)] sm:h-8 sm:text-xs" onClick={() => speichern(i, null)}>
                Passt so
              </button>
            </div>
            {anders === i.leadId ? (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number.parseFloat(wert.replace(/\./g, "").replace(",", "."));
                  if (Number.isFinite(n) && n > 0) speichern(i, n);
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 focus-within:border-[color:var(--brand)]">
                  <input autoFocus inputMode="decimal" aria-label="Betrag" value={wert} onChange={(e) => setWert(e.target.value)} className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none" />
                  <span className="text-sm text-[color:var(--muted)]">€{i.einheit}</span>
                </div>
                <button type="submit" disabled={pending} className={chipCls}>
                  Speichern
                </button>
              </form>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {i.chips.map((c) => (
                  <button key={c} type="button" disabled={pending} className={chipCls} onClick={() => speichern(i, c)}>
                    {eur(c)}
                  </button>
                ))}
                <button type="button" disabled={pending} className={`${chipCls} border-dashed text-[color:var(--muted)]`} onClick={() => setAnders(i.leadId)}>
                  Anderer
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
