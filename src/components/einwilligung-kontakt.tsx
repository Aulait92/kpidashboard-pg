"use client";

// Einwilligung im Kontakt (Ole, 17.11.2026; Logik in lib/einwilligung-stand.ts):
//   vollständig  kleines Etikett „Einwilligung“ mit Haken am Namen, Tippen zeigt Zeitpunkt, Kanäle und Wortlaut
//   sonst        Hinweis mit der Folge im Klartext (Gelb eingeschränkt, Rot keine bzw. widerrufen), Nachweis daneben

import { useState } from "react";
import { Check, ShieldAlert } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { einwilligungTon, type EinwilligungStand } from "@/lib/einwilligung-stand";
import { cn } from "@/lib/utils";

const zeit = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function NachweisSheet({ open, onClose, stand }: { open: boolean; onClose: () => void; stand: EinwilligungStand }) {
  const n = stand.nachweis;
  return (
    <Sheet open={open} onClose={onClose} title="Einwilligung" message={n?.at ? `Erteilt am ${zeit(n.at)} Uhr im Leadformular` : undefined}>
      <dl className="space-y-3 px-5 py-4 text-sm" data-einwilligung-nachweis>
        <div>
          <dt className="text-xs text-[color:var(--muted)]">Kanäle</dt>
          <dd className="font-medium">{stand.kanaele.length ? stand.kanaele.join(", ") : "keine"}</dd>
        </div>
        {stand.hinweise.length ? (
          <div>
            <dt className="text-xs text-[color:var(--muted)]">Einschränkung</dt>
            {stand.hinweise.map((h) => (
              <dd key={h}>{h}</dd>
            ))}
          </div>
        ) : null}
        {n?.text ? (
          <div>
            <dt className="text-xs text-[color:var(--muted)]">Wortlaut</dt>
            <dd className="whitespace-pre-line">{n.text}</dd>
          </div>
        ) : null}
        {n?.formId || n?.textVersion ? (
          <div className="text-xs text-[color:var(--muted)]">
            {[n.formId ? `Formular ${n.formId}` : null, n.textVersion ? `Textversion ${n.textVersion}` : null].filter(Boolean).join(" · ")}
          </div>
        ) : null}
      </dl>
    </Sheet>
  );
}

/** Etikett am Namen, nur bei vollständiger Einwilligung. */
export function EinwilligungEtikett({ stand }: { stand: EinwilligungStand }) {
  const [open, setOpen] = useState(false);
  if (stand.stufe !== "vollstaendig") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Einwilligung anzeigen"
        // Tippfläche unsichtbar vergrößert (40 px), das Etikett bleibt klein
        className="relative inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium tracking-normal text-emerald-700 ring-1 ring-inset ring-emerald-200 transition after:absolute after:-inset-2.5 after:content-[''] hover:bg-emerald-100"
        data-einwilligung-etikett
      >
        <Check className="h-3 w-3" strokeWidth={3} /> Einwilligung
      </button>
      <NachweisSheet open={open} onClose={() => setOpen(false)} stand={stand} />
    </>
  );
}

/** Hinweis an der bisherigen Stelle, wenn die Einwilligung fehlt oder eingeschränkt ist. */
export function EinwilligungHinweis({ stand }: { stand: EinwilligungStand }) {
  const [open, setOpen] = useState(false);
  const ton = einwilligungTon(stand.stufe);
  if (!ton || !stand.hinweise.length) return null;
  return (
    <div
      className={cn(
        "mb-5 flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm",
        ton === "rot" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
      data-einwilligung-hinweis={stand.stufe}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {stand.hinweise.map((h) => {
          const i = h.indexOf(":");
          return (
            <p key={h}>
              {i > 0 ? (
                <>
                  <b>{h.slice(0, i + 1)}</b>
                  {h.slice(i + 1)}
                </>
              ) : (
                h
              )}
            </p>
          );
        })}
      </div>
      {stand.nachweis ? (
        <button type="button" onClick={() => setOpen(true)} className="relative shrink-0 font-semibold after:absolute after:-inset-2.5 after:content-[''] hover:underline">
          Nachweis
        </button>
      ) : null}
      {stand.nachweis ? <NachweisSheet open={open} onClose={() => setOpen(false)} stand={stand} /> : null}
    </div>
  );
}
