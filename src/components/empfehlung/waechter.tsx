// Bewertungs-Wächter im Modul „Empfehlungen & Bewertungen“: Verbindung zum
// Google-Unternehmensprofil, neue Bewertungen mit KI-Antwortvorschlag, Auswertung.

import Link from "next/link";
import { AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";
import { Card, CardHeader, buttonClass } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { REPORT_HELP_URL, fallbackReply, listLocations, waechterStats } from "@/lib/empfehlung/google-business";
import { advisorDisplayName } from "@/lib/whatsapp/template-plan";
import { fmtDate } from "@/lib/empfehlung/shared";
import { disconnectGbpAction } from "@/app/buyer/empfehlungen/actions";
import { LocationPicker, ReplyEditor } from "@/components/empfehlung/client";

const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
const monthLabel = (ym: string) => new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

function Pending({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-gbp-pending>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}

export async function WaechterSection({ customerId, readOnly, flash }: { customerId: string; readOnly: boolean; flash: string | null }) {
  const conn = await prisma.googleBusinessConnection.findUnique({ where: { customerId } });
  const guide = (
    <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Unberechtigte Bewertung? So melden Sie sie bei Google</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[color:var(--muted)]">
        <li>Melden Sie nur Bewertungen, die gegen Googles Richtlinien verstoßen (z. B. Spam, Beleidigung, Interessenkonflikt, nie Kunde gewesen). Kritik allein ist kein Grund.</li>
        <li>Im Google-Unternehmensprofil „Rezensionen lesen“ öffnen, bei der Bewertung „Melden“ wählen und den Grund angeben.</li>
        <li>Den Stand sehen Sie im Tool zur Rezensionsverwaltung von Google; wird nicht gelöscht, ist einmal ein Einspruch möglich.</li>
        <li>Antworten Sie trotzdem sachlich und ohne Vertragsdetails – das lesen auch künftige Kunden.</li>
      </ol>
      <a href={REPORT_HELP_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-[color:var(--brand)] hover:underline">
        Offizielle Google-Hilfe: Unangemessene Rezensionen melden <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </details>
  );

  let body: React.ReactNode;
  if (!conn) {
    body = (
      <div className="space-y-3 text-sm">
        <p>
          Verbinden Sie Ihr Google-Unternehmensprofil: Bei jeder neuen Bewertung bekommen Sie eine Push-Nachricht, bei 1–3 Sternen sofort eine Aufgabe.
          Die KI schlägt eine sachliche Antwort vor, die Sie bearbeiten und mit einem Klick veröffentlichen. Nichts geht automatisch raus.
        </p>
        {flash === "fehler" || flash === "abgelehnt" ? <p className="font-medium text-rose-700">Die Verbindung hat nicht geklappt. Bitte noch einmal versuchen und den Zugriff erlauben.</p> : null}
        {readOnly ? null : (
          <a href="/api/google/business/connect" className={buttonClass("primary", "md")} data-gbp-connect>
            Google-Unternehmensprofil verbinden
          </a>
        )}
      </div>
    );
  } else if (conn.status === "no_access") {
    body = <Pending text="Bewertungs-Wächter wird freigeschaltet: Die Google-Schnittstelle für Unternehmensprofile ist für uns noch nicht freigegeben. Sobald Google zustimmt, startet der Abgleich automatisch – Sie müssen nichts tun." />;
  } else if (conn.status === "pending_location" || !conn.locationName) {
    const r = await listLocations(customerId);
    body = r.ok ? (
      r.locations.length ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Welcher Standort?</p>
          <LocationPicker locations={r.locations} readOnly={readOnly} />
        </div>
      ) : (
        <p className="text-sm text-[color:var(--muted)]">In diesem Google-Konto ist kein Unternehmensprofil. Bitte mit dem Konto verbinden, das Ihr Profil verwaltet.</p>
      )
    ) : r.noAccess ? (
      <Pending text="Bewertungs-Wächter wird freigeschaltet: Die Google-Schnittstelle für Unternehmensprofile ist für uns noch nicht freigegeben. Sobald Google zustimmt, geht es hier weiter." />
    ) : (
      <p className="text-sm text-rose-700">{r.error}</p>
    );
  } else {
    const [s, reviews, cust] = await Promise.all([
      waechterStats(customerId),
      prisma.googleReview.findMany({ where: { customerId }, orderBy: { reviewedAt: "desc" }, take: 20, include: { lead: { select: { id: true, name: true } } } }),
      prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } }),
    ]);
    const vertreter = advisorDisplayName(cust?.name ?? "");
    const max = Math.max(1, ...s.months.map((m) => m.count));
    body = (
      <div className="space-y-4 text-sm">
        <p className="text-[color:var(--muted)]">
          Verbunden: <span className="font-medium text-[color:var(--foreground)]">{conn.locationTitle}</span>
          {conn.lastSyncAt ? ` · zuletzt abgeglichen ${fmtDate(conn.lastSyncAt)}` : ""}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-gbp-stats>
          <Tile k="Durchschnitt" v={s.average != null ? `${s.average.toLocaleString("de-DE")} ★` : "–"} sub={s.start?.average != null ? `beim Start ${s.start.average.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ★` : undefined} />
          <Tile k="Bewertungen" v={String(s.count)} sub={s.start ? `${s.newSinceStart} neu seit Modulstart` : undefined} />
          <Tile k="Antwortquote" v={s.replyRate != null ? `${s.replyRate} %` : "–"} />
          <Tile k="Offen (1–3 ★)" v={String(s.unansweredBad)} warn={s.unansweredBad > 0} />
        </div>
        <div>
          <div className="text-xs font-medium text-[color:var(--muted)]">Neue Bewertungen pro Monat</div>
          <div className="mt-2 flex h-20 items-end gap-2" aria-label="Neue Bewertungen pro Monat">
            {s.months.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-[color:var(--brand)]/70" style={{ height: `${Math.max(4, (m.count / max) * 60)}px` }} title={`${m.count}`} />
                <span className="text-[10px] text-[color:var(--muted)]">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]" data-gbp-reviews>
          {reviews.map((r) => (
            <li key={r.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={r.stars <= 3 ? "text-rose-600" : "text-amber-500"} aria-label={`${r.stars} Sterne`}>
                  {stars(r.stars)}
                </span>
                <span className="font-medium">{r.reviewerName ?? "Google-Nutzer"}</span>
                <span className="text-xs text-[color:var(--muted)]">{fmtDate(r.reviewedAt)}</span>
                {r.lead ? (
                  <Link href={`/buyer/leads/${r.lead.id}`} className="text-xs font-semibold text-[color:var(--brand)] hover:underline">
                    Kontakt öffnen
                  </Link>
                ) : null}
              </div>
              {r.text ? <p>{r.text}</p> : <p className="text-[color:var(--muted)]">Ohne Text.</p>}
              {r.replyText ? (
                <p className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-xs">
                  <span className="font-medium">Ihre Antwort:</span> {r.replyText}
                </p>
              ) : (
                <ReplyEditor reviewId={r.id} suggestion={r.suggestedReply ?? fallbackReply(r.stars, vertreter)} readOnly={readOnly} />
              )}
            </li>
          ))}
          {!reviews.length ? <li className="px-4 py-3 text-[color:var(--muted)]">Noch keine Bewertungen abgeglichen.</li> : null}
        </ul>
      </div>
    );
  }

  return (
    <Card>
      <div id="bewertungen" className="scroll-mt-20" />
      <CardHeader title="Bewertungs-Wächter (Google)" icon={ShieldCheck} />
      <div className="space-y-4 px-5 pb-5 pt-4">
        {flash === "verbunden" ? <p className="text-sm font-medium text-emerald-700">Verbunden. Bitte noch den Standort wählen.</p> : null}
        {body}
        {guide}
        {conn && !readOnly ? (
          <form action={disconnectGbpAction}>
            <button className="text-xs text-[color:var(--muted)] underline">Verbindung trennen (abgeglichene Bewertungen werden gelöscht)</button>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

function Tile({ k, v, sub, warn }: { k: string; v: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-md)] border p-3 ${warn ? "border-rose-200 bg-rose-50" : "border-[color:var(--border)] bg-white"}`}>
      <div className="text-2xl font-semibold tabular-nums">{v}</div>
      <div className="text-xs font-medium">{k}</div>
      {sub ? <div className="text-[11px] text-[color:var(--muted)]">{sub}</div> : null}
    </div>
  );
}
