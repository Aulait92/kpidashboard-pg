"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Megaphone, X } from "lucide-react";
import { Badge } from "@/components/ui";
import { groupByMonth, KIND_LABEL, type UpdateKind, type UpdateView } from "@/lib/neuigkeiten-shared";

const KIND_TONE: Record<UpdateKind, "success" | "brand" | "info"> = { neu: "success", verbessert: "brand", behoben: "info" };
const dayLabel = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(new Date(iso));

/** Text mit **fett** und Absätzen (wie die Sondervereinbarung im Angebot). */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-line">
          {para.split(/(\*\*[^*\n]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
              <b key={j} className="font-semibold text-[color:var(--foreground)]">
                {part.slice(2, -2)}
              </b>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </>
  );
}

export function UpdateEntry({ u, unread = false }: { u: UpdateView; unread?: boolean }) {
  return (
    <li className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 sm:p-5" data-update={u.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={KIND_TONE[u.kind]}>{KIND_LABEL[u.kind]}</Badge>
        {u.publishedAt ? <span className="text-xs text-[color:var(--muted)]">{dayLabel(u.publishedAt)}</span> : <span className="text-xs text-amber-700">Entwurf</span>}
        {unread ? <span className="ml-auto h-2 w-2 rounded-full bg-[color:var(--brand)]" aria-label="ungelesen" /> : null}
      </div>
      <h3 className="mt-2 text-[17px] font-semibold leading-snug">{u.title}</h3>
      <div className="mt-1 space-y-2 text-[15px] leading-relaxed text-[color:var(--muted)]">
        <RichText text={u.body} />
      </div>
    </li>
  );
}

/** Liste nach Monat; `unreadIds` werden mit Punkt markiert. */
export function UpdatesList({ items, unreadIds = [] }: { items: UpdateView[]; unreadIds?: string[] }) {
  if (!items.length) {
    return <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6 text-center text-sm text-[color:var(--muted)]">Noch keine Neuigkeiten.</p>;
  }
  const unread = new Set(unreadIds);
  return (
    <div className="space-y-6">
      {groupByMonth(items).map((g) => (
        <section key={g.month}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{g.month}</h2>
          <ul className="space-y-3">
            {g.items.map((u) => (
              <UpdateEntry key={u.id} u={u} unread={unread.has(u.id)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Dezente Karte in „Heute“: „Neu: <Titel>“, wegklickbar (gilt dann als gelesen). */
export function UpdatesHeuteCard({ title, more, dismiss }: { title: string; more: number; dismiss: () => Promise<void> }) {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3" data-updates-card>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]">
        <Megaphone className="h-4 w-4" />
      </span>
      <Link href="/buyer/neuigkeiten" className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">Neu: {title}</span>
        <span className="block text-sm text-[color:var(--muted)]">{more > 0 ? `und ${more} weitere Neuigkeit${more === 1 ? "" : "en"} – ansehen` : "Was wir verbessert haben – ansehen"}</span>
      </Link>
      <button
        type="button"
        aria-label="Hinweis ausblenden"
        className="rounded-full p-2 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]"
        onClick={() => {
          setHidden(true);
          start(() => dismiss());
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
