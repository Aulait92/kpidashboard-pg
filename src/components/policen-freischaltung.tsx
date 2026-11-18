"use client";

// Karte „Policen aus Kranken, BU und Leben freischalten“ (Rechtsprüfung A5, Vorgabe Ole 18.11.2026). Daten:
// lib/policen/freischaltung.ts. Auf Heute und oben in der Terminvorbereitung, bis zugestimmt oder 3-mal „Später“;
// in den Einstellungen immer (dort mit Status).

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { Freischaltung } from "@/lib/policen/freischaltung";
import { zweiFaktorHref } from "@/components/security/zwei-faktor-hinweis";
import { policenAvvSpaeterAction, policenAvvZustimmenAction } from "@/app/buyer/einstellungen/policen/actions";

const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

export function PolicenFreischaltung({ f, ort }: { f: Freischaltung; ort: "karte" | "einstellungen" }) {
  const toast = useToast();
  const [lesen, setLesen] = useState(false);
  const [weg, setWeg] = useState(false);
  const [pending, start] = useTransition();
  const pfad = usePathname() || "/buyer";
  if (weg) return null;
  const an = f.freigeschaltet;
  // Ohne Zwei-Faktor-Login (AVV § 5) führt die Hauptaktion zuerst zur Einrichtung und danach hierher zurück
  const einrichten = f.zweiFaktor ? null : zweiFaktorHref(pfad);

  const zustimmen = () =>
    start(async () => {
      const r = await policenAvvZustimmenAction();
      if (!r.ok) return toast.show({ message: "Das hat nicht geklappt. Bitte noch einmal versuchen.", tone: "error" });
      toast.show({ message: "Kranken, BU und Leben sind eingeschaltet" });
      setLesen(false);
    });
  const spaeter = () =>
    start(async () => {
      setWeg(true);
      await policenAvvSpaeterAction();
    });

  const links = (
    <span className="flex flex-wrap gap-x-4 text-sm">
      <button type="button" onClick={() => setLesen(true)} className="min-h-10 font-medium text-[color:var(--brand)] hover:underline" data-avv-lesen>
        Ergänzung lesen
      </button>
      {f.datenschutzUrl ? (
        <a href={f.datenschutzUrl} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center font-medium text-[color:var(--brand)] hover:underline">
          Datenschutzhinweise für Ihre Kunden
        </a>
      ) : null}
    </span>
  );

  return (
    <div className={ort === "karte" ? "rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5" : "px-5 py-4"} data-policen-freischaltung={ort}>
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-emerald-600 text-white">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Policen aus Kranken, BU und Leben freischalten</h2>
          {an ? (
            <p className="mt-1 text-sm text-[color:var(--muted)]" data-policen-an>
              {f.intern ? "Eingeschaltet (internes Konto)." : f.zugestimmtAt ? `Eingeschaltet, zugestimmt am ${day(f.zugestimmtAt)}.` : "Eingeschaltet."}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              Diese Unterlagen können Gesundheitsangaben enthalten. Damit Ihr Assistent sie für Sie annehmen und auslesen darf, ergänzen wir unseren Auftragsverarbeitungsvertrag
              (Speicherung nur in der EU, nur Sie sehen die Unterlagen, automatische Löschung 90 Tage nach dem Termin).
            </p>
          )}
          <div className="mt-1">{links}</div>
          {!an ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {einrichten ? (
                  <a href={einrichten} className={buttonClass("primary", "md", "w-full sm:w-auto")} data-avv-zwei-faktor>
                    Zuerst Zwei-Faktor-Login einrichten
                  </a>
                ) : (
                  <button type="button" onClick={zustimmen} disabled={pending} className={buttonClass("primary", "md", "w-full sm:w-auto")} data-avv-zustimmen>
                    {pending ? "Wird gespeichert …" : "Zustimmen und einschalten"}
                  </button>
                )}
                {ort === "karte" ? (
                  <button type="button" onClick={spaeter} disabled={pending} className="min-h-10 text-sm font-medium text-[color:var(--muted)] hover:underline" data-avv-spaeter>
                    Später
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-[color:var(--muted)]">
                {einrichten ? "Danach stimmen Sie hier zu. " : ""}Haftpflicht, Hausrat und Kfz laufen ohne diesen Schritt.
              </p>
            </>
          ) : null}
        </div>
      </div>
      <Sheet open={lesen} onClose={() => setLesen(false)} title="Ergänzung zum Auftragsverarbeitungsvertrag">
        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-1 pb-2 text-sm leading-relaxed" data-avv-text>
          {f.avv.map((x) => (
            <p key={x.titel}>
              <b>{x.titel}</b> {x.text}
            </p>
          ))}
          {!an ? (
            einrichten ? (
              <a href={einrichten} className={buttonClass("primary", "md", "w-full")}>
                Zuerst Zwei-Faktor-Login einrichten
              </a>
            ) : (
              <button type="button" onClick={zustimmen} disabled={pending} className={buttonClass("primary", "md", "w-full")}>
                Zustimmen und einschalten
              </button>
            )
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
