// Dokumente vom Kunden (Policen per WhatsApp, Ole 18.11.2026) in der Terminvorbereitung: „3 Dokumente erhalten“ bzw.
// „Noch keine Dokumente“, je Dokument Öffnen und Herunterladen (kurzlebiger signierter Link, jeder Abruf protokolliert).
// Keine ausgelesenen Werte (keine KI). Gleiche Daten wie im Kontakt (components/lead-files.tsx).
// Ohne Zwei-Faktor-Login (AVV § 5) steht oben ein Hinweis als Link zur Einrichtung, die Namen sind dann keine Links;
// ungeprüfte Dateien (Virenprüfung steht aus) tragen „wird geprüft“.
// eingeklappt (neue Terminvorbereitung, Policen Paket 3, 19.11.2026): „Unterlagen (n)“ zum Aufklappen, ohne gelben Kasten;
// die Zwei-Faktor-Sperre steht direkt am Original-Link, die Begründung (AVV § 5) einmal unter der Liste.

import { ChevronDown, ChevronRight, Download, FileText, ShieldCheck } from "lucide-react";
import type { UnterlageView } from "@/lib/policen/server";
import { zweiFaktorHref } from "@/components/security/zwei-faktor-hinweis";

const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(iso));

export const dokumenteTitel = (n: number) => (n === 0 ? "Noch keine Dokumente vom Kunden" : n === 1 ? "1 Dokument erhalten" : `${n} Dokumente erhalten`);

/** Begründung der Zwei-Faktor-Pflicht (AVV § 5), gleich im Kasten und in der eingeklappten Liste. */
export const ZWEI_FAKTOR_TITEL = "Zum Öffnen Zwei-Faktor-Login einrichten";
/** Kurz am Link, gleich wie auf der Vertragsseite und im Spickzettel */
export const ZWEI_FAKTOR_KURZ = "Zum Öffnen Zwei-Faktor einrichten";
export const ZWEI_FAKTOR_GRUND = "Policen können Gesundheitsangaben enthalten. Einmal einrichten, dauert etwa eine Minute.";

export function UnterlagenVomKunden({
  leadId,
  unterlagen,
  titel = true,
  zurueck,
  eingeklappt = false,
  offen = false,
}: {
  leadId: string;
  unterlagen: UnterlageView[];
  titel?: boolean;
  zurueck?: string;
  /** „Unterlagen (n)“ zum Aufklappen, Zwei-Faktor-Hinweis am Link statt im gelben Kasten */
  eingeklappt?: boolean;
  /** eingeklappt: aufgeklappt starten (wenn die Liste die nächste Handlung ist) */
  offen?: boolean;
}) {
  const ohne2fa = unterlagen.some((u) => u.gesperrt === "zwei_faktor");
  const einrichten = zweiFaktorHref(zurueck ?? `/buyer/leads/${leadId}#dokumente`);
  if (eingeklappt) {
    if (!unterlagen.length) return null;
    return (
      <details id="unterlagen" open={offen} className="group" data-unterlagen-vorbereitung data-anzahl={unterlagen.length}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-[color:var(--muted)] [&::-webkit-details-marker]:hidden" data-unterlagen-auf>
          Unterlagen ({unterlagen.length})
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </summary>
        <ul className="divide-y divide-[color:var(--border)]">
          {unterlagen.map((u) => {
            const href = `/api/buyer/leads/${leadId}/unterlagen/${u.id}`;
            const name = u.sparte && !u.fileName.toLowerCase().includes(u.sparte.toLowerCase()) ? `${u.sparte} · ${u.fileName}` : u.fileName;
            const zweiFaktor = u.gesperrt === "zwei_faktor";
            return (
              <li key={u.id} className="flex min-h-11 items-center gap-2.5 py-1.5">
                {zweiFaktor ? <ShieldCheck className="h-4 w-4 shrink-0 text-[color:var(--brand)]" /> : <FileText className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />}
                {u.ansehen ? (
                  <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-[color:var(--brand)] hover:underline">
                    {name}
                  </a>
                ) : zweiFaktor ? (
                  <a href={einrichten} className="min-w-0 flex-1 font-medium text-[color:var(--brand)] hover:underline" data-zwei-faktor-einrichten>
                    <span className="block truncate">{name}</span>
                    <span className="block text-xs font-normal text-[color:var(--muted)]">{ZWEI_FAKTOR_KURZ}</span>
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                )}
                <span className="shrink-0 text-xs text-[color:var(--muted)]">{u.gesperrt === "pruefung" ? "wird geprüft" : day(u.createdAt)}</span>
                {u.ansehen ? (
                  <a href={`${href}?download=1`} aria-label={`${u.fileName} herunterladen`} className="-mr-1.5 shrink-0 rounded-full p-2 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken,#f1f5f9)] hover:text-[color:var(--brand)]">
                    <Download className="h-4 w-4" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
        {ohne2fa ? <p className="pb-1 text-xs text-[color:var(--muted)]" data-zwei-faktor-hinweis>{ZWEI_FAKTOR_GRUND}</p> : null}
      </details>
    );
  }
  return (
    <div data-unterlagen-vorbereitung data-anzahl={unterlagen.length}>
      {titel ? <h3 className="mb-1 text-[13px] font-semibold text-[color:var(--muted)]">{dokumenteTitel(unterlagen.length)}</h3> : null}
      {/* Kompakt statt gelbem Kasten mit blauem Knopf (UX-Runde Team C, 19.11.2026): die Hauptaktion der Terminvorbereitung
          ist „Präsentation öffnen“; Titel und Begründung bleiben gleich (AVV § 5), ein Tipp führt zur Einrichtung */}
      {ohne2fa ? (
        <a
          href={einrichten}
          className="mb-1 flex min-h-11 items-center gap-2.5 rounded-[var(--radius-md)] bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-inset ring-amber-200 hover:bg-amber-100"
          data-zwei-faktor-hinweis
          data-zwei-faktor-einrichten
        >
          <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{ZWEI_FAKTOR_TITEL}</span>
            <span className="block text-xs text-amber-800">{ZWEI_FAKTOR_GRUND}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </a>
      ) : null}
      {unterlagen.length ? (
        <ul className="divide-y divide-[color:var(--border)]">
          {unterlagen.map((u) => {
            const href = `/api/buyer/leads/${leadId}/unterlagen/${u.id}`;
            // Sparte (laut Dateiname, keine KI) nur, wenn der Dateiname sie nicht schon nennt
            const name = u.sparte && !u.fileName.toLowerCase().includes(u.sparte.toLowerCase()) ? `${u.sparte} · ${u.fileName}` : u.fileName;
            return (
              <li key={u.id} className="flex min-h-11 items-center gap-2.5 py-1.5">
                <FileText className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
                {u.ansehen ? (
                  <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-[color:var(--brand)] hover:underline">
                    {name}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                )}
                <span className="shrink-0 text-xs text-[color:var(--muted)]">{u.gesperrt === "pruefung" ? "wird geprüft" : day(u.createdAt)}</span>
                {u.ansehen ? (
                  <a href={`${href}?download=1`} aria-label={`${u.fileName} herunterladen`} className="-mr-1.5 shrink-0 rounded-full p-2 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken,#f1f5f9)] hover:text-[color:var(--brand)]">
                    <Download className="h-4 w-4" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[color:var(--muted)]">Ihr Assistent bittet vor dem Termin darum. Sonst bringt Ihr Kunde sie zum Termin mit.</p>
      )}
    </div>
  );
}
