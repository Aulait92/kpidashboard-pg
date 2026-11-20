// Spickzettel „Verträge des Kunden“ oben in der Terminvorbereitung (Policen auslesen, Paket 3 „Champions League“,
// 19.11.2026; Datei- und Komponentenname bleiben).
// Wer: Vermittler kurz vor dem Termin, oft am Handy. Aufgabe: in 30 Sekunden ohne Scrollen sehen, was der Kunde zahlt und
// welche 1 bis 3 Fragen im Termin Geld bringen. Ein Tipp öffnet die Vertragsseite (bzw. springt zur Karte der Frage).
// Jeder Zustand hat eine nächste Handlung oder läuft automatisch (Logik: lib/policen/auslesen/spickzettel.ts). Texte aus
// derselben Quelle wie die Vertragsseite (Fragen, Kopf, K6-Satz, Sperrgründe). Keine Beratung, keine Bewertung (K8).

import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { zweiFaktorHref } from "@/components/security/zwei-faktor-hinweis";
import { FrageNummer, vertragAnker } from "@/components/policen-frage-nummer";
import { PolicenSparteChips } from "@/components/policen-sparte-chips";
import { ladeSpickzettel } from "@/lib/policen/auslesen/server";
import { SPARTE_LABEL } from "@/lib/policen/auslesen/felder";
import { chatSpartenAusgelesen, spickzettel, type Spickzettel } from "@/lib/policen/auslesen/spickzettel";
import { K6_SATZ, MONAT_UNBEKANNT } from "@/lib/policen/auslesen/vertragsseite";

export { unterlagenAufgeklappt } from "@/lib/policen/auslesen/spickzettel";

export type SpickzettelDaten = {
  s: Spickzettel | null;
  /** Chat-Sparten, die ausgelesen vorliegen (in „Bestehende Verträge“ ausblenden) */
  chatAusgelesen: string[];
  /** Sparten für die Chips (freigegeben), Reihenfolge wie auf der Vertragsseite */
  sparten: { wert: string; label: string }[];
};

/** Daten laden; null in der Admin-Vorschau bzw. ohne Lead (keine Inhalte, Rechtsprüfung). */
export async function ladeSpickzettelDaten({ leadId, customerId, preview }: { leadId: string | null; customerId: string; preview: boolean }): Promise<SpickzettelDaten | null> {
  if (!leadId || preview) return null;
  const d = await ladeSpickzettel(leadId, customerId).catch(() => null);
  if (!d) return null;
  return spickzettelDaten(d);
}

/** Aus geladenen Daten (auch für Tests und statische Aufnahmen). */
export function spickzettelDaten(d: Awaited<ReturnType<typeof ladeSpickzettel>>): SpickzettelDaten {
  return {
    s: spickzettel(d.v, { gebetenAm: d.gebetenAm, policenAn: d.policenAn }),
    chatAusgelesen: d.v ? chatSpartenAusgelesen(d.v.vertraege) : [],
    sparten: (d.v?.sparten ?? []).map((s) => ({ wert: s, label: SPARTE_LABEL[s] })),
  };
}

const KASTEN = "rounded-[var(--radius-md)] border border-[color:var(--border)]";
const TITEL = "text-[13px] font-semibold text-[color:var(--muted)]";
const LEISE = "text-[13px] text-[color:var(--muted)]";
const tag = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(iso));

