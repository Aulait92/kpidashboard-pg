"use client";

// Abschluss mit einem Tipp (P4, Ole 17.11.2026): Der Tipp auf „Abschluss“ speichert sofort (Heute, Kontakt, Pipeline,
// Nachfassen, Entscheidungsblatt). Danach zeigt dieses Blatt, was gespeichert ist, und fragt nur, was fehlt:
//   mit Beitrag (Angebot bzw. eingetragen)  „Privatschutz · 612 €/Jahr aus Ihrem Angebot · Provision ≈ 337 €“ [Stimmt] [Ändern]
//   ohne Beitrag                            drei typische Beiträge als Chips + „Anderer Betrag“, [Fertig] behält den typischen
//   Glückwunsch (Ergänzung D)               Haken „Glückwunsch per WhatsApp senden“, vorausgewählt nur bis 3 Tage nach dem
//                                           Termin; außerhalb des 24-h-Fensters ausgegraut mit Hinweis
//   Danke-Mail (Paket M6)                   Haken „Danke-Mail senden“ (Vorlage „Nach dem Abschluss“, zeitneutral), Stufe
//                                           „automatisch“ = vorausgewählt; ohne Versand über die App „Selbst senden“ mit
//                                           Mailprogramm bzw. Kopieren und „Gesendet?“ (components/mail-wege.tsx)
// Wer: Vermittler direkt nach dem Gespräch, oft am Handy. Aufgabe: Abschluss festhalten, ohne zu tippen. Eine Hauptaktion.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trophy } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { AbschlussSheet } from "@/components/abschluss-sheet";
import { abschlussAendernAction, abschlussBeitragAction, abschlussStandAction, dankeMailAction, glueckwunschAction } from "@/app/buyer/abschluss-actions";
import { mailSelbstGesendetAction } from "@/app/buyer/postfach/actions";
import { MailWege } from "@/components/mail-wege";
import type { AbschlussStand } from "@/lib/abschluss-server";
import { cn } from "@/lib/utils";

const EVENT = "abschluss:eingetragen";

/** Nach einem Tipp auf „Abschluss“: Blatt mit dem gespeicherten Stand öffnen (AbschlussNachherHost in der Shell). */
export function emitAbschluss(leadId: string, name: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: { leadId, name } }));
}

/**
 * Abschluss mit einem Tipp: sofort speichern (ohne Beitrag, die App nimmt Angebot bzw. typischen Beitrag) und danach
 * das Blatt zeigen. Ersetzt das frühere Fenster mit Pflichteingabe vor dem Speichern.
 */
export function abschlussEinTipp(leadId: string, name: string, save: (value: number | null, sparte: string | null) => void) {
  save(null, null);
  emitAbschluss(leadId, name);
}

const eur = (n: number) => `${n.toLocaleString("de-DE")} €`;

