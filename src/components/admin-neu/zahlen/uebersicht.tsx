"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { ChevronRight, Download } from "lucide-react";
import { InfoHinweis } from "@/components/info-hinweis";
import { buttonClass } from "@/components/ui";
import { BwaTab, DrillSheet, Kunden, Ppl, Produkte, UpdateSheet, Vertrieb, Wachstum, Wirkung, Wirtschaft, ZAHLEN_PALETTE, ZahlenTooltip, type ZahlenDrill } from "@/components/admin/zahlen-view";
import { SICHT_ERKLAERT } from "@/lib/begriffe";
import type { BwaData } from "@/lib/bwa";
import type { ProdukteData } from "@/lib/produkte-shared";
import type { VertriebZahlen } from "@/lib/vertrieb-zahlen";
import type { ZahlenData } from "@/lib/zahlen";
import { pilotLabel, type Sicht } from "@/lib/zahlen-sicht";
import { cn } from "@/lib/utils";

// Geld › Übersicht (Umbau 19.11.2026, Ziel SUS 90+): eine Frage, „Wie steht das Geschäft?“. Oben 4 Kennzahlen
// (MRR, Ergebnis Vormonat, aktive Kunden, Offene Posten), darunter 4 zugeklappte Abschnitte. Die früheren 8 Abschnitte
// stecken darin: Wachstum (mit Vertrieb und Pay-per-Lead), Kunden (mit Wirkung, Produkten, Kündigung & Rückkehr),
// Wirtschaftlichkeit (mit BWA) und Für Investoren (Auswertung, Export, Investoren-Update). Diagramme und Fenster sind
// dieselben wie auf /admin/zahlen (components/admin/zahlen-view.tsx).

