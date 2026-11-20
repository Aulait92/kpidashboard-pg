"use client";

// Vorschau der Angebotsmail vor dem Versand (Ole, 20.11.2026): „Per E-Mail senden“ öffnet dieses Fenster mit genau
// der Mail, die rausgeht (An, Betreff, Anhang, gerenderte HTML-Mail). Hauptaktion „Jetzt senden“.

import { useEffect, useState } from "react";
import { Loader2, Paperclip, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { previewOfferEmailAction, type OfferMailExtras, type OfferMailPreview } from "@/app/admin/vertrieb/offer-actions";

/** Ganze HTML-Seite für das iframe: Links öffnen in einem neuen Tab, kein eigener Rand. */
export function vorschauDokument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;background:#fff}</style></head><body>${html}</body></html>`;
}

export function AngebotMailVorschau({
  offerId,
  extras,
  onClose,
  onSend,
  sending,
}: {
  offerId: string;
  extras: OfferMailExtras;
  onClose: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  // Ergebnis mit dem Optionen-Schlüssel, für den es geladen wurde: weicht er ab, lädt die Vorschau gerade neu
  const [stand, setStand] = useState<{ fuer: string; r: OfferMailPreview } | null>(null);
  const [hoehe, setHoehe] = useState(480);
  const schluessel = JSON.stringify(extras);

  // Bei jeder Änderung der Optionen neu laden (gleiche Optionen wie beim Senden)
  useEffect(() => {
    let aktuell = true;
    previewOfferEmailAction(offerId, JSON.parse(schluessel) as OfferMailExtras)
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Vorschau konnte nicht geladen werden." }))
      .then((r) => {
        if (aktuell) setStand({ fuer: schluessel, r });
      });
    return () => {
      aktuell = false;
    };
  }, [offerId, schluessel]);

  const vorschau = stand?.r ?? null;
  const laedt = stand?.fuer !== schluessel;
  const ok = vorschau?.ok ? vorschau : null;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Angebot per E-Mail"
      footer={
        <div className="flex shrink-0 flex-col gap-1.5 border-t border-[color:var(--border)] px-5 py-3" data-angebot-mail-fuss>
          <Button variant="primary" icon={Send} className="h-11 w-full text-[15px]" disabled={!ok || laedt || sending} onClick={onSend} data-angebot-jetzt-senden>
            {sending ? "Sende …" : "Jetzt senden"}
          </Button>
          <button
            type="button"
            className="inline-flex min-h-10 w-full items-center justify-center text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            disabled={sending}
            onClick={onClose}
          >
            Zurück
          </button>
        </div>
      }
    >
      {!vorschau ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-[color:var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
        </div>
      ) : !vorschau.ok ? (
        <div className="flex items-start gap-2 px-5 py-6 text-sm" data-angebot-mail-fehler>
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {vorschau.error}
        </div>
      ) : (
        <div className={laedt ? "opacity-60 transition-opacity" : "transition-opacity"} data-angebot-mail-vorschau>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-5 py-3 text-sm">
            <dt className="text-[color:var(--muted)]">An</dt>
            <dd className="min-w-0 break-all font-medium">{vorschau.an}</dd>
            <dt className="text-[color:var(--muted)]">Betreff</dt>
            <dd className="min-w-0 font-medium">{vorschau.betreff}</dd>
            {vorschau.anhang ? (
              <>
                <dt className="text-[color:var(--muted)]">Anhang</dt>
                <dd className="flex min-w-0 items-center gap-1 break-all">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted)]" /> {vorschau.anhang}
                </dd>
              </>
            ) : null}
          </dl>
          {vorschau.hinweise?.length ? <p className="px-5 pb-2 text-xs text-[color:var(--muted)]">{vorschau.hinweise.join(" ")}</p> : null}
          <iframe
            title="Vorschau der E-Mail"
            // Keine Skripte; gleiche Herkunft nur, um die Höhe zu messen; Links öffnen in neuem Tab
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            srcDoc={vorschauDokument(vorschau.html)}
            className="block w-full border-t border-[color:var(--border)] bg-white"
            style={{ height: hoehe }}
            onLoad={(e) => {
              const doc = e.currentTarget.contentDocument;
              if (doc) setHoehe(Math.max(200, doc.documentElement.scrollHeight));
            }}
          />
        </div>
      )}
    </Sheet>
  );
}