/** Inhalt (im Blatt der Shell und inline im Entscheidungsblatt /buyer/abschluss). */
export function AbschlussNachherInhalt({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [stand, setStand] = useState<AbschlussStand | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [pending, start] = useTransition();
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [glueck, setGlueck] = useState<boolean | null>(null);
  const [danke, setDanke] = useState<boolean | null>(null);
  const [dankeSelbst, setDankeSelbst] = useState(false);
  const [aendern, setAendern] = useState(false);
  // Modus nach dem ersten Laden fest (Chips bleiben stehen, auch wenn ein Chip den Beitrag schon gespeichert hat)
  const [modus, setModus] = useState<"bestaetigen" | "chips" | null>(null);

  useEffect(() => {
    let aus = false;
    let versuch = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const laden = async () => {
      const s = await abschlussStandAction(leadId);
      if (aus) return;
      // Der Tipp läuft als eigene Server-Aktion davor: kurz warten, bis der Abschluss gespeichert ist
      if ((!s || !s.geschlossen || !s.zeile) && versuch < 8) {
        versuch++;
        timer = setTimeout(() => void laden(), 400);
        return;
      }
      if (!s) return setFehlt(true);
      setModus((m) => m ?? (s.premiumSource === "standard" && s.chips.length ? "chips" : "bestaetigen"));
      setStand(s);
    };
    void laden();
    return () => {
      aus = true;
      if (timer) clearTimeout(timer);
    };
  }, [leadId]);

  if (fehlt) return <p className="text-sm text-[color:var(--muted)]">Abschluss gespeichert.</p>;
  if (!stand) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  const g = stand.glueckwunsch;
  const glueckAn = glueck ?? g.vorausgewaehlt;
  const zeigeGlueck = g.moeglich && !g.gesendet;
  const d = stand.dankeMail && !stand.dankeMail.gesendet ? stand.dankeMail : null;
  const dankeAn = !!d?.app && (danke ?? d.vorausgewaehlt);
  const glueckAktiv = zeigeGlueck && g.offen && glueckAn;
  // Was der Knopf auslöst, steht drauf
  const mitSenden = glueckAktiv && dankeAn ? " und beides senden" : glueckAktiv ? " und Glückwunsch senden" : dankeAn ? " und Danke-Mail senden" : "";

  const chip = (wert: number) =>
    start(async () => {
      setGewaehlt(wert);
      const r = await abschlussBeitragAction(leadId, wert);
      if (!r.ok) {
        setGewaehlt(null);
        return toast.show({ message: r.error, tone: "error" });
      }
      const s = await abschlussStandAction(leadId);
      if (s) setStand(s);
    });

  const fertig = (stimmt: boolean) =>
    start(async () => {
      if (stimmt) await abschlussBeitragAction(leadId, null);
      if (glueckAktiv) {
        const r = await glueckwunschAction(leadId);
        toast.show(r.ok ? { message: r.gesendet ? `Glückwunsch an ${stand.label} gesendet` : "Abschluss gespeichert" } : { message: r.error, tone: "error" });
      }
      if (dankeAn) {
        const r = await dankeMailAction(leadId);
        toast.show(r.ok ? { message: `Danke-Mail an ${stand.label} gesendet` } : { message: r.error, tone: "error" });
      }
      router.refresh();
      onDone();
    });

  const istChips = modus === "chips";
  return (
    <div className="space-y-4" data-abschluss-nachher>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Trophy className="h-4 w-4" />
        </span>
        <p className="text-sm font-medium leading-snug" data-abschluss-zeile>
          {stand.zeile}
        </p>
      </div>

      {istChips ? (
        <div>
          <p className="text-sm text-[color:var(--muted)]">{stand.ersparnis ? "Ersparnis im Monat?" : stand.einheit === "/Monat" ? "Monatsbeitrag?" : "Jahresbeitrag?"}</p>
          <div className="mt-2 flex flex-wrap gap-2" data-abschluss-chips>
            {stand.chips.map((c) => (
              <button
                key={c}
                type="button"
                disabled={pending}
                onClick={() => chip(c)}
                aria-pressed={gewaehlt === c}
                className={cn(
                  "h-10 rounded-full border px-4 text-sm font-semibold transition active:scale-[0.98]",
                  gewaehlt === c
                    ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white"
                    : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--border-strong)]",
                )}
              >
                {eur(c)}
              </button>
            ))}
            <button
              type="button"
              disabled={pending}
              onClick={() => setAendern(true)}
              className="h-10 rounded-full border border-dashed border-[color:var(--border-strong)] bg-white px-4 text-sm font-semibold text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            >
              Anderer Betrag
            </button>
          </div>
        </div>
      ) : null}

      {zeigeGlueck ? (
        <div>
          <label className={cn("flex items-start gap-2.5", !g.offen && "opacity-60")}>
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--brand)]"
              checked={g.offen && glueckAn}
              disabled={!g.offen || pending}
              onChange={(e) => setGlueck(e.target.checked)}
              data-glueckwunsch
            />
            <span className="text-sm">
              <span className="font-medium">Glückwunsch per WhatsApp senden</span>
              <span className="mt-0.5 block text-xs text-[color:var(--muted)]">
                {g.offen ? `„${g.text}“` : `Geht nur bis 24 Stunden nach der letzten Nachricht von ${stand.label}.`}
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {d?.app ? (
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--brand)]"
            checked={dankeAn}
            disabled={pending}
            onChange={(e) => setDanke(e.target.checked)}
            data-danke-mail
          />
          <span className="min-w-0 text-sm">
            <span className="font-medium">Danke-Mail senden</span>
            <span className="mt-0.5 block break-words text-xs text-[color:var(--muted)]">{d.vorschau ? `„${d.vorschau}“ an ${d.an}` : `An ${d.an}`}</span>
          </span>
        </label>
      ) : d?.extern ? (
        <div className="space-y-2" data-danke-extern>
          {dankeSelbst ? (
            <MailWege
              appVersand={false}
              senden={() => undefined}
              mail={{ to: d.extern.to, subject: d.extern.subject, text: d.extern.text }}
              onGesendet={async () => {
                const r = await mailSelbstGesendetAction({ leadId, to: d.extern!.to, subject: d.extern!.subject, text: d.extern!.text, vorlageKey: "nach_abschluss" });
                toast.show(r.ok ? { message: "Danke-Mail im Verlauf eingetragen" } : { message: r.error, tone: "error" });
                if (r.ok) setDankeSelbst(false);
              }}
            />
          ) : (
            <button type="button" onClick={() => setDankeSelbst(true)} className="text-sm font-medium text-[color:var(--brand)] hover:underline" data-danke-selbst>
              Danke-Mail selbst senden
            </button>
          )}
        </div>
      ) : null}

      <div className="grid gap-2 sm:flex">
        <Button variant="primary" size="md" icon={Check} disabled={pending} onClick={() => fertig(!istChips)} className="sm:flex-1">
          {`${istChips ? "Fertig" : "Stimmt"}${mitSenden}`}
        </Button>
        {istChips ? null : (
          <Button size="md" icon={Pencil} disabled={pending} onClick={() => setAendern(true)}>
            Ändern
          </Button>
        )}
      </div>

      <AbschlussSheet
        open={aendern}
        title={`Abschluss mit ${stand.label}`}
        source={stand.source}
        onClose={() => setAendern(false)}
        onSave={(v, sp) => {
          setAendern(false);
          start(async () => {
            const r = await abschlussAendernAction(leadId, v, sp);
            if (!r.ok) return toast.show({ message: r.error, tone: "error" });
            if (v != null) setGewaehlt(null);
            const s = await abschlussStandAction(leadId);
            if (s) setStand(s);
          });
        }}
      />
    </div>
  );
}

/** Einmal in der Shell: öffnet nach jedem Tipp auf „Abschluss“ das Blatt mit dem gespeicherten Stand. */
export function AbschlussNachherHost() {
  const [offen, setOffen] = useState<{ leadId: string; name: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ leadId: string; name: string }>).detail;
      if (d?.leadId) setOffen({ leadId: d.leadId, name: d.name });
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return (
    <Sheet open={!!offen} onClose={() => setOffen(null)} title={offen ? `${offen.name}: Abschluss gespeichert` : ""}>
      <div className="p-5">{offen ? <AbschlussNachherInhalt key={offen.leadId} leadId={offen.leadId} onDone={() => setOffen(null)} /> : null}</div>
    </Sheet>
  );
}
