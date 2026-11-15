"use client";

// Link zur Vertriebspräsentation für den Interessenten (nach dem Gespräch): 14 Tage, ohne Sprechzettel, beendbar.

import { useState, useTransition } from "react";
import { Copy, Link2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { verkaufsLinkAction, verkaufsLinkBeendenAction } from "./actions";

export function VerkaufsLinkKarte({
  contactId,
  audience,
  start,
  aufrufe,
}: {
  contactId: string;
  audience: string;
  start: { url: string; bis: string } | null;
  aufrufe: string[];
}) {
  const [link, setLink] = useState(start);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const kopieren = (url: string) =>
    navigator.clipboard?.writeText(url).then(
      () => setMsg("Link kopiert"),
      () => setMsg("Bitte den Link markieren und kopieren."),
    );
  const erstellen = () =>
    run(async () => {
      const r = await verkaufsLinkAction(contactId, audience);
      if (r.ok) {
        setLink({ url: r.url, bis: r.bis });
        setMsg(link ? "Link verlängert" : "Link erstellt");
      } else setMsg(r.error);
    });
  return (
    <section className="card p-4" data-verkaufslink>
      <h2 className="font-medium">Link für den Interessenten</h2>
      <p className="mt-1 text-sm text-slate-600">
        Die Präsentation zum Nachklicken nach dem Gespräch, mit den Preisen aus dem Angebot. 14 Tage gültig. Auch als Häkchen beim Versand des Angebots.
      </p>
      {link ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={link.url} onFocus={(e) => e.target.select()} className="input min-w-0 flex-1" aria-label="Link zur Präsentation" />
            <Button variant="primary" size="md" icon={Copy} onClick={() => kopieren(link.url)}>
              Kopieren
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>Gültig bis {link.bis}.</span>
            <button type="button" className="inline-flex items-center gap-1 hover:text-slate-800" disabled={pending} onClick={erstellen}>
              <RefreshCw className="h-3.5 w-3.5" /> Um 14 Tage verlängern
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-rose-700"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await verkaufsLinkBeendenAction(contactId);
                  if (r.ok) {
                    setLink(null);
                    setMsg("Link beendet");
                  } else setMsg(r.error ?? "Fehler");
                })
              }
            >
              <XCircle className="h-3.5 w-3.5" /> Link beenden
            </button>
          </div>
        </div>
      ) : (
        <Button className="mt-3" variant="secondary" size="md" icon={Link2} disabled={pending} onClick={erstellen}>
          Link erstellen
        </Button>
      )}
      {msg ? <p className="mt-2 text-xs font-medium text-emerald-700">{msg}</p> : null}
      <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500" data-verkaufs-aufrufe>
        {aufrufe.length ? (
          <ul className="space-y-0.5">
            {aufrufe.map((a) => (
              <li key={a}>Präsentation geöffnet am {a}</li>
            ))}
          </ul>
        ) : (
          "Noch nicht geöffnet."
        )}
      </div>
    </section>
  );
}
