// Dokumente vom Kunden (Policen per WhatsApp, Ole 18.11.2026) in der Terminvorbereitung: „3 Dokumente erhalten“ bzw.
// „Noch keine Dokumente“, je Dokument Öffnen und Herunterladen (kurzlebiger signierter Link, jeder Abruf protokolliert).
// Keine ausgelesenen Werte (keine KI). Gleiche Daten wie im Kontakt (components/lead-files.tsx).
// Ohne Zwei-Faktor-Login (AVV § 5) steht oben ein Hinweis mit „Jetzt einrichten“, die Namen sind dann keine Links;
// ungeprüfte Dateien (Virenprüfung steht aus) tragen „wird geprüft“.

import { Download, FileText } from "lucide-react";
import type { UnterlageView } from "@/lib/policen/server";
import { ZweiFaktorHinweis } from "@/components/security/zwei-faktor-hinweis";

const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(iso));

export const dokumenteTitel = (n: number) => (n === 0 ? "Noch keine Dokumente vom Kunden" : n === 1 ? "1 Dokument erhalten" : `${n} Dokumente erhalten`);

export function UnterlagenVomKunden({ leadId, unterlagen, titel = true, zurueck }: { leadId: string; unterlagen: UnterlageView[]; titel?: boolean; zurueck?: string }) {
  const ohne2fa = unterlagen.some((u) => u.gesperrt === "zwei_faktor");
  return (
    <div data-unterlagen-vorbereitung data-anzahl={unterlagen.length}>
      {titel ? <h3 className="mb-1 text-[13px] font-semibold text-[color:var(--muted)]">{dokumenteTitel(unterlagen.length)}</h3> : null}
      {ohne2fa ? <ZweiFaktorHinweis zurueck={zurueck ?? `/buyer/leads/${leadId}#dokumente`} className="mb-2" /> : null}
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
