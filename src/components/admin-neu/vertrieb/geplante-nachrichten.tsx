import Link from "next/link";
import { ChevronDown, Mail, MessageCircle } from "lucide-react";
import { gruppiere, kanaeleText, zeitLabel, type GeplanteNachricht } from "@/lib/vertrieb/geplante-nachrichten";
import { cn } from "@/lib/utils";
import { NachrichtVorschauKnopf } from "@/components/admin-neu/vertrieb/nachricht-vorschau-knopf";

// Geplante Nachrichten (lib/vertrieb/geplante-nachrichten.ts): eine Zeile je Nachricht, gruppiert nach Heute, Morgen,
// nächste 7 Tage; „Später“ eingeklappt. Zeile antippen zeigt die Nachricht mit den echten Daten
// (Ole, 22.11.2026; von dort weiter zur Kontakt- bzw. Kundenakte), „Stoppen“ führt zum
// bestehenden Weg (Später-Follow-up in der Kontaktakte, Mahnungen in der Abrechnung des Kunden).

export const GEPLANTE_NACHRICHTEN_PFAD = "/admin/neu/vertrieb/nachrichten";

function KanalSymbole({ n }: { n: GeplanteNachricht }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[color:var(--muted)]" title={kanaeleText(n.kanaele)} aria-label={kanaeleText(n.kanaele)}>
      {n.kanaele.includes("email") ? <Mail className="h-3.5 w-3.5" /> : null}
      {n.kanaele.includes("whatsapp") ? <MessageCircle className="h-3.5 w-3.5" /> : null}
    </span>
  );
}

/** Eine Nachricht: Zeit, Empfänger, Art mit Bezug und Kanal. */
export function NachrichtZeile({ n, now, nurZeit }: { n: GeplanteNachricht; now: Date; nurZeit?: boolean }) {
  return (
    <li className="relative flex gap-3 px-4 py-3 transition hover:bg-[color:var(--surface-sunken)] sm:px-5" data-geplante-nachricht={n.quelle}>
      <span className={cn("w-20 shrink-0 pt-px text-sm tabular-nums sm:w-28", n.sofort ? "text-[color:var(--brand)]" : "font-semibold")}>{zeitLabel(n, now, { nurZeit })}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{n.empfaenger}</span>
          <KanalSymbole n={n} />
        </div>
        <div className="text-xs text-[color:var(--muted)]">
          {n.art}
          {n.bezug ? ` · ${n.bezug}` : ""}
          <span className="sr-only"> · {kanaeleText(n.kanaele)}</span>
          {n.hinweis ? ` · ${n.hinweis}` : ""}
        </div>
      </div>
      <NachrichtVorschauKnopf nachricht={{ key: n.key, at: n.at.toISOString(), kanaele: n.kanaele, art: n.art, empfaenger: n.empfaenger, href: n.href }} />
      {n.stoppHref ? (
        <Link href={n.stoppHref} className="relative z-10 -my-1 inline-flex min-h-10 shrink-0 items-center self-center text-xs font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:underline">
          Stoppen
        </Link>
      ) : null}
    </li>
  );
}

/** Ganze Liste: Heute, Morgen, nächste 7 Tage offen; Später eingeklappt. */
export function GeplanteNachrichtenListe({ items, now }: { items: GeplanteNachricht[]; now: Date }) {
  const gruppen = gruppiere(items, now);
  const offen = gruppen.filter((g) => g.key !== "spaeter");
  const spaeter = gruppen.find((g) => g.key === "spaeter");
  return (
    <div className="space-y-5">
      {offen.map((g) => (
        <section key={g.key} aria-label={g.label} data-gruppe={g.key}>
          <h2 className="mb-2 text-sm font-semibold">
            {g.label} <span className="font-normal text-[color:var(--muted)]">{g.items.length}</span>
          </h2>
          <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
            {g.items.map((n) => (
              <NachrichtZeile key={n.key} n={n} now={now} nurZeit={g.key !== "woche"} />
            ))}
          </ul>
        </section>
      ))}
      {spaeter ? (
        <details className="group" data-gruppe="spaeter">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Später <span className="font-normal text-[color:var(--muted)]">{spaeter.items.length}</span>
            <ChevronDown className="h-4 w-4 text-[color:var(--muted)] transition group-open:rotate-180" />
          </summary>
          <ul className="mt-2 divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
            {spaeter.items.map((n) => (
              <NachrichtZeile key={n.key} n={n} now={now} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
