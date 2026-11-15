"use client";

// E-Mail-Verlauf eines Bestandskunden (Ole, 15.11.2026): Knopf in der Kundenliste (nur bei Kunden mit E-Mails),
// öffnet ein Fenster mit allen E-Mails an diesen Kunden (Einträge wie im Lead-Verlauf, components/mail-verlauf.tsx).

import { useState, useTransition } from "react";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { MailEintrag, mailWhen } from "@/components/mail-verlauf";
import type { KontaktMailEintrag } from "@/lib/mail/kontakt-mail";
import { bestandMailVerlaufAction } from "@/app/buyer/bestand/actions";

/** Knopf „Verlauf“ in der Bestandsliste: E-Mails an diesen Bestandskunden (Sheet, lädt beim Öffnen). */
export function BestandMailVerlauf({ existingCustomerId, name }: { existingCustomerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [mails, setMails] = useState<KontaktMailEintrag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const show = () => {
    setOpen(true);
    start(async () => {
      const res = await bestandMailVerlaufAction(existingCustomerId);
      if (res.ok) {
        setMails(res.mails);
        setError(null);
      } else setError(res.error);
    });
  };
  return (
    <>
      <span title="E-Mail-Verlauf" className="inline-flex">
        <Button icon={History} className="h-9 w-9 px-0" aria-label={`E-Mail-Verlauf von ${name}`} onClick={show} data-bestand-mail-verlauf />
      </span>
      <Sheet open={open} onClose={() => setOpen(false)} title={name} message="E-Mails an diesen Kunden, neueste zuerst">
        <div className="max-h-[65vh] overflow-y-auto" data-bestand-mail-sheet>
          {pending && !mails ? (
            <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin text-[color:var(--muted)]" />
          ) : error ? (
            <p className="px-5 py-4 text-sm text-rose-700">{error}</p>
          ) : !mails?.length ? (
            <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Noch keine E-Mails.</p>
          ) : (
            <ol className="divide-y divide-[color:var(--border)]">
              {mails.map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <MailEintrag mail={m} />
                  <p className="mt-0.5 text-xs text-[color:var(--muted)]">{mailWhen(m.at)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Sheet>
    </>
  );
}
