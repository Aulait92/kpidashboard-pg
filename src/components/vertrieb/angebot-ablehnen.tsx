"use client";

// „Mehr“ am Angebot (Kontaktakte, Angebotsübersicht) und das Blatt „Als abgelehnt markieren“ (Ole, 18.11.2026).
// Grund wie bei „Verloren: warum?“ (gleiche Liste, gleiche Optik), Notiz optional, „Kontakt auch als verloren
// markieren?“ (Standard ja) und optional „Später erneut ansprechen am …“. Regeln: lib/vertrieb/angebot-ablehnen.ts.

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreHorizontal, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { ActionSheet, Sheet, type SheetAction } from "@/components/ui/sheet";
import { declineOfferAction, reopenOfferAction } from "@/app/admin/vertrieb/offer-actions";
import { ABLEHN_GRUENDE } from "@/lib/vertrieb/angebot-ablehnen";

const inTagen = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
};

/** Ja/Nein als Umschalter (Optik wie „Sie/Du“ an der Angebotskarte). */
export function JaNein({ value, onChange, label, name }: { value: boolean; onChange: (v: boolean) => void; label: string; name: string }) {
  return (
    <div className="flex items-center justify-between gap-3" data-ja-nein={name}>
      <span className="text-sm">{label}</span>
      <div className="inline-flex shrink-0 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white p-0.5" role="group" aria-label={label}>
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={clsx(
              "min-h-8 rounded-[6px] px-3 text-sm font-medium",
              value === v ? "bg-[color:var(--brand)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {v ? "Ja" : "Nein"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AblehnenBlatt({
  offerId,
  number,
  kontakt,
  open,
  onClose,
  onDone,
}: {
  offerId: string;
  number: string;
  /** Angebot hängt an einem Vertriebskontakt: „Kontakt auch verloren?“ und „Später erneut ansprechen“ */
  kontakt: boolean;
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [grund, setGrund] = useState("");
  const [notiz, setNotiz] = useState("");
  const [verloren, setVerloren] = useState(true);
  const [spaeter, setSpaeter] = useState(false);
  const [datum, setDatum] = useState(() => inTagen(90));
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Sheet open={open} onClose={onClose} title="Als abgelehnt markieren" message={`${number}: Der Link zeigt danach „nicht mehr gültig“.`}>
      <form
        className="space-y-3 p-5"
        data-ablehnen-blatt
        onSubmit={(e) => {
          e.preventDefault();
          setFehler(null);
          start(async () => {
            const res = await declineOfferAction(offerId, { grund: grund || "SONSTIGES", notiz, kontaktVerloren: kontakt && verloren, spaeterAm: kontakt && spaeter ? datum : null });
            if (!res.ok) return setFehler(res.error);
            onClose();
            onDone(res.hinweis ? `Als abgelehnt markiert. ${res.hinweis}` : "Als abgelehnt markiert");
          });
        }}
      >
        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Grund">
          {ABLEHN_GRUENDE.map((r) => (
            <label
              key={r.id}
              className={clsx(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                grund === r.id ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-[color:var(--border)]",
              )}
            >
              <input type="radio" name="grund" value={r.id} checked={grund === r.id} onChange={() => setGrund(r.id)} />
              {r.label}
            </label>
          ))}
        </div>
        <input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Notiz (optional)" className="input" aria-label="Notiz" maxLength={1000} />
        {kontakt ? (
          <div className="space-y-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2.5">
            <JaNein name="verloren" label="Kontakt auch als verloren markieren?" value={verloren} onChange={setVerloren} />
            <label className="flex min-h-8 items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={spaeter} onChange={(e) => setSpaeter(e.target.checked)} data-spaeter />
              Später erneut ansprechen
            </label>
            {spaeter ? (
              <input
                type="date"
                aria-label="Später erneut ansprechen am"
                value={datum}
                min={inTagen(1)}
                onChange={(e) => setDatum(e.target.value)}
                className="input"
                required
              />
            ) : null}
          </div>
        ) : null}
        {fehler ? <p className="text-sm text-rose-700">{fehler}</p> : null}
        <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending}>
          {pending ? "Speichere …" : "Als abgelehnt speichern"}
        </Button>
      </form>
    </Sheet>
  );
}

export type AngebotMehrInfo = {
  id: string;
  number: string;
  kannAblehnen: boolean;
  kannWiederOeffnen: boolean;
  /** hängt an einem Vertriebskontakt */
  kontakt: boolean;
};

/** „Mehr“ am Angebot: Als abgelehnt markieren bzw. Wieder öffnen, optional Löschen. variant „icon“ für Listenzeilen. */
export function AngebotMehr({
  offer,
  onDone,
  loeschen,
  variant = "button",
}: {
  offer: AngebotMehrInfo;
  onDone?: (msg: string) => void;
  loeschen?: () => void;
  variant?: "button" | "icon";
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"menu" | "ablehnen" | null>(null);
  const [pending, start] = useTransition();
  const fertig = (m: string) => {
    onDone?.(m);
    router.refresh();
  };
  const actions: SheetAction[] = [
    ...(offer.kannAblehnen ? [{ label: "Als abgelehnt markieren", icon: XCircle, tone: "danger" as const, onSelect: () => setTimeout(() => setOpen("ablehnen"), 0) }] : []),
    ...(offer.kannWiederOeffnen
      ? [
          {
            label: "Wieder öffnen",
            icon: RotateCcw,
            onSelect: () =>
              start(async () => {
                const res = await reopenOfferAction(offer.id);
                if (!res.ok) alert(res.error);
                else fertig("Angebot wieder geöffnet");
              }),
          },
        ]
      : []),
    ...(loeschen ? [{ label: "Angebot löschen", icon: Trash2, tone: "danger" as const, onSelect: loeschen }] : []),
  ];
  if (!actions.length) return null;
  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen("menu")}
          disabled={pending}
          aria-label={`Mehr zu ${offer.number}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--foreground)] sm:h-8 sm:w-8"
          data-angebot-mehr
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      ) : (
        <Button icon={MoreHorizontal} variant="ghost" disabled={pending} onClick={() => setOpen("menu")} data-angebot-mehr>
          Mehr
        </Button>
      )}
      <ActionSheet open={open === "menu"} onClose={() => setOpen(null)} title={`Angebot ${offer.number}`} actions={actions} />
      {open === "ablehnen" ? <AblehnenBlatt open offerId={offer.id} number={offer.number} kontakt={offer.kontakt} onClose={() => setOpen(null)} onDone={fertig} /> : null}
    </>
  );
}
