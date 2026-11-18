"use client";

// E-Mail im Kontaktverlauf (Ole, 15.11.2026): Art (mit Kennzeichen „automatisch“), Zustellstatus, Betreff und
// Empfänger auf einen Blick; der Text ist eingeklappt (Klick auf „Text anzeigen“), als reiner Text.
// Genutzt im Lead-Verlauf (components/lead-history.tsx) und im Verlauf eines Bestandskunden.
// Eingang (Paket M2): Antwort an die Antwortadresse mit „von …“, Status „empfangen“, Hinweis (z. B. automatische Antwort)
// und Anhängen zum Herunterladen (aus Sicherheitsgründen gesperrte ohne Link).

import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui";
import type { KontaktMailEintrag, MailStatus } from "@/lib/mail/kontakt-mail";

const TONE: Record<MailStatus, "neutral" | "success" | "danger" | "warning" | "info"> = {
  versendet: "neutral",
  zugestellt: "success",
  nicht_zustellbar: "danger",
  abgemeldet: "warning",
  nicht_versendet: "danger",
  empfangen: "info",
};

export const mailWhen = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Inhalt eines E-Mail-Eintrags (ohne Zeitstempel, den setzt der Verlauf). */
export function MailEintrag({ mail }: { mail: KontaktMailEintrag }) {
  const eingang = mail.richtung === "eingang";
  const anhaenge = mail.anhaenge ?? [];
  return (
    <div className="min-w-0" data-mail-entry data-mail-status={mail.status} data-mail-automatic={mail.automatic ? "1" : "0"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {mail.automatic ? <Badge tone="info">automatisch</Badge> : null}
        <span className="text-xs font-medium text-[color:var(--muted)]">{mail.artLabel}</span>
        {mail.provider === "mailprogramm" ? <Badge tone="neutral">eigenes Mailprogramm</Badge> : <Badge tone={TONE[mail.status]}>{mail.statusLabel}</Badge>}
      </div>
      <p className="mt-0.5 break-words text-[15px] font-medium">{mail.subject}</p>
      <p className="break-all text-xs text-[color:var(--muted)]">
        {eingang ? "von" : "an"} {mail.to}
      </p>
      {mail.reason && (mail.status === "nicht_versendet" || mail.status === "nicht_zustellbar") ? (
        <p className="mt-0.5 break-words text-xs text-rose-700">Grund: {mail.reason}</p>
      ) : null}
      {eingang && mail.reason ? <p className="mt-0.5 break-words text-xs text-amber-700">{mail.reason}</p> : null}
      {anhaenge.length ? (
        <ul className="mt-1 flex flex-col gap-0.5" data-mail-anhaenge>
          {anhaenge.map((a, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted)]" aria-hidden />
              {a.link ? (
                <a href={a.link} className="inline-flex min-h-8 items-center break-all font-medium text-[color:var(--brand)] hover:underline">
                  {a.name}
                </a>
              ) : (
                <span className="break-all text-[color:var(--muted)]">{a.name} (aus Sicherheitsgründen nicht übernommen)</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <details className="group mt-1">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center text-xs font-medium text-[color:var(--brand)] hover:underline [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Text anzeigen</span>
          <span className="hidden group-open:inline">Text ausblenden</span>
        </summary>
        <div className="mt-1 whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken,#f1f5f9)] px-3 py-2 text-sm" data-mail-body>
          {mail.body}
        </div>
      </details>
    </div>
  );
}
