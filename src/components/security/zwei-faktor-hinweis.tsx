// Hinweis „Zum Öffnen Zwei-Faktor-Login einrichten“ (AVV-Ergänzung § 5, Ole 18.11.2026): erscheint bei den Unterlagen
// vom Kunden (Kontakt, Terminvorbereitung) und auf der Freischaltkarte, solange der Login keinen Zwei-Faktor-Login hat.
// Eine Aktion: zur Einrichtungsseite (QR-Code, Notfall-Codes) und danach zurück. Ohne Hooks, auch in Client-Komponenten.

import { ShieldCheck } from "lucide-react";
import { buttonClass } from "@/components/ui";

export const zweiFaktorHref = (zurueck: string) => `/buyer/konto/sicherheit/zwei-faktor?zurueck=${encodeURIComponent(zurueck)}`;

export function ZweiFaktorHinweis({ zurueck, titel = "Zum Öffnen Zwei-Faktor-Login einrichten", text = "Policen können Gesundheitsangaben enthalten. Einmal einrichten, dauert etwa eine Minute.", className }: {
  zurueck: string;
  titel?: string;
  text?: string;
  className?: string;
}) {
  return (
    <div className={`flex gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3.5 ${className ?? ""}`} data-zwei-faktor-hinweis>
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{titel}</p>
        <p className="mt-0.5 text-sm text-[color:var(--muted)]">{text}</p>
        <a href={zweiFaktorHref(zurueck)} className={buttonClass("primary", "md", "mt-2.5 w-full sm:w-auto")} data-zwei-faktor-einrichten>
          Jetzt einrichten
        </a>
      </div>
    </div>
  );
}
