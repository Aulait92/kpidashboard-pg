"use client";

// Karte „Datenschutz und Recht“ in der Kontaktakte (Ole, 19.11.2026), alter und neuer Admin. Nur sichtbar, wenn der
// Kontakt einen Fall hat. Je Fall: Art, Eingang, Frist, Antwort, Löschung. Eine Hauptaktion: die passende Antwortvorlage
// als Entwurf öffnen, prüfen, senden. Seltenes (andere Vorlage, ohne Senden vermerken) im Entwurf bzw. unter „Mehr“.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Scale, Send } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { rechtsBeantwortetAction, rechtsEntwurfAction, rechtsSendenAction } from "@/app/admin/vertrieb/datenschutz-actions";
import { ABMAHNUNG_HINWEIS, VORLAGEN, VORLAGE_LABEL, type VorlagenArt } from "@/lib/vertrieb/datenschutz-recht";

export type FallZeile = {
  fallId: string;
  art: "auskunft" | "loeschung" | "widerspruch" | "abmahnung";
  artLabel: string;
  eingang: string;
  frist: string;
  antwort: string | null;
  loeschung: string | null;
  status: "offen" | "ueberfaellig" | "beantwortet";
};

const STATUS: Record<FallZeile["status"], { label: string; tone: "danger" | "warning" | "success" }> = {
  ueberfaellig: { label: "Frist überschritten", tone: "danger" },
  offen: { label: "offen", tone: "warning" },
  beantwortet: { label: "beantwortet", tone: "success" },
};

/** Passende Vorlage je Art (Abmahnung: keine, Ole gibt sie zur Prüfung weiter). */
const VORLAGE_FUER: Record<FallZeile["art"], VorlagenArt | null> = { auskunft: "auskunft", loeschung: "loeschung", widerspruch: "widerspruch", abmahnung: null };

export function DatenschutzRechtKarte({ contactId, faelle }: { contactId: string; faelle: FallZeile[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [offen, setOffen] = useState<{ fallId: string; vorlage: VorlagenArt } | null>(null);
  const [entwurf, setEntwurf] = useState<{ betreff: string; text: string; hinweis: string | null; sendbar: boolean } | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const oeffnen = (fallId: string, vorlage: VorlagenArt) =>
    start(async () => {
      setMeldung(null);
      setEntwurf(null);
      setOffen({ fallId, vorlage });
      const r = await rechtsEntwurfAction(contactId, vorlage).catch(() => ({ ok: false as const, fehler: "Entwurf konnte nicht geladen werden." }));
      if (r.ok) setEntwurf({ betreff: r.betreff, text: r.text, hinweis: r.hinweis, sendbar: r.sendbar });
      else setMeldung(r.fehler);
    });
  const senden = () =>
    offen &&
    entwurf &&
    start(async () => {
      const r = await rechtsSendenAction({ contactId, fallId: offen.fallId, vorlage: offen.vorlage, betreff: entwurf.betreff, text: entwurf.text }).catch(() => ({ ok: false as const, fehler: "Senden fehlgeschlagen." }));
      if (r.ok) {
        setOffen(null);
        router.refresh();
      } else setMeldung(r.fehler);
    });
  const vermerken = (fallId: string) =>
    start(async () => {
      const r = await rechtsBeantwortetAction(contactId, fallId).catch(() => ({ ok: false as const, fehler: "Speichern fehlgeschlagen." }));
      if (r.ok) {
        setOffen(null);
        router.refresh();
      } else setMeldung(r.fehler);
    });

  return (
    <Card id="datenschutz">
      <CardHeader title="Datenschutz und Recht" icon={Scale} count={faelle.length} />
      <ul className="divide-y divide-[color:var(--border)]" data-datenschutz-recht>
        {faelle.map((f) => {
          const vorlage = VORLAGE_FUER[f.art];
          return (
            <li key={f.fallId} className="space-y-2 px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={f.art === "abmahnung" ? "danger" : "brand"}>{f.artLabel}</Badge>
                <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>
                <span className="text-xs text-[color:var(--muted)]">
                  Eingang {f.eingang} · {f.art === "abmahnung" ? "sofort" : `Frist ${f.frist}`}
                  {f.antwort ? ` · beantwortet ${f.antwort}` : ""}
                  {f.loeschung ? ` · gelöscht ${f.loeschung}` : ""}
                </span>
              </div>
              {f.art === "abmahnung" && f.status !== "beantwortet" ? <p className="font-medium text-rose-700">{ABMAHNUNG_HINWEIS}</p> : null}
              {f.status !== "beantwortet" ? (
                <div className="flex flex-wrap gap-2">
                  {vorlage ? (
                    <Button variant="secondary" size="md" disabled={pending} onClick={() => oeffnen(f.fallId, vorlage)}>
                      {VORLAGE_LABEL[vorlage]}
                    </Button>
                  ) : (
                    <Button variant="secondary" size="md" disabled={pending} onClick={() => confirm("Als erledigt vermerken? Nur, wenn die Prüfung abgeschlossen ist.") && vermerken(f.fallId)}>
                      Als erledigt vermerken
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Sheet open={!!offen} onClose={() => setOffen(null)} title={offen ? VORLAGE_LABEL[offen.vorlage] : undefined}>
        <div className="space-y-3 p-5">
          {meldung ? <p className="rounded-[var(--radius-md)] bg-amber-50 px-3 py-2 text-sm text-amber-900">{meldung}</p> : null}
          {!entwurf && !meldung ? <p className="text-sm text-[color:var(--muted)]">Entwurf wird erstellt …</p> : null}
          {entwurf ? (
            <>
              {entwurf.hinweis ? <p className="rounded-[var(--radius-md)] bg-amber-50 px-3 py-2 text-sm text-amber-900">{entwurf.hinweis}</p> : null}
              <input className="input" aria-label="Betreff" value={entwurf.betreff} onChange={(e) => setEntwurf({ ...entwurf, betreff: e.target.value })} />
              <textarea className="input" rows={14} style={{ minHeight: "16rem" }} aria-label="Text" value={entwurf.text} onChange={(e) => setEntwurf({ ...entwurf, text: e.target.value })} />
              <Button variant="primary" size="md" className="w-full" icon={Send} disabled={pending || !entwurf.sendbar} onClick={senden}>
                Prüfen und senden
              </Button>
              {!entwurf.sendbar ? <p className="text-xs text-[color:var(--muted)]">Kein Instantly-Thread: Text kopieren, im Postfach antworten und dann vermerken.</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(`${entwurf.betreff}\n\n${entwurf.text}`)}>
                  Kopieren
                </Button>
                {offen ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => vermerken(offen.fallId)}>
                    Ohne Senden als beantwortet vermerken
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
          {offen ? (
            <details className="text-xs text-[color:var(--muted)]">
              <summary className="cursor-pointer">Andere Vorlage</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {VORLAGEN.filter((v) => v !== offen.vorlage).map((v) => (
                  <Button key={v} variant="secondary" size="sm" disabled={pending} onClick={() => oeffnen(offen.fallId, v)}>
                    {VORLAGE_LABEL[v]}
                  </Button>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </Sheet>
    </Card>
  );
}
