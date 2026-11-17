// Unterlagen vom Kunden (Policen per WhatsApp, Ole 17.11.2026) in der Terminvorbereitung: kurz, mit ausgelesenen
// Vertragsdaten bei Sachversicherungen und Kennzeichen bei möglichen Gesundheitsangaben. Gleiche Darstellung wie im
// Kontakt (components/lead-files.tsx).

import { FileText } from "lucide-react";
import type { UnterlageView } from "@/lib/policen/server";

const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

export function UnterlagenVomKunden({ leadId, unterlagen, titel = true }: { leadId: string; unterlagen: UnterlageView[]; titel?: boolean }) {
  if (!unterlagen.length) return null;
  return (
    <div data-unterlagen-vorbereitung>
      {titel ? <h3 className="mb-1 text-[13px] font-semibold text-[color:var(--muted)]">Unterlagen vom Kunden</h3> : null}
      <ul className="space-y-2">
        {unterlagen.map((u) => (
          <li key={u.id} className="flex gap-2.5">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand)]" />
            <div className="min-w-0">
              {u.ansehen ? (
                <a href={`/api/buyer/leads/${leadId}/unterlagen/${u.id}`} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] hover:underline">
                  {u.sparte ?? u.fileName}
                </a>
              ) : (
                <span className="font-medium">{u.sparte ?? u.fileName}</span>
              )}
              {u.auszug ? <span className="block text-[color:var(--muted)]">{u.auszug}</span> : null}
              {u.gesundheit ? (
                <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                  Gesundheitsangaben möglich{u.consentAt ? `, mit Einwilligung vom ${day(u.consentAt)}` : ""}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
