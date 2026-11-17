"use client";

// „Angaben zum Lead“ korrigieren (Ole, 14.11.2026): Stift im Kartenkopf öffnet ein Fenster
// (Handy: von unten) mit Anrede, Name, Telefon, E-Mail und Adresse.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { saveLeadStammdatenAction } from "@/app/buyer/stammdaten-actions";
import type { StammdatenInput } from "@/lib/lead-stammdaten";

const FIELDS: { key: keyof StammdatenInput & string; label: string; type?: string; autoComplete?: string; inputMode?: "tel" | "email" | "numeric" }[] = [
  { key: "firstName", label: "Vorname", autoComplete: "off" },
  { key: "lastName", label: "Nachname", autoComplete: "off" },
  { key: "phone", label: "Telefon", type: "tel", inputMode: "tel", autoComplete: "off" },
  { key: "email", label: "E-Mail", type: "email", inputMode: "email", autoComplete: "off" },
  { key: "weitereEmails", label: "Weitere E-Mail", inputMode: "email", autoComplete: "off" },
  { key: "street", label: "Straße und Hausnummer", autoComplete: "off" },
  { key: "zip", label: "Postleitzahl", inputMode: "numeric", autoComplete: "off" },
  { key: "city", label: "Ort", autoComplete: "off" },
];

export function LeadStammdatenEdit({ leadId, initial }: { leadId: string; initial: StammdatenInput }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<StammdatenInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const openSheet = () => {
    setValues(initial);
    setError(null);
    setOpen(true);
  };
  // „Angaben ändern“ aus den Erklärungen der Aktionsknöpfe (components/lead-actions.tsx)
  useEffect(() => {
    const h = () => openSheet();
    window.addEventListener("pg:stammdaten-open", h);
    return () => window.removeEventListener("pg:stammdaten-open", h);
  });
  const set = (k: keyof StammdatenInput, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveLeadStammdatenAction(leadId, values);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      toast.show({ message: r.changed.length ? ["Angaben gespeichert.", ...r.hinweise].join(" ") : "Keine Änderung." });
      router.refresh();
    });

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="-my-2 inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-sm font-medium text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]"
        aria-label="Angaben bearbeiten"
        data-stammdaten-bearbeiten
      >
        <Pencil className="h-4 w-4" /> <span className="hidden sm:inline">Bearbeiten</span>
      </button>
      <Sheet open={open} onClose={() => !pending && setOpen(false)} title="Angaben bearbeiten" message="Zum Beispiel Tippfehler in Name, Nummer oder E-Mail. Die ursprünglichen Formularantworten bleiben erhalten.">
        <form
          className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-[color:var(--muted)]">Anrede</span>
            <select className="input w-full" value={values.salutation} onChange={(e) => set("salutation", e.target.value)}>
              <option value="">Keine Angabe</option>
              <option value="Frau">Frau</option>
              <option value="Herr">Herr</option>
            </select>
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="mb-1 block text-[color:var(--muted)]">{f.label}</span>
              <input
                className="input w-full"
                type={f.type ?? "text"}
                inputMode={f.inputMode}
                autoComplete={f.autoComplete}
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </label>
          ))}
          <p className="text-xs text-[color:var(--muted)]">Ändern Sie die Telefonnummer, laufen WhatsApp-Nachrichten ab jetzt über die neue Nummer.</p>
          {error ? <p className="rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)} disabled={pending}>
              Abbrechen
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Speichern
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
