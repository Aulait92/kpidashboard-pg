"use client";

// E-Mail im Kontaktverlauf (Ole, 15.11.2026): Art (mit Kennzeichen „automatisch“), Zustellstatus, Betreff und
// Empfänger auf einen Blick; der Text ist eingeklappt (Klick auf „Text anzeigen“), als reiner Text.
// Genutzt im Lead-Verlauf (components/lead-history.tsx) und im Verlauf eines Bestandskunden.

import { Badge } from "@/components/ui";
import type { KontaktMailEintrag, MailStatus } from "@/lib/mail/kontakt-mail";

const TONE: Record<MailStatus, "neutral" | "success" | "danger" | "warning"> = {
  versendet: "neutral",
  zugestellt: "success",
  nicht_zustellbar: "danger",
  abgemeldet: "warning",
  nicht_versendet: "danger",
};

export const mailWhen = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Inhalt eines E-Mail-Eintrags (ohne Zeitstempel, den setzt der Verlauf). */
export function MailEintrag({ mail }: { mail: KontaktMailEintrag }) {
  return (
    <div className="min-w-0" data-mail-entry data-mail-status={mail.status} data-mail-automatic={mail.automatic ? "1" : "0"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {mail.automatic ? <Badge tone="info">automatisch</Badge> : null}
        <span className="text-xs font-medium text-[color:var(--muted)]">{mail.artLabel}</span>
        {mail.provider === "mailprogramm" ? <Badge tone="neutral">eigenes Mailprogramm</Badge> : <Badge tone={TONE[mail.status]}>{mail.statusLabel}</Badge>}
      </div>
      <p className="mt-0.5 break-words text-[15px] font-medium">{mail.subject}</p>
      <p className="break-all text-xs text-[color:var(--muted)]">an {mail.to}</p>
      {mail.reason && (mail.status === "nicht_versendet" || mail.status === "nicht_zustellbar") ? (
        <p className="mt-0.5 break-words text-xs text-rose-700">Grund: {mail.reason}</p>
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
