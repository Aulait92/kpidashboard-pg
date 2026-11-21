"use client";

// „Antwort zuordnen“ (Ole, 14.11.2026): Antworten auf Kampagnen-Mails landen im Postfach des Vermittlers
// (wir haben nur Senderechte). Absender-Adresse und Text einfügen; die App erkennt Interesse, Absage,
// Abmeldung, Abwesenheitsnotiz und Unzustellbarkeit und legt bei Interesse einen Lead an.

import Link from "next/link";
import { useActionState, useState } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { recordReplyAction, type ReplyState } from "@/app/buyer/bestand/actions";

const input = "mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm";

export function ReplyForm({ readOnly }: { readOnly: boolean }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(recordReplyAction, {});
  return (
    <form action={action} className="space-y-3 px-5 py-4 text-sm" data-reply-form>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        E-Mail-Adresse des Kunden
        <input name="fromEmail" type="email" required className={`${input} h-10`} placeholder="kunde@beispiel.de" />
      </label>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Betreff (optional)
        <input name="subject" className={`${input} h-10`} />
      </label>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Text der Antwort
        <textarea name="text" rows={4} className={`${input} py-2`} />
      </label>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Einordnung
        <select name="kind" defaultValue="" className={`${input} h-10 bg-white`}>
          <option value="">automatisch erkennen</option>
          <option value="interesse">Interesse (Lead anlegen)</option>
          <option value="negativ">kein Interesse</option>
          <option value="stop">bitte abmelden</option>
          <option value="auto">Abwesenheitsnotiz</option>
          <option value="bounce">unzustellbar</option>
        </select>
      </label>
      {state.error ? <p className="text-rose-700">{state.error}</p> : null}
      {state.message ? (
        <p className="text-emerald-700" data-reply-result>
          {state.message}{" "}
          {state.leadId ? (
            <Link href={`/buyer/leads/${state.leadId}`} className="font-semibold underline">
              Zum Lead
            </Link>
          ) : null}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="md" disabled={readOnly || pending}>
        {pending ? "Wird zugeordnet …" : "Antwort zuordnen"}
      </Button>
    </form>
  );
}

/**
 * „Antwort zuordnen“ hinter einem Knopf (Paket 2, 20.11.2026): Das Formular öffnet als Fenster (am Handy von unten),
 * statt offen auf der Seite zu stehen.
 */
export function ReplySheetButton({ readOnly }: { readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="md" icon={Inbox} onClick={() => setOpen(true)} data-reply-open>
        E-Mail-Antwort zuordnen
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="E-Mail-Antwort zuordnen"
        message="Antworten landen in Ihrem Postfach. Bei Interesse wird daraus ein Lead, „bitte abmelden“ sperrt E-Mails."
      >
        <ReplyForm readOnly={readOnly} />
      </Sheet>
    </>
  );
}
