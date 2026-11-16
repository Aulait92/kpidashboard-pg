"use client";

// Kundenlink (Ole, 15.11.2026): der Stand aus dem Termin zum Nachlesen, 14 Tage gültig, ohne Schalter und Sprechzettel.

import { useState, useTransition } from "react";
import { Copy, Link2, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { kundenlinkAction, kundenlinkBeendenAction } from "./actions";

export function Kundenlink({ id, start, bereit }: { id: string; start: { url: string; bis: string } | null; bereit: boolean }) {
  const toast = useToast();
  const [link, setLink] = useState(start);
  const [pending, run] = useTransition();
  const kopieren = (url: string) =>
    navigator.clipboard?.writeText(url).then(
      () => toast.show({ message: "Link kopiert" }),
      () => toast.show({ message: "Bitte den Link markieren und kopieren.", tone: "error" }),
    );
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-4" data-kundenlink-karte>
      <div className="text-sm font-semibold">Link für Ihren Kunden</div>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        Ihr Kunde liest die Präsentation mit Ihrer Auswahl 14 Tage lang nach.
      </p>
      {link ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={link.url} onFocus={(e) => e.target.select()} className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 text-sm" aria-label="Link für den Kunden" />
            <Button variant="secondary" size="md" icon={Copy} onClick={() => kopieren(link.url)}>
              Kopieren
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
            <span>Gültig bis {link.bis}.</span>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1 hover:text-rose-700"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await kundenlinkBeendenAction(id);
                  if (r.ok) {
                    setLink(null);
                    toast.show({ message: "Link beendet" });
                  } else toast.show({ message: r.error ?? "Fehler", tone: "error" });
                })
              }
            >
              <XCircle className="h-3.5 w-3.5" /> Link beenden
            </button>
          </div>
        </div>
      ) : (
        <Button
          className="mt-3"
          variant="secondary"
          size="md"
          icon={Link2}
          disabled={pending || !bereit}
          onClick={() =>
            run(async () => {
              const r = await kundenlinkAction(id);
              if (r.ok) setLink({ url: r.url, bis: r.bis });
              else toast.show({ message: r.error, tone: "error" });
            })
          }
        >
          Link erstellen
        </Button>
      )}
      {!bereit ? <p className="mt-2 text-xs text-[color:var(--muted)]">Erst mit bestätigten Angeboten möglich.</p> : null}
    </div>
  );
}
