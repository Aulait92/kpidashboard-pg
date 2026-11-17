"use client";

// „Was haben Sie besprochen?“ (Ole, 15.11.2026): zweiter Schritt von „Wie lief's?“ nach einem erreichten Anruf
// (Termin, Angebot, später). Nur die offenen Bedarfspunkte als Felder, Bekanntes eingeklappt, Notiz (auch per Diktat
// über die Tastatur), die die KI den Punkten zuordnen kann. Speichern legt den Bedarf am Lead und im Chat ab
// (lib/telefonat-server.ts); was offen bleibt, fragt der Assistent danach per WhatsApp ab.

import { useEffect, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { needFromNoteAction, needLoadAction, needSaveAction } from "@/app/buyer/telefonat-actions";
import type { BedarfFeld, NeedState } from "@/lib/telefonat";
import type { QualificationData } from "@/lib/whatsapp/qualification";
import { cn } from "@/lib/utils";

const STAND: { key: NeedState; label: string }[] = [
  { key: "komplett", label: "Ja, komplett" },
  { key: "teilweise", label: "Teilweise" },
  { key: "nein", label: "Nein, nur Termin" },
];

const INPUT = "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base outline-none focus:border-[color:var(--brand)]";

export function BedarfSheet({
  leadId,
  name,
  termin = false,
  onClose,
  onDone,
}: {
  leadId: string;
  name: string;
  /** Termin vereinbart: „Nein, nur Termin“ anbieten; Überspringen speichert „ohne Angabe“ (Assistent fragt vorsichtig nach). */
  termin?: boolean;
  onClose: () => void;
  /** Nach Speichern oder Überspringen (nicht beim Wegwischen: onClose): weiter mit dem gewählten Ergebnis. */
  onDone: (offen: string[] | null) => void;
}) {
  const toast = useToast();
  const [felder, setFelder] = useState<BedarfFeld[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [werte, setWerte] = useState<QualificationData>({});
  const [stand, setStand] = useState<NeedState | null>(null);
  const [notiz, setNotiz] = useState("");
  const [busy, start] = useTransition();

  useEffect(() => {
    let alive = true;
    needLoadAction(leadId).then((r) => {
      if (!alive) return;
      if (r.ok) setFelder(r.data.felder);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [leadId]);

  const offen = (felder ?? []).filter((f) => !f.wert);
  const bekannt = (felder ?? []).filter((f) => f.wert);
  const set = (k: BedarfFeld["key"], v: string) => setWerte((w) => ({ ...w, [k]: v }));

  const zuordnen = () =>
    start(async () => {
      const r = await needFromNoteAction(leadId, notiz);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      const n = Object.keys(r.angaben).length;
      if (!n) return toast.show({ message: "In der Notiz steht nichts zu den Punkten." });
      setWerte((w) => ({ ...r.angaben, ...Object.fromEntries(Object.entries(w).filter(([, v]) => v?.trim())) }));
      toast.show({ message: `${n} ${n === 1 ? "Punkt" : "Punkte"} übernommen, bitte kurz prüfen.` });
    });

  const speichern = (uebersprungen = false) =>
    start(async () => {
      if (uebersprungen && !termin) return onDone(null);
      const r = await needSaveAction(leadId, uebersprungen ? { uebersprungen: true } : { angaben: werte, notiz, stand });
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      onDone(uebersprungen ? null : r.offen);
    });

  const nurTermin = stand === "nein";
  return (
    <Sheet open onClose={onClose} title={`Was haben Sie mit ${name} besprochen?`}>
      {!felder ? (
        <p className="px-5 py-4 text-sm text-[color:var(--muted)]">{error ?? "Einen Moment …"}</p>
      ) : (
        <div className="space-y-4 p-5" data-bedarf-sheet>
          <div>
            <p className="mb-1.5 text-sm font-medium">Bedarf besprochen?</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Bedarf besprochen?">
              {STAND.filter((s) => termin || s.key !== "nein").map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={stand === s.key}
                  onClick={() => setStand(stand === s.key ? null : s.key)}
                  className={cn(
                    "h-10 rounded-full border px-3 text-sm transition sm:h-8",
                    stand === s.key ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold text-[color:var(--brand-dark)]" : "border-[color:var(--border)] hover:border-[color:var(--brand)]",
                  )}
                  data-bedarf-stand={s.key}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {!nurTermin && offen.length ? (
            <div className="space-y-2.5">
              {offen.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-sm font-medium">{f.label}</span>
                  <input value={werte[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.hint} className={INPUT} data-bedarf-feld={f.key} />
                </label>
              ))}
            </div>
          ) : null}
          {!nurTermin && !offen.length ? <p className="text-sm text-[color:var(--muted)]">Alle Punkte sind schon bekannt.</p> : null}

          {bekannt.length ? (
            <details className="text-sm [&>summary::-webkit-details-marker]:hidden">
              <summary className="inline-flex min-h-10 cursor-pointer list-none items-center text-[color:var(--muted)] sm:min-h-0">
                Schon bekannt: {bekannt.map((f) => f.label).join(", ")}
              </summary>
              <div className="mt-2 space-y-2.5">
                {bekannt.map((f) => (
                  <label key={f.key} className="block">
                    <span className="mb-1 block text-sm font-medium">{f.label}</span>
                    <input value={werte[f.key] ?? f.wert ?? ""} onChange={(e) => set(f.key, e.target.value)} className={INPUT} />
                  </label>
                ))}
              </div>
            </details>
          ) : null}

          <div>
            <textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              rows={3}
              placeholder="Notiz zum Gespräch, gern per Diktat"
              aria-label="Notiz zum Gespräch"
              className={INPUT}
              data-bedarf-notiz
            />
            {notiz.trim().length >= 10 && !nurTermin ? (
              <Button variant="ghost" icon={Sparkles} className="mt-1" disabled={busy} onClick={zuordnen} data-bedarf-zuordnen>
                Notiz in die Punkte übernehmen
              </Button>
            ) : null}
          </div>

          <Button variant="primary" size="md" className="w-full" disabled={busy} onClick={() => speichern()} data-bedarf-speichern>
            Speichern
          </Button>
          <Button variant="ghost" size="md" className="w-full" disabled={busy} onClick={() => speichern(true)}>
            Überspringen
          </Button>
        </div>
      )}
    </Sheet>
  );
}
