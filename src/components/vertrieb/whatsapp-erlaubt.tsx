"use client";

import { useState, useTransition } from "react";
import { setWhatsappErlaubtAction } from "@/app/admin/vertrieb/actions";
import { WHATSAPP_ERLAUBT_HINWEIS, type WhatsappErlaubtQuelle } from "@/lib/vertrieb/bonus-erinnerung";

/**
 * „WhatsApp erlaubt“ an der Telefonnummer in der Kontaktakte (Ole, 18.11.2026): Voraussetzung für die WhatsApp am
 * letzten Tag des Abschlussbonus. Automatisch an, wenn der Kontakt Terminnachrichten per WhatsApp bekommen oder selbst
 * geschrieben hat; ein Klick setzt es von Hand (gilt dann statt der Automatik).
 */
export function WhatsappErlaubt({ contactId, erlaubt, quelle }: { contactId: string; erlaubt: boolean; quelle: WhatsappErlaubtQuelle }) {
  const [wert, setWert] = useState(erlaubt);
  const [herkunft, setHerkunft] = useState(quelle);
  const [pending, start] = useTransition();
  const hinweis = herkunft && herkunft !== "manuell" ? WHATSAPP_ERLAUBT_HINWEIS[herkunft] : null;
  return (
    <label className="mt-1 flex min-h-10 cursor-pointer items-start gap-2 py-1 text-xs sm:min-h-0 sm:py-0" data-whatsapp-erlaubt>
      <input
        type="checkbox"
        className="mt-px h-4 w-4 shrink-0"
        checked={wert}
        disabled={pending}
        onChange={(e) => {
          const neu = e.target.checked;
          setWert(neu);
          setHerkunft("manuell");
          start(async () => {
            const res = await setWhatsappErlaubtAction(contactId, neu).catch(() => ({ ok: false as const, error: "Speichern fehlgeschlagen." }));
            if (!res.ok) {
              setWert(!neu);
              setHerkunft(quelle);
              alert(res.error);
            }
          });
        }}
      />
      <span>
        WhatsApp erlaubt
        {hinweis ? <span className="block text-[color:var(--muted)]">{hinweis}</span> : null}
      </span>
    </label>
  );
}