export function PolicenSpickzettel({
  terminId,
  leadId,
  daten,
  ohne2fa,
  readOnly = false,
  className = "",
}: {
  terminId: string;
  leadId: string;
  daten: SpickzettelDaten | null;
  /** Login ohne Zwei-Faktor: Originale öffnen erst nach der Einrichtung (AVV § 5) */
  ohne2fa: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const s = daten?.s;
  if (!s) return null;
  const vertraege = `/buyer/termine/${terminId}/vorbereitung/vertraege`;
  const original = (docId: string) => (ohne2fa ? zweiFaktorHref(`/buyer/termine/${terminId}/vorbereitung`) : `/api/buyer/leads/${leadId}/unterlagen/${docId}`);
  const extern = ohne2fa ? {} : { target: "_blank", rel: "noreferrer" };
  const fertig = s.zustand === "fertig";

  // Sparten-Wahl mit einem Tipp (K2: Sparte vom Vermittler); die Unterlage ist zum Nachsehen verlinkt
  const sparteWahl = s.sparteWahl ? (
    <div className={fertig ? "border-t border-[color:var(--border)] px-3 py-2.5" : "mt-1"} data-spickzettel-sparte>
      {fertig ? <p className="font-medium">{s.sparteWahl.text}</p> : null}
      <p className={LEISE}>
        {s.sparteWahl.frage}{" "}
        {/* Ohne Zwei-Faktor nur das Datum: die Einrichtung erklärt die Unterlagen-Liste (eine Stelle statt zwei) */}
        {ohne2fa ? (
          `Unterlage vom ${tag(s.sparteWahl.datum)}`
        ) : (
          <a href={original(s.sparteWahl.documentId)} {...extern} className="font-medium text-[color:var(--brand)] hover:underline">
            Unterlage vom {tag(s.sparteWahl.datum)}
          </a>
        )}
      </p>
      <PolicenSparteChips terminId={terminId} documentId={s.sparteWahl.documentId} sparten={daten.sparten} readOnly={readOnly} />
    </div>
  ) : null;

  if (!fertig) {
    const a = s.aktion;
    return (
      <div className={`${KASTEN} px-3 py-2.5 ${className}`} data-spickzettel data-zustand={s.zustand}>
        <p className={TITEL}>Verträge des Kunden</p>
        <p className="mt-0.5 flex items-center gap-1.5">
          {s.zustand === "wird_ausgelesen" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[color:var(--muted)]" /> : null}
          {s.text}
        </p>
        {s.hinweis ? <p className={LEISE}>{s.hinweis}</p> : null}
        {sparteWahl}
        {s.neben.map((x) => (
          <p key={x} className={`mt-1.5 ${LEISE}`}>
            {x}
          </p>
        ))}
        {a ? (
          <a
            href={a.art === "original" && a.documentId ? original(a.documentId) : "#unterlagen"}
            {...(a.art === "original" ? extern : {})}
            className="-mb-1.5 mt-0.5 inline-flex min-h-10 items-center gap-1 font-medium text-[color:var(--brand)] hover:underline"
            data-spickzettel-aktion={a.art}
          >
            {a.art === "original" && ohne2fa ? "Zum Öffnen Zwei-Faktor einrichten" : a.text} <ChevronRight className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`${KASTEN} ${className}`} data-spickzettel data-zustand="fertig">
      <Link href={vertraege} className="block rounded-t-[var(--radius-md)] px-3 pb-2 pt-2.5 hover:bg-[color:var(--surface-sunken)]" data-spickzettel-kopf>
        <span className="flex items-center gap-2">
          <span className={`${TITEL} min-w-0 flex-1`}>Verträge des Kunden</span>
          {s.ungeprueft ? <Badge tone="warning">Bitte prüfen</Badge> : null}
          <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
        </span>
        <span className="mt-0.5 block text-xl font-semibold tracking-tight" data-monat-summe>
          {s.kopf?.monat ? (
            <>
              {s.kopf.monat} <span className="text-sm font-medium">im Monat</span>
            </>
          ) : (
            MONAT_UNBEKANNT
          )}
        </span>
        <span className={`block ${LEISE}`} data-kopf-zeile>
          {s.kopf?.zeile}
        </span>
      </Link>
      {s.fragen.length ? (
        <div className="border-t border-[color:var(--border)] px-3 py-1 text-sm" data-fragen>
          <ol>
            {s.fragen.map((f, i) => (
              <li key={f.text} data-frage={f.typ}>
                <Link
                  href={f.ids.length ? `${vertraege}#${vertragAnker(f.ids[0])}` : vertraege}
                  className="-mx-1.5 flex min-h-11 items-start gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1.5 hover:bg-[color:var(--surface-sunken)]"
                >
                  <FrageNummer n={i + 1} />
                  <span className="min-w-0 flex-1">{f.text}</span>
                </Link>
              </li>
            ))}
          </ol>
          {s.mehr ? (
            <Link href={vertraege} className="inline-flex min-h-10 items-center gap-1 text-[13px] font-medium text-[color:var(--brand)] hover:underline" data-fragen-mehr>
              Mehr ({s.mehr}) <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      ) : null}
      {sparteWahl}
      {s.neben.length ? (
        <Link href={vertraege} className={`block border-t border-[color:var(--border)] px-3 py-2 hover:bg-[color:var(--surface-sunken)] ${LEISE}`} data-spickzettel-neben>
          {s.neben.join(" ")}
        </Link>
      ) : null}
      <p className="border-t border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--muted)]" data-k6>
        {K6_SATZ}
      </p>
    </div>
  );
}

/** Alte Terminvorbereitung (page.tsx): lädt selbst und zeigt den Spickzettel. */
export async function PolicenVergleichKurz({ terminId, leadId, customerId, preview, ohne2fa = false }: { terminId: string; leadId: string | null; customerId: string; preview: boolean; ohne2fa?: boolean }) {
  if (!leadId) return null;
  const daten = await ladeSpickzettelDaten({ leadId, customerId, preview });
  // Dort sagt die Dokumentenkarte schon „Ihr Assistent bittet vor dem Termin darum“
  if (daten?.s?.zustand === "nie_gebeten") return null;
  return <PolicenSpickzettel terminId={terminId} leadId={leadId} daten={daten} ohne2fa={ohne2fa} readOnly={preview} />;
}
