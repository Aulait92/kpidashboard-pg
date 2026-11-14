"use client";

// „Letzten Import rückgängig machen“ (nur Inhaber): kurze Bestätigung im Auswahlfenster.
// Gelöscht werden nur Kunden, die dieser Import angelegt hat; angeschriebene oder gesperrte bleiben.

import { useActionState, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { undoImportAction, type UndoState } from "@/app/buyer/bestand/actions";

const fmt = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const de = (n: number) => n.toLocaleString("de-DE");

export function ImportUndoButton({
  run,
  readOnly,
}: {
  run: { createdAt: string; fileName: string | null; created: number; updated: number; removable: number };
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<UndoState, FormData>(undoImportAction, {});
  if (state.ok) {
    return (
      <p className="text-sm font-medium text-emerald-700" data-import-undone>
        {state.message}
      </p>
    );
  }
  return (
    <>
      <Button icon={Undo2} disabled={readOnly} onClick={() => setOpen(true)} data-import-undo>
        Letzten Import rückgängig machen
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Letzten Import rückgängig machen" message={`Import vom ${fmt(run.createdAt)}${run.fileName ? ` (${run.fileName})` : ""}`}>
        <form action={action} className="space-y-3 px-5 py-4 text-sm" data-import-undo-dialog>
          <p>
            <b>{de(run.removable)} Kunden</b>, die dieser Import neu angelegt hat, werden mit ihren Verträgen gelöscht.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[color:var(--muted)]">
            <li>Kunden, die schon angeschrieben wurden oder „Stopp“ geschrieben haben, bleiben erhalten.</li>
            {run.updated ? <li>{de(run.updated)} Kunden hat der Import nur aktualisiert: Sie bleiben im neuen Stand.</li> : null}
            <li>Danach können Sie die Liste mit der richtigen Zuordnung neu hochladen.</li>
          </ul>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4" />
            <span>Ich möchte diese {de(run.removable)} Kunden löschen.</span>
          </label>
          {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
          <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending || readOnly}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Import rückgängig machen
          </Button>
        </form>
      </Sheet>
    </>
  );
}
