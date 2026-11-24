"use client";

import { Badge, buttonClass } from "@/components/ui";
import { groupByMonth, KIND_LABEL, type UpdateKind, type UpdateView } from "@/lib/neuigkeiten-shared";

const KIND_TONE: Record<UpdateKind, "success" | "brand" | "info"> = { neu: "success", verbessert: "brand", behoben: "info" };
const dayLabel = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(new Date(iso));

const LINK_RE = /\[([^\]\n]{1,80})\]\((https:\/\/[^\s)]{1,300})\)/g;
const NUR_LINK_RE = /^\[([^\]\n]{1,80})\]\((https:\/\/[^\s)]{1,300})\)$/;

function Fett({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*\n]+\*\*)/g).map((part, j) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <b key={j} className="font-semibold text-[color:var(--foreground)]">
            {part.slice(2, -2)}
          </b>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Text mit **fett** und Absätzen (wie die Sondervereinbarung im Angebot). Links als [Text](https://…); ein Absatz,
 * der nur aus einem Link besteht, wird ein Knopf (Ole, 24.11.2026: „Jetzt im App Store laden“). Nur https.
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => {
        const knopf = para.trim().match(NUR_LINK_RE);
        if (knopf)
          return (
            <p key={i} className="pt-1">
              <a href={knopf[2]} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md")} data-update-knopf>
                {knopf[1]}
              </a>
            </p>
          );
        const teile: React.ReactNode[] = [];
        let last = 0;
        for (const m of para.matchAll(LINK_RE)) {
          teile.push(<Fett key={`t${last}`} text={para.slice(last, m.index)} />);
          teile.push(
            <a key={`l${m.index}`} href={m[2]} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--brand)] underline">
              {m[1]}
            </a>,
          );
          last = (m.index ?? 0) + m[0].length;
        }
        teile.push(<Fett key={`t${last}`} text={para.slice(last)} />);
        return (
          <p key={i} className="whitespace-pre-line">
            {teile}
          </p>
        );
      })}
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

/** Kompakter Eintrag: Titel und Datum, Text zum Aufklappen (ältere Neuigkeiten). */
function UpdateKompakt({ u }: { u: UpdateView }) {
  return (
    <li data-update={u.id}>
      <details className="group rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white">
        {/* Ganze Zeile tippbar, nicht nur der Titel (Runde 5, 16.11.2026) */}
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 truncate">{u.title}</span>
          {u.publishedAt ? <span className="shrink-0 text-xs text-[color:var(--muted)]">{dayLabel(u.publishedAt)}</span> : null}
        </summary>
        <div className="space-y-2 px-4 pb-3 text-[15px] leading-relaxed text-[color:var(--muted)]">
          <RichText text={u.body} />
        </div>
      </details>
    </li>
  );
}

/**
 * Die neuesten (mindestens 5, alle ungelesenen) ausführlich, ältere nach Monat zugeklappt (UX, Ole 15.11.2026:
 * die Seite war über 16.000 Pixel lang).
 */
export function UpdatesList({ items, unreadIds = [] }: { items: UpdateView[]; unreadIds?: string[] }) {
  if (!items.length) {
    return <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6 text-center text-sm text-[color:var(--muted)]">Noch keine Neuigkeiten.</p>;
  }
  const unread = new Set(unreadIds);
  const n = Math.max(5, items.filter((u) => unread.has(u.id)).length);
  const neu = items.slice(0, n);
  const aelter = items.slice(n);
  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {neu.map((u) => (
          <UpdateEntry key={u.id} u={u} unread={unread.has(u.id)} />
        ))}
      </ul>
      {groupByMonth(aelter).map((g) => (
        <section key={g.month}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{g.month}</h2>
          <ul className="space-y-2">
            {g.items.map((u) => (
              <UpdateKompakt key={u.id} u={u} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