const eur = (v: number) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const kEur = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} T€` : eur(v));
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const monat = (k: string) => MONATE[Number(k.slice(5, 7)) - 1];

type Abschnitt = "wachstum" | "kunden" | "wirtschaft" | "investoren";
const SPEICHER = "geld-offen";

/** Kachel im Aussehen von components/admin-neu/ui/kennzahlen.tsx, aber mit eigenem Klick (Fenster „Woraus besteht das?“). */
function Kachel({ label, wert, hinweis, ton, onClick, href, funktion }: { label: string; wert: string; hinweis?: string; ton?: "gut" | "schlecht"; onClick?: () => void; href?: string; funktion?: string }) {
  const klasse = "block h-full w-full rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-left shadow-[var(--shadow-sm)] transition hover:border-[color:var(--border-strong)]";
  const inhalt = (
    <>
      <span className="block text-xs text-[color:var(--muted)]">{label}</span>
      <span className="mt-0.5 block text-xl font-semibold tabular-nums">{wert}</span>
      {hinweis ? <span className={cn("mt-0.5 block truncate text-xs", ton === "schlecht" ? "text-rose-700" : ton === "gut" ? "text-emerald-700" : "text-[color:var(--muted)]")}>{hinweis}</span> : null}
    </>
  );
  if (href)
    return (
      <Link href={href} className={klasse} data-funktion={funktion}>
        {inhalt}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" className={klasse} data-funktion={funktion}>
      {inhalt}
    </button>
  );
}

function Teil({ titel, funktion, children }: { titel?: string; funktion: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-3" data-funktion={funktion}>
      {titel ? <h3 className="pt-2 text-[15px] font-semibold">{titel}</h3> : null}
      {children}
    </div>
  );
}

export function GeldUebersicht({
  data,
  produkte,
  vertrieb,
  bwa,
  ergebnis,
  offen,
  kanal,
}: {
  data: ZahlenData;
  produkte: ProdukteData;
  vertrieb: VertriebZahlen;
  bwa: BwaData;
  /** Betriebsergebnis des letzten abgeschlossenen Monats (BWA), null ohne Daten */
  ergebnis: { monat: string; wert: number } | null;
  offen: { summe: number; anzahl: number; ueberfaellig: number };
  /** „Kunden nach Kanal“ (Server-Baustein) im Abschnitt Wachstum */
  kanal: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [auf, setAuf] = useState<Abschnitt[]>([]);
  const [drill, setDrill] = useState<ZahlenDrill | null>(null);
  const [update, setUpdate] = useState(false);
  const h = data.headline;
  const kern = data.sicht === "kern";

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem(SPEICHER) ?? "null") as Abschnitt[] | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gemerkte Abschnitte erst nach dem Laden
      if (Array.isArray(o)) setAuf(o);
    } catch {}
    // Ohne ?sicht= in der Adresse: gemerkte Sicht wiederherstellen (wie /admin/zahlen)
    if (new URLSearchParams(window.location.search).has("sicht")) return;
    try {
      const s = localStorage.getItem("zahlen-sicht");
      if ((s === "kern" || s === "gesamt") && s !== data.sicht) waehleSicht(s, false);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim ersten Laden
  }, []);

  function waehleSicht(s: Sicht, merken = true) {
    if (merken) {
      try {
        localStorage.setItem("zahlen-sicht", s);
      } catch {}
    }
    if (s === data.sicht) return;
    const q = new URLSearchParams(window.location.search);
    q.set("sicht", s);
    start(() => router.replace(`?${q.toString()}`, { scroll: false }));
  }

  const umschalten = (a: Abschnitt) =>
    setAuf((cur) => {
      const next = cur.includes(a) ? cur.filter((k) => k !== a) : [...cur, a];
      try {
        localStorage.setItem(SPEICHER, JSON.stringify(next));
      } catch {}
      return next;
    });

  const oeffnen = (a: Abschnitt) => {
    if (!auf.includes(a)) umschalten(a);
    requestAnimationFrame(() => document.getElementById(`geld-${a}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const mrrDiff = h.mrrPrev > 0 ? h.mrr - h.mrrPrev : null;
  const kundenDiff = h.active - h.activePrev;
  const hatUmsatz = data.totals.some((t) => t.recurring > 0);

  const abschnitte: { key: Abschnitt; titel: string; hinweis: string; funktion?: string; inhalt: () => ReactNode }[] = [
    {
      key: "wachstum",
      titel: "Wachstum",
      hinweis: "Umsatz, Vertrieb, Pay-per-Lead",
      inhalt: () => (
        <>
          <Teil funktion="zahlen-view--reiter-wachstum-umsatz-je-strom-umsatzmix">
            <Wachstum data={data} investor={false} ohneEinmal lebenszyklus="Abschnitt „Kunden“ unter Kündigung & Rückkehr" />
          </Teil>
          <Teil titel="Woher neue Kunden kommen" funktion="zahlen-view--reiter-vertrieb-pipeline-woher-kunden-kommen">
            <Vertrieb data={data} v={vertrieb} />
            {kanal}
          </Teil>
          <Teil titel={`Pay-per-Lead (Pilot ${pilotLabel(data.pplPilot.from, data.pplPilot.to)})`} funktion="zahlen-view--reiter-pay-per-lead-verkaufte-leads-je-monat">
            <Ppl data={data} />
          </Teil>
        </>
      ),
    },
    {
      key: "kunden",
      titel: "Kunden",
      hinweis: "Kohorten, Wirkung, Kündigungen",
      inhalt: () => (
        <>
          <Teil funktion="zahlen-view--reiter-kunden-kohorten-kundenbasis-abhaengigkeit">
            <Kunden data={data} investor={false} />
          </Teil>
          <Link href="/admin/neu/zahlen/kunden" className="flex min-h-12 items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 text-[15px] font-semibold shadow-[var(--shadow-sm)] hover:bg-[color:var(--surface-sunken)]">
            <span className="min-w-0 flex-1">Kündigung & Rückkehr</span>
            <span className="hidden text-xs font-normal text-[color:var(--muted)] sm:inline">Ruhephase, Rückkehr, Halteangebote</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
          </Link>
          <Teil titel="Wirkung beim Vertreter" funktion="zahlen-view--reiter-wirkung-beim-vertreter-pro-1-lead-bis">
            <Wirkung data={data} investor={false} />
          </Teil>
          <Teil titel="Produkte der Vertreter" funktion="zahlen-view--reiter-produkte-ueber-alle-vertreter-und-je">
            <Produkte p={produkte} />
          </Teil>
        </>
      ),
    },
    {
      key: "wirtschaft",
      titel: "Wirtschaftlichkeit",
      hinweis: "Kosten je Kunde, Marge, BWA",
      inhalt: () => (
        <>
          <Teil funktion="zahlen-view--reiter-wirtschaftlichkeit-kundengewinnung">
            <Wirtschaft data={data} investor={false} />
          </Teil>
          <Teil titel="BWA" funktion="zahlen-view-bwa--reiter-bwa-mit-drill-down-je-zeile-und-hinweis">
            <BwaTab d={bwa} />
          </Teil>
        </>
      ),
    },
    {
      key: "investoren",
      titel: "Für Investoren",
      hinweis: "Auswertung, Export, Update",
      inhalt: () => (
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5">
          <p className="text-sm text-[color:var(--muted)]">Bindung, Marge, Kundenwert und Kohorten mit Erklärung, zum Weitergeben als PDF oder CSV.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/neu/zahlen/auswertung?sicht=${data.sicht}`} className={buttonClass("primary")}>
              Auswertung öffnen
            </Link>
            <a href={`/admin/neu/zahlen/auswertung/export?format=pdf&sicht=${data.sicht}`} download className={buttonClass("secondary")}>
              <Download className="h-3.5 w-3.5" />
              PDF
            </a>
            <a href={`/admin/neu/zahlen/auswertung/export?format=csv&sicht=${data.sicht}`} download className={buttonClass("secondary")}>
              CSV
            </a>
            <button type="button" onClick={() => setUpdate(true)} className={buttonClass("secondary")} data-funktion="actions-saveupdatetextsaction--investoren-update-highlights-texte-speichern">
              Investoren-Update schreiben
            </button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div style={ZAHLEN_PALETTE} className="space-y-4">
      <ZahlenTooltip />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[color:var(--muted)]">
          Stand {new Date(data.generatedAt).toLocaleDateString("de-DE")} · {monat(data.current)} hochgerechnet{kern ? " · ohne Pay-per-Lead" : ""}
        </p>
        <div className="inline-flex items-center gap-1.5">
          <div role="radiogroup" aria-label="Sicht" className={cn("inline-flex rounded-full border border-[color:var(--border)] bg-white p-0.5 text-sm", pending && "opacity-60")} data-sicht={data.sicht} data-funktion="zahlen-view-sicht--sicht-kerngeschaeft-oder-gesamt-mit-pay-per-lead">
            {(["kern", "gesamt"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={data.sicht === s}
                disabled={pending}
                onClick={() => waehleSicht(s)}
                className={cn("min-h-10 rounded-full px-3 sm:min-h-8", data.sicht === s ? "bg-[color:var(--foreground)] font-semibold text-white" : "text-[color:var(--muted)]")}
              >
                {s === "kern" ? "Kerngeschäft" : "Gesamt"}
              </button>
            ))}
          </div>
          <InfoHinweis begriff="Kerngeschäft und Gesamt" text={SICHT_ERKLAERT} />
        </div>
      </div>

      {!hatUmsatz ? (
        <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {kern ? "Noch kein Umsatz im Kerngeschäft. Unter „Gesamt“ steht der Pay-per-Lead-Pilot." : "Noch keine Umsätze erfasst."}
        </p>
      ) : null}

      <section aria-label="Kennzahlen" className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" data-funktion="zahlen-view--kennzahlen-kacheln-mrr-kunden-churn-cac zahlen-view-setdrill--kachel-aufklappen-drill-down-kunden-je-kennzahl">
        <Kachel
          label="MRR"
          wert={kEur(h.mrr)}
          hinweis={mrrDiff != null ? `${mrrDiff >= 0 ? "+" : "−"}${kEur(Math.abs(mrrDiff))} seit ${monat(data.lastComplete).slice(0, 3)}.` : `${monat(data.current)} hochgerechnet`}
          ton={mrrDiff == null ? undefined : mrrDiff >= 0 ? "gut" : "schlecht"}
          onClick={() => setDrill("mrr")}
        />
        <Kachel
          label={`Ergebnis ${ergebnis ? monat(ergebnis.monat) : "Vormonat"}`}
          wert={ergebnis ? kEur(ergebnis.wert) : "fehlt"}
          hinweis={ergebnis ? (ergebnis.wert >= 0 ? "Gewinn nach allen Kosten" : "Verlust nach allen Kosten") : "Kosten vervollständigen"}
          ton={ergebnis ? (ergebnis.wert >= 0 ? "gut" : "schlecht") : undefined}
          // Ohne vollständige Kosten führt die Kachel dorthin, wo man sie ergänzt (SUS-Prüfung 20.11.2026)
          onClick={ergebnis ? () => oeffnen("wirtschaft") : undefined}
          href={ergebnis ? undefined : "/admin/neu/zahlen/kosten"}
        />
        <Kachel
          label="Aktive Kunden"
          wert={String(h.active)}
          hinweis={kundenDiff ? `${kundenDiff > 0 ? "+" : ""}${kundenDiff} zum Vormonat` : "wie im Vormonat"}
          ton={kundenDiff > 0 ? "gut" : kundenDiff < 0 ? "schlecht" : undefined}
          onClick={() => setDrill("active")}
        />
        <Kachel
          label="Offene Posten"
          wert={offen.anzahl ? eur(offen.summe) : "0 €"}
          hinweis={offen.anzahl ? (offen.ueberfaellig ? `${offen.ueberfaellig} überfällig` : `${offen.anzahl} ${offen.anzahl === 1 ? "Rechnung" : "Rechnungen"}`) : "alles bezahlt"}
          ton={offen.ueberfaellig ? "schlecht" : offen.anzahl ? undefined : "gut"}
          href="/admin/neu/zahlen/offene-posten"
        />
      </section>

      <div className="space-y-3">
        {abschnitte.map((a) => {
          const istAuf = auf.includes(a.key);
          return (
            <section key={a.key} id={`geld-${a.key}`} className="min-w-0 scroll-mt-20" data-abschnitt={a.key}>
              <button
                type="button"
                aria-expanded={istAuf}
                onClick={() => umschalten(a.key)}
                className="flex min-h-12 w-full items-center gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 text-left shadow-[var(--shadow-sm)] hover:bg-[color:var(--surface-sunken)]"
              >
                <ChevronRight className={cn("h-4 w-4 shrink-0 text-[color:var(--muted)] transition-transform", istAuf && "rotate-90")} />
                <span className="min-w-0 flex-1 text-[15px] font-semibold">{a.titel}</span>
                <span className="hidden shrink-0 text-xs text-[color:var(--muted)] sm:inline">{a.hinweis}</span>
              </button>
              {istAuf ? <div className="mt-3 space-y-4">{a.inhalt()}</div> : null}
            </section>
          );
        })}
      </div>

      {update ? <UpdateSheet data={data} onClose={() => setUpdate(false)} /> : null}
      {drill ? <DrillSheet kind={drill} data={data} onClose={() => setDrill(null)} /> : null}
    </div>
  );
}
