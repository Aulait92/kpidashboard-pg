"use client";

import { useState, useTransition } from "react";
import { setNieKontaktierenAction } from "@/app/admin/vertrieb/actions";
import { SPERR_GRUND_LABEL, istSperrGrund } from "@/lib/vertrieb/nie-kontaktieren";

/**
 * „Nie kontaktieren“ an der E-Mail-Adresse in der Kontaktakte (Ole, 19.11.2026). Automatisch gesetzt bei Austragung,
 * Widerspruch, Datenschutzfrage oder Abmeldung in Instantly; ein Klick setzt bzw. hebt es von Hand auf.
 */
export function NieKontaktieren({ contactId, seit, grund }: { contactId: string; seit: Date | null; grund: string | null }) {
  const [an, setAn] = useState(!!seit);
  const [pending, start] = useTransition();
  const hinweis = an && seit ? `${istSperrGrund(grund) ? SPERR_GRUND_LABEL[grund] : "gesperrt"}, seit ${new Date(seit).toLocaleDateString("de-DE")}` : null;
  return (
    <label className="mt-1 flex min-h-10 cursor-pointer items-start gap-2 py-1 text-xs sm:min-h-0 sm:py-0" data-nie-kontaktieren>
      <input
        type="checkbox"
        className="mt-px h-4 w-4 shrink-0"
        checked={an}
        disabled={pending}
        onChange={(e) => {
          const neu = e.target.checked;
          if (!neu && !confirm("Sperre aufheben? Die Adresse bleibt auf der Instantly-Blocklist.")) return;
          setAn(neu);
          start(async () => {
            const res = await setNieKontaktierenAction(contactId, neu).catch(() => ({ ok: false as const, error: "Speichern fehlgeschlagen." }));
            if (!res.ok) {
              setAn(!neu);
              alert(res.error);
            }
          });
        }}
      />
      <span className={an ? "font-medium text-rose-700" : undefined}>
        Nie kontaktieren
        {hinweis ? <span className="block font-normal text-[color:var(--muted)]">{hinweis}</span> : null}
      </span>
    </label>
  );
}
