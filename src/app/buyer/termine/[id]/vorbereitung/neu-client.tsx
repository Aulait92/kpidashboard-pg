"use client";

// Neue Terminvorbereitung (Ole, 15.11.2026), Oberfläche nach docs/ux/terminvorbereitung-entwurf.html:
// Kopf mit einer Hauptaktion („Präsentation öffnen“, am Handy in fester Leiste), „Noch klären“ zum Abhaken,
// Angebote aus dem Tarifkatalog mit Sparten-Reitern, Beitrag je Tarif, „Meine Merkmale“ 5 von 5, Bausteine 2 von 2,
// Tarife ändern, eigener Tarif, Angebot ablegen (KI übernimmt nur Preise), Live-Vorschau der echten Vergleichsfolie.
// Autosave ohne Speichern-Knopf.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Calculator, CalendarDays, Check, ChevronDown, Copy, ExternalLink, Phone, Plus, Presentation, RotateCcw, Search, Star, Video, X } from "lucide-react";
import { Button, buttonClass, Card } from "@/components/ui";
import { FileDrop } from "@/components/ui/file-drop";
import { ActionSheet, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { folienEinpassen } from "@/lib/folien-einpassen";
import { folien, type Marke } from "@/lib/praesentation";
import type { Ansprache } from "@/lib/ansprache";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";
import { auswahlDazu, auswahlWeg, gesellschaftName, tarifeFuer, type Katalog, type Vertrieb } from "@/lib/tarifkatalog";
import {
  betrag,
  empfehlungVon,
  gezeigteTarife,
  grenzenFuer,
  sparteNeu,
  tarifAusEigenem,
  tarifAusKatalog,
  tarifEinfuegen,
  tarifMonat,
  ungepruefteBeitraege,
  zuAngebote,
  type MeineAuswahl,
  type SparteWahl,
  type Tarifauswahl,
  type TarifWahl,
} from "@/lib/tarifauswahl";
import type { EigenerTarifZeile } from "@/lib/tarifauswahl-server";
import { angabenText, pruefEtikett, rechnerUrl, type RechnerAngabe } from "@/lib/preise/pilot";
import { setPreparedAction } from "./actions";
import { eigenerTarifAction, gesellschaftAction, klaerenAction, preiseAuslesenAction, tarifauswahlSpeichernAction } from "./neu-actions";
import { BeitragGesamt, ChanceImTermin } from "./schutz-client";
import { SCHUTZ_SPARTEN } from "@/lib/schutz-ueberblick";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const geld = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));
const stand = (s: string | null) => (s ? s.replace(/^(\d{4})-(\d{2}).*$/, "$2/$1") : null);
const KUERZEL: Record<string, string> = { allianz: "AZ", axa: "AXA", "signal iduna": "SI" };
const kuerzel = (g: string) => KUERZEL[g.toLowerCase()] ?? (g.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 3).toUpperCase() || "?");
const STANDARD_GESELLSCHAFTEN = ["allianz", "axa", "signal-iduna"];

type Status = "ruhe" | "speichert" | "gespeichert" | "fehler";

export type AngeboteProps = {
  auswahl: Tarifauswahl;
  quelle: "gespeichert" | "angebote" | "neu";
  katalog: Katalog;
  vertrieb: Vertrieb;
  gesellschaftFehlt: boolean;
  gesellschaften: { key: string; name: string }[];
  eigene: EigenerTarifZeile[];
  meine: MeineAuswahl;
  /** Beiträge rechnen (Pilot): freigeschaltete „<gesellschaft>/<sparte>“ und die Rechner-Angaben je Sparte */
  rechnen: { aktiv: string[]; angaben: Record<string, RechnerAngabe[]> };
  /** Schutz-Überblick eben vorgeschlagen: gleich mitspeichern, damit die Präsentation ihn zeigt */
  schutzNeu?: boolean;
};

export function VorbereitungNeu(p: {
  id: string;
  leadId: string | null;
  readOnly: boolean;
  kopf: { name: string; zeit: string; modus: string; produkt: string; vorbereitet: boolean };
  willKarte: ReactNode;
  mehr: ReactNode;
  klaeren: { punkte: string[]; erledigt: string[] };
  angebote: AngeboteProps;
  vorschau: { termin: Omit<VorbereitungDaten, "termin"> & { termin: Omit<VorbereitungDaten["termin"], "startsAt"> & { startsAt: string } }; marke: Marke; css: string; ansprache: Ansprache };
}) {
  const router = useRouter();
  const toast = useToast();
  const [auswahl, setAuswahl] = useState(p.angebote.auswahl);
  const ref = useRef(auswahl);
  // Zähler für Änderungen von außen (PDF, Rückgängig): Eingabefelder übernehmen dann den neuen Wert
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<Status>("ruhe");
  const offen = useRef<Tarifauswahl | null>(null);
  const laeuft = useRef<Promise<unknown> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speichern = async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (laeuft.current) await laeuft.current;
    const a = offen.current;
    if (!a || p.readOnly) return true;
    offen.current = null;
    setStatus("speichert");
    let ok = false;
    const pr = tarifauswahlSpeichernAction(p.id, a).then(
      (r) => void (ok = r.ok),
      () => void (ok = false),
    );
    laeuft.current = pr;
    await pr;
    laeuft.current = null;
    if (!ok) {
      if (!offen.current) offen.current = a;
      setStatus("fehler");
      return false;
    }
    if (offen.current) return speichern();
    setStatus("gespeichert");
    return true;
  };
  const planen = (a: Tarifauswahl) => {
    if (p.readOnly) return;
    offen.current = a;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void speichern(), 600);
  };
  /** Auswahl ändern (immer auf dem neuesten Stand, auch aus „Rückgängig“ heraus) und speichern. */
  const aendern = (fn: (a: Tarifauswahl) => void, extern = false) => {
    const n = structuredClone(ref.current);
    fn(n);
    ref.current = n;
    setAuswahl(n);
    if (extern) setVersion((v) => v + 1);
    planen(n);
  };

  // Erste Vorauswahl gleich speichern, damit die Präsentation sie zeigt; ältere Angebote bleiben, bis etwas geändert wird
  const erst = useRef(false);
  useEffect(() => {
    if (erst.current) return;
    erst.current = true;
    if ((p.angebote.quelle === "neu" || (p.angebote.schutzNeu && p.angebote.quelle !== "angebote")) && !p.readOnly) planen(ref.current);
  });
  useEffect(() => {
    const weg = () => void speichern();
    const warnen = (e: BeforeUnloadEvent) => {
      if (offen.current || laeuft.current) e.preventDefault();
    };
    window.addEventListener("pagehide", weg);
    window.addEventListener("beforeunload", warnen);
    return () => {
      window.removeEventListener("pagehide", weg);
      window.removeEventListener("beforeunload", warnen);
    };
  });
  useEffect(() => {
    if (status !== "gespeichert") return;
    const t = setTimeout(() => setStatus((s) => (s === "gespeichert" ? "ruhe" : s)), 1500);
    return () => clearTimeout(t);
  }, [status]);

  const praesentation = `/buyer/termine/${p.id}/praesentation?von=vorbereitung`;
  // Richtwerte (Pilot „Beiträge rechnen“): vor der Präsentation kurz darauf hinweisen, nie unbemerkt beim Kunden
  const [pruefHinweis, setPruefHinweis] = useState(false);
  const [springeZu, setSpringeZu] = useState<{ key: string; n: number } | null>(null);
  const ungeprueft = ungepruefteBeitraege(auswahl);
  const oeffnen = async (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (ungepruefteBeitraege(ref.current).length) {
      e.preventDefault();
      setPruefHinweis(true);
      return;
    }
    if (!offen.current && !laeuft.current) return;
    e.preventDefault();
    await speichern();
    router.push(praesentation);
  };

  const [vorbereitet, setVorbereitet] = useState(p.kopf.vorbereitet);
  const vorbereitetUmschalten = async () => {
    const next = !vorbereitet;
    setVorbereitet(next);
    const r = await setPreparedAction(p.id, next);
    if (!r.ok) setVorbereitet(!next);
    toast.show(r.ok ? { message: next ? "Als vorbereitet markiert" : "Markierung entfernt" } : { message: r.error ?? "Fehler", tone: "error" });
  };

  return (
    <div data-terminvorbereitung-neu>
      {/* Kopf: wer, wann, wie, was. Eine Hauptaktion. */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Termin mit {p.kopf.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5" data-termin-chips>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-2.5 text-[13px] font-medium text-[color:var(--brand-dark)]">
              <CalendarDays className="h-3.5 w-3.5" />
              {p.kopf.zeit}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-white px-2.5 text-[13px] font-medium">
              {p.kopf.modus.startsWith("Video") ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
              {p.kopf.modus}
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-[color:var(--border)] bg-white px-2.5 text-[13px] font-medium">{p.kopf.produkt}</span>
            {vorbereitet ? (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-[13px] font-medium text-emerald-700">
                <Check className="h-3.5 w-3.5" /> Vorbereitet
              </span>
            ) : null}
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <Button variant="ghost" size="md" icon={vorbereitet ? RotateCcw : Check} disabled={p.readOnly} onClick={vorbereitetUmschalten} data-termin-vorbereitet>
            {vorbereitet ? "Doch nicht vorbereitet" : "Als vorbereitet markieren"}
          </Button>
          <a href={praesentation} onClick={oeffnen} className={buttonClass("primary", "md")} data-praesentation-oeffnen>
            <Presentation className="h-4 w-4" /> Präsentation öffnen
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        {p.willKarte}
        <Klaeren id={p.id} punkte={p.klaeren.punkte} erledigt={p.klaeren.erledigt} readOnly={p.readOnly} />
      </div>

      <Angebote
        key={p.angebote.vertrieb.gesellschaften.join(",")}
        id={p.id}
        leadId={p.leadId}
        readOnly={p.readOnly}
        daten={p.angebote}
        auswahl={auswahl}
        version={version}
        aendern={aendern}
        status={status}
        erneut={() => void speichern()}
        vorschau={p.vorschau}
        vorSpeichern={async () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
          offen.current = null;
          while (laeuft.current) await laeuft.current;
        }}
        neuLaden={() => router.refresh()}
        springeZu={springeZu}
      />

      <ActionSheet
        open={pruefHinweis}
        onClose={() => setPruefHinweis(false)}
        title="Beiträge noch nicht bestätigt"
        message={`${ungeprueft.length === 1 ? "Ein Beitrag ist" : `${ungeprueft.length} Beiträge sind`} nur ein Richtwert aus dem Angebot (${[...new Set(ungeprueft.map((u) => u.label))].join(", ")}). Bitte kurz prüfen.`}
        actions={[
          {
            label: "Jetzt prüfen",
            icon: Check,
            tone: "primary",
            onSelect: () => {
              if (ungeprueft[0]) setSpringeZu((x) => ({ key: ungeprueft[0].sparte, n: (x?.n ?? 0) + 1 }));
              document.getElementById("angebote")?.scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
          {
            label: "Trotzdem öffnen",
            icon: Presentation,
            onSelect: () => void speichern().then(() => router.push(praesentation)),
          },
        ]}
      />

      <div className="mt-5">{p.mehr}</div>

      {/* Handy: Hauptaktion in fester Leiste über der Navigation */}
      <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t border-[color:var(--border)] bg-white/95 px-4 py-2.5 backdrop-blur md:hidden" data-aktionsleiste>
        <button
          type="button"
          onClick={vorbereitetUmschalten}
          disabled={p.readOnly}
          aria-label={vorbereitet ? "Doch nicht vorbereitet" : "Als vorbereitet markieren"}
          title={vorbereitet ? "Doch nicht vorbereitet" : "Als vorbereitet markieren"}
          className={cn(
            "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border bg-white px-3 text-sm font-semibold disabled:opacity-50",
            vorbereitet ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[color:var(--border)] text-[color:var(--muted)]",
          )}
        >
          {/* Beschriftet statt nur Haken (16.11.2026): ohne Text war unklar, was der Knopf tut */}
          <Check className="h-5 w-5" /> Vorbereitet
        </button>
        <a href={praesentation} onClick={oeffnen} className={buttonClass("primary", "md", "h-11 flex-1 text-[15px]")}>
          <Presentation className="h-4 w-4" /> Präsentation öffnen
        </a>
      </div>
    </div>
  );
}

// ─── Noch klären im Termin ──────────────────────────────────────────────────────────────────

function Klaeren({ id, punkte, erledigt: start, readOnly }: { id: string; punkte: string[]; erledigt: string[]; readOnly: boolean }) {
  const toast = useToast();
  const [erledigt, setErledigt] = useState(start);
  const offen = punkte.filter((x) => !erledigt.includes(x)).length;
  const umschalten = async (x: string) => {
    const neu = erledigt.includes(x) ? erledigt.filter((y) => y !== x) : [...erledigt, x];
    setErledigt(neu);
    if (readOnly) return;
    const r = await klaerenAction(id, neu);
    if (!r.ok) toast.show({ message: r.error, tone: "error" });
  };
  return (
    <Card className="h-full">
      <div className="border-b border-[color:var(--border)] px-5 py-3.5">
        <h2 className="text-[15px] font-semibold tracking-tight">
          Noch klären im Termin{punkte.length ? <span className="ml-1.5 font-normal text-[color:var(--muted)]">{offen}</span> : null}
        </h2>
      </div>
      <div className="px-5 py-2.5 text-sm" data-noch-klaeren>
        {punkte.length ? (
          punkte.map((x) => {
            const an = erledigt.includes(x);
            return (
              <button key={x} type="button" role="checkbox" aria-checked={an} onClick={() => void umschalten(x)} className="flex min-h-10 w-full items-center gap-2.5 py-1 text-left">
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2", an ? "border-emerald-600 bg-emerald-600 text-white" : "border-[color:var(--border-strong)] bg-white")}>
                  {an ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                </span>
                <span className={an ? "text-[color:var(--muted)] line-through" : ""}>{x}</span>
              </button>
            );
          })
        ) : (
          <p className="flex items-center gap-2 py-1 text-[color:var(--muted)]">
            <Check className="h-4 w-4 text-emerald-600" /> Alles Nötige ist bekannt.
          </p>
        )}
      </div>
    </Card>
  );
}

// ─── Angebote ───────────────────────────────────────────────────────────────────────────────

type DateiZeile = { id: number; name: string; status: "laedt" | "liest" | "fertig" | "fehler"; text?: string };

function Angebote(p: {
  id: string;
  leadId: string | null;
  readOnly: boolean;
  daten: AngeboteProps;
  auswahl: Tarifauswahl;
  version: number;
  aendern: (fn: (a: Tarifauswahl) => void, extern?: boolean) => void;
  status: Status;
  erneut: () => void;
  vorschau: Parameters<typeof VorbereitungNeu>[0]["vorschau"];
  vorSpeichern: () => Promise<void>;
  neuLaden: () => void;
  /** „Jetzt prüfen“ im Hinweis vor der Präsentation: diese Sparte zeigen */
  springeZu: { key: string; n: number } | null;
}) {
  const toast = useToast();
  const { katalog, vertrieb } = p.daten;
  const [aktiv, setAktiv] = useState<string | null>(p.auswahl.sparten[0]?.key ?? null);
  const [rechnenOffen, setRechnenOffen] = useState(false);
  // „Jetzt prüfen“: Sparte beim Rendern umstellen (ohne Effekt)
  const [gesprungen, setGesprungen] = useState(p.springeZu);
  if (p.springeZu !== gesprungen) {
    setGesprungen(p.springeZu);
    if (p.springeZu) setAktiv(p.springeZu.key);
  }
  const sp = p.auswahl.sparten.find((s) => s.key === aktiv) ?? p.auswahl.sparten[0] ?? null;
  const [eigene, setEigene] = useState(p.daten.eigene);
  const [dateien, setDateien] = useState<DateiZeile[]>([]);
  const ro = p.readOnly;

  /** Änderung an der aktiven Sparte */
  const anSparte = (fn: (s: SparteWahl) => void, extern = false) =>
    p.aendern((a) => {
      const s = a.sparten.find((x) => x.key === sp?.key);
      if (s) fn(s);
    }, extern);
  const anTarif = (id: string, fn: (t: TarifWahl, s: SparteWahl) => void) =>
    anSparte((s) => {
      const t = s.tarife.find((x) => x.id === id);
      if (t) fn(t, s);
    });

  const nochFrei = katalog.sparten.filter((s) => !p.auswahl.sparten.some((x) => x.key === s.key));
  const sparteDazu = (key: string) => {
    const neu = sparteNeu(katalog, key, vertrieb, p.daten.meine);
    if (!neu) return;
    p.aendern((a) => {
      a.sparten.push(neu);
      // auch im Überblick (Folie „Ihr Schutz im Überblick“), falls es ihn gibt
      if (a.schutz && SCHUTZ_SPARTEN[key] && !a.schutz.some((x) => x.key === key)) a.schutz.push({ key, label: SCHUTZ_SPARTEN[key], status: "pruefen" });
    });
    setAktiv(key);
  };
  /**
   * Sparte aus „Chance im Termin“ bzw. dem Kombi-Hinweis in die Angebote: Chancen erst „bei Bedarf“ (Präsentation:
   * „Mit anschauen“ auf „Ihr Schutz im Überblick“), der Kombi-Hinweis gleich ins Paket. Ist sie schon da: hinspringen.
   */
  const anbieten = (key: string, direkt = false) => {
    const da = p.auswahl.sparten.find((s) => s.key === key);
    if (da) {
      if (direkt && da.zusatz) p.aendern((a) => void delete a.sparten.find((s) => s.key === key)!.zusatz);
      setAktiv(key);
      return;
    }
    const neu = sparteNeu(katalog, key, vertrieb, p.daten.meine);
    if (!neu) return;
    if (!direkt) neu.zusatz = true;
    p.aendern((a) => {
      a.sparten.push(neu);
      if (a.schutz && !a.schutz.some((x) => x.key === key)) a.schutz.push({ key, label: SCHUTZ_SPARTEN[key] ?? neu.label, status: "pruefen" });
    });
    setAktiv(key);
  };
  const sparteWeg = () => {
    if (!sp) return;
    const vorher = structuredClone(sp);
    const index = p.auswahl.sparten.findIndex((x) => x.key === sp.key);
    p.aendern((a) => void (a.sparten = a.sparten.filter((x) => x.key !== vorher.key)));
    setAktiv(p.auswahl.sparten.find((x) => x.key !== vorher.key)?.key ?? null);
    toast.show({
      message: `${vorher.label} entfernt`,
      actionLabel: "Rückgängig",
      onAction: () => {
        p.aendern((a) => void a.sparten.splice(Math.min(index, a.sparten.length), 0, vorher), true);
        setAktiv(vorher.key);
      },
    });
  };

  // Angebot ablegen: im Kontakt speichern, dann liest die KI nur die Preise
  const ablegen = async (files: File[]) => {
    if (!p.leadId || !files.length) return;
    const zeile: DateiZeile = { id: Date.now(), name: files.map((f) => f.name).join(", "), status: "laedt" };
    const setze = (x: Partial<DateiZeile>) => setDateien((ds) => ds.map((d) => (d.id === zeile.id ? { ...d, ...x } : d)));
    setDateien((ds) => [...ds, zeile]);
    try {
      for (const file of files) {
        const res = await fetch(`/api/buyer/leads/${p.leadId}/dateien?kind=angebot`, {
          method: "POST",
          headers: { "x-file-name": encodeURIComponent(file.name), "content-type": "application/octet-stream" },
          body: file,
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(`${file.name}: ${j.error ?? "Hochladen hat nicht geklappt."}`);
      }
    } catch (e) {
      return setze({ status: "fehler", text: e instanceof Error ? e.message : "Hochladen hat nicht geklappt." });
    }
    setze({ status: "liest" });
    await p.vorSpeichern();
    const r = await preiseAuslesenAction(p.id, p.auswahl).catch(() => ({ ok: false as const, error: "Auslesen hat nicht geklappt. Bitte Beiträge eintragen." }));
    if (!r.ok) return setze({ status: "fehler", text: r.error });
    p.aendern((a) => void (a.sparten = r.auswahl.sparten), true);
    setze({ status: "fertig", text: r.anzahl ? `Beiträge übernommen: ${r.sparten.join(", ")}` : "Keine passenden Beiträge gefunden, bitte eintragen." });
  };

  const gesellschaftWaehlen = async (keys: string[]) => {
    await p.vorSpeichern();
    const r = await gesellschaftAction(p.id, keys, p.auswahl);
    if (!r.ok) return toast.show({ message: r.error, tone: "error" });
    if (r.auswahl) {
      const neu = r.auswahl;
      p.aendern((a) => void (a.sparten = neu.sparten), true);
    }
    p.neuLaden();
  };

  // Beiträge rechnen (Pilot): offizieller Rechner der ersten freigeschalteten Gesellschaft dieser Sparte
  const rechnerTarif = sp?.tarife.find((t) => rechnerUrl(p.daten.rechnen.aktiv, t.gesellschaftKey, sp.key));
  const rechnerAdresse = sp && rechnerTarif ? rechnerUrl(p.daten.rechnen.aktiv, rechnerTarif.gesellschaftKey, sp.key) : null;
  const rechner = sp && rechnerTarif && rechnerAdresse ? { url: rechnerAdresse, gesellschaft: rechnerTarif.gesellschaft, angaben: p.daten.rechnen.angaben[sp.key] ?? [] } : null;
  const ablegenLaeuft = dateien.some((d) => d.status === "laedt" || d.status === "liest");

  const gesellschaftsListe = [...new Map([...p.daten.gesellschaften, ...STANDARD_GESELLSCHAFTEN.map((key) => ({ key, name: gesellschaftName(key) }))].map((g) => [g.key, g])).values()];

  return (
    <Card id="angebote" className="mt-5" menus>
      <div className="flex items-center gap-3 border-b border-[color:var(--border)] px-4 py-3.5 sm:px-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Angebote</h2>
        <SpeicherStatus status={p.status} readOnly={ro} erneut={p.erneut} />
      </div>

      {p.daten.gesellschaftFehlt ? (
        <div className="mx-4 mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm sm:mx-5" data-gesellschaft-waehlen>
          <p className="font-medium">Welche Gesellschaft vertreten Sie?</p>
          {/* Häufig: die drei Vertreter-Gesellschaften als Knöpfe; alle übrigen Katalog-Gesellschaften in einer Auswahl */}
          <div className="mt-2 flex flex-wrap gap-2">
            {gesellschaftsListe
              .filter((g) => STANDARD_GESELLSCHAFTEN.includes(g.key))
              .map((g) => (
                <Button key={g.key} size="sm" disabled={ro} onClick={() => void gesellschaftWaehlen([g.key])}>
                  {g.name}
                </Button>
              ))}
            <select
              aria-label="Andere Gesellschaft"
              disabled={ro}
              value=""
              onChange={(e) => e.target.value && void gesellschaftWaehlen([e.target.value])}
              className="h-9 min-w-0 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-3 text-sm font-medium"
              data-gesellschaft-andere
            >
              <option value="">Andere …</option>
              {gesellschaftsListe
                .filter((g) => !STANDARD_GESELLSCHAFTEN.includes(g.key))
                .map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.name}
                  </option>
                ))}
              <option value="andere">Nicht in der Liste</option>
            </select>
          </div>
        </div>
      ) : null}

      {/* Sparten-Reiter, vorausgewählt aus dem Formular */}
      <div className="relative flex flex-wrap gap-1.5 px-4 pt-3 sm:px-5" role="tablist" data-sparten>
        {p.auswahl.sparten.map((s) => {
          const e = empfehlungVon(s);
          const m = e ? tarifMonat(s, e) : null;
          const an = s.key === sp?.key;
          return (
            <span
              key={s.key}
              className={cn(
                "inline-flex h-10 items-center rounded-full border text-sm font-semibold sm:h-9",
                an ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white" : "border-[color:var(--border)] bg-white",
              )}
            >
              <button type="button" role="tab" aria-selected={an} onClick={() => setAktiv(s.key)} className={cn("inline-flex h-full items-center gap-1.5 pl-3.5", an && !ro ? "pr-1" : "pr-3.5")}>
                {s.label}
                {s.zusatz ? (
                  <small className={cn("text-xs font-medium", an ? "opacity-80" : "text-[color:var(--muted)]")}>bei Bedarf</small>
                ) : (
                  <small className={cn("text-xs font-medium", an ? "opacity-80" : m == null ? "text-amber-700" : "text-[color:var(--muted)]")}>{m != null ? eur(m) : "Beitrag fehlt"}</small>
                )}
              </button>
              {/* Ole, 16.11.2026: „ich kann kein Produkt wieder entfernen“ (stand nur unter „Tarife ändern“) */}
              {an && !ro ? (
                <button type="button" aria-label={`${s.label} entfernen`} title={`${s.label} entfernen`} onClick={sparteWeg} className="mr-0.5 flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/20 sm:mr-1 sm:h-7 sm:w-7" data-sparte-entfernen>
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
          );
        })}
        {nochFrei.length && !ro ? (
          <details className="sm:relative">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-1 rounded-full border border-dashed sm:h-9 border-[color:var(--border-strong)] bg-white px-3.5 text-sm font-medium text-[color:var(--muted)] [&::-webkit-details-marker]:hidden">
              <Plus className="h-3.5 w-3.5" /> Versicherung
            </summary>
            <div className="absolute left-4 z-20 mt-1 max-h-72 w-60 overflow-auto sm:left-0 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-1 shadow-[var(--shadow-lg)]">
              {nochFrei.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm hover:bg-[color:var(--surface-sunken)]"
                  onClick={(e) => {
                    (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                    sparteDazu(s.key);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <ChanceImTermin auswahl={p.auswahl} ro={ro} aendern={p.aendern} anbieten={(key) => anbieten(key)} />

      {sp ? (
        <div className="grid gap-5 px-4 pb-5 pt-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            {sp.zusatz ? (
              // Cross-Selling: erst bei Bedarf, in der Präsentation über „Mit anschauen“
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-[13px]" data-zusatz-hinweis>
                <span className="min-w-0 flex-1 text-[color:var(--muted)]">Bei Bedarf: in der Präsentation erst über „Mit anschauen“.</span>
                {!ro ? (
                  <button type="button" onClick={() => anSparte((s) => void delete s.zusatz)} className="-my-2 py-2 font-semibold text-[color:var(--brand)] hover:underline" data-zusatz-aus>
                    Gleich zeigen
                  </button>
                ) : null}
              </div>
            ) : null}
            {rechner ? (
              // Mit Rechner: beide Wege zum Beitrag in einer Zeile statt Knopf über der Ablagefläche
              <div className="grid gap-2 sm:flex sm:flex-wrap" data-beitraege-zeile>
                <Button size="md" icon={Calculator} onClick={() => setRechnenOffen(true)} data-beitraege-rechnen>
                  Beiträge rechnen
                </Button>
                {p.leadId && !ro ? (
                  <FileDrop
                    variant="button"
                    size="md"
                    instant
                    multiple
                    maxFiles={5}
                    accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                    maxBytes={15 * 1024 * 1024}
                    label="Angebot ablegen"
                    hint={null}
                    busy={ablegenLaeuft}
                    pendingLabel="Wird gelesen …"
                    buttonClassName="w-full sm:w-auto"
                    onFiles={(fs) => void ablegen(fs)}
                  />
                ) : null}
                <BeitraegeRechnen
                  open={rechnenOffen}
                  onClose={() => setRechnenOffen(false)}
                  sparte={sp.label}
                  {...rechner}
                  ablegen={
                    p.leadId && !ro
                      ? (fs) => {
                          setRechnenOffen(false);
                          void ablegen(fs);
                        }
                      : null
                  }
                  busy={ablegenLaeuft}
                />
              </div>
            ) : p.leadId && !ro ? (
              <FileDrop
                variant="zone"
                instant
                multiple
                maxFiles={5}
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                maxBytes={15 * 1024 * 1024}
                label="Angebot ablegen"
                hint="Nur Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierangebote; die Beiträge werden übernommen."
                busy={dateien.some((d) => d.status === "laedt" || d.status === "liest")}
                pendingLabel="Wird gelesen …"
                onFiles={(fs) => void ablegen(fs)}
              />
            ) : null}
            {dateien.map((d) => (
              <div key={d.id} className="mt-2 flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-[13px]" data-angebot-datei>
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                {d.status === "laedt" || d.status === "liest" ? (
                  <span className="text-[color:var(--muted)]">{d.status === "laedt" ? "Wird hochgeladen …" : "Wird gelesen …"}</span>
                ) : (
                  <span className={d.status === "fertig" ? "text-emerald-700" : "text-amber-700"}>{d.text}</span>
                )}
              </div>
            ))}

            <div className="mt-3.5 grid grid-cols-1 gap-2.5" data-tarife>
              {sp.tarife.length ? (
                sp.tarife.map((t) => <TarifKarte key={t.id} sp={sp} t={t} version={p.version} ro={ro} anTarif={anTarif} anSparte={anSparte} />)
              ) : (
                <p className="py-3 text-sm text-[color:var(--muted)]">
                  Noch kein Tarif gewählt. Öffnen Sie unten „Tarife ändern“ oder legen Sie einen eigenen Tarif an.
                </p>
              )}
            </div>

            <Auswahl
              titel="Meine Merkmale"
              weitere="Weitere Merkmale"
              schema={sp.schema.merkmale}
              gewaehlt={sp.merkmale}
              max={grenzenFuer(sp).merkmale}
              nummern
              ro={ro}
              setze={(liste) => anSparte((s) => void (s.merkmale = liste))}
            />
            <Auswahl
              titel="Bausteine"
              weitere="Weitere Bausteine"
              schema={sp.schema.bausteine}
              gewaehlt={sp.bausteine}
              max={grenzenFuer(sp).bausteine}
              ro={ro}
              setze={(liste) => anSparte((s) => void (s.bausteine = liste))}
            />

            {!ro ? (
              <TarifeAendern
                key={sp.key}
                sp={sp}
                katalog={katalog}
                vertrieb={vertrieb}
                gesellschaften={p.daten.gesellschaften}
                eigene={eigene}
                anSparte={anSparte}
                eigenerDazu={(e) => setEigene((xs) => [...xs, e])}
                sparteWeg={sparteWeg}
              />
            ) : null}
          </div>

          <Vorschau auswahl={p.auswahl} sparte={sp} daten={p.vorschau} katalog={katalog}>
            <BeitragGesamt auswahl={p.auswahl} katalog={katalog} ro={ro} anbieten={(key) => anbieten(key, true)} aendern={p.aendern} />
          </Vorschau>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-[color:var(--muted)]">Noch keine Versicherung. Wählen Sie oben „+ Versicherung“, z. B. Hausrat.</p>
      )}
    </Card>
  );
}

/**
 * Beiträge rechnen (Pilot, docs/preise-pilot.md): Der Vertreter rechnet in seinem Vertriebssystem (Ole, 16.11.2026),
 * nimmt die Angaben per Kopieren mit und legt das Ergebnis als Screenshot ab. Der öffentliche Rechner nur als zweite
 * Wahl. Keine automatische Abfrage (Nutzungsbedingungen der Gesellschaft).
 */
function BeitraegeRechnen({
  open,
  onClose,
  sparte,
  gesellschaft,
  url,
  angaben,
  ablegen,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  sparte: string;
  gesellschaft: string;
  url: string;
  angaben: RechnerAngabe[];
  ablegen: ((files: File[]) => void) | null;
  busy: boolean;
}) {
  const toast = useToast();
  const kopieren = async (a: RechnerAngabe) => {
    if (!a.wert) return;
    try {
      await navigator.clipboard.writeText(a.wert);
      toast.show({ message: `${a.label} kopiert` });
    } catch {
      toast.show({ message: "Kopieren nicht möglich, bitte abtippen.", tone: "error" });
    }
  };
  // Hauptknopf: alle bekannten Angaben auf einmal kopieren, zum Einfügen im eigenen Vertriebssystem
  const alleKopieren = async () => {
    const text = angabenText(angaben);
    if (!text) return toast.show({ message: "Noch keine Angaben bekannt, bitte im Termin klären." });
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: `Angaben kopiert, jetzt im ${gesellschaft}-System einfügen` });
    } catch {
      toast.show({ message: "Kopieren nicht möglich, bitte abtippen.", tone: "error" });
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Beiträge rechnen" message={`${gesellschaft} · ${sparte}`}>
      <div className="space-y-4 px-5 py-4" data-beitraege-fenster>
        <div>
          <Button variant="primary" size="md" icon={Calculator} className="w-full" onClick={() => void alleKopieren()} data-im-system-berechnen>
            In Ihrem {gesellschaft}-System berechnen
          </Button>
          <p className="mt-2 text-sm text-[color:var(--muted)]">Rechnen Sie in Ihrem {gesellschaft}-Vertriebssystem und legen Sie das Ergebnis als Screenshot ab.</p>
        </div>
        {angaben.length ? (
          <div>
            <h3 className="mb-1.5 text-[13px] font-semibold text-[color:var(--muted)]">Angaben zum Kopieren</h3>
            <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)]" data-rechner-angaben>
              {angaben.map((a) => (
                <li key={a.label}>
                  <button
                    type="button"
                    disabled={!a.wert}
                    onClick={() => void kopieren(a)}
                    aria-label={a.wert ? `${a.label} kopieren` : undefined}
                    className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-[color:var(--surface-sunken)] disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-[color:var(--muted)]">{a.label}</span>
                      <span className={cn("block break-words text-sm font-medium", !a.wert && "text-amber-700")}>{a.wert ?? "im Termin klären"}</span>
                    </span>
                    {a.wert ? <Copy className="h-4 w-4 shrink-0 text-[color:var(--muted)]" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {ablegen ? (
          <FileDrop
            variant="button"
            size="md"
            instant
            multiple
            maxFiles={5}
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            maxBytes={15 * 1024 * 1024}
            label="Screenshot ablegen"
            hint={null}
            busy={busy}
            pendingLabel="Wird gelesen …"
            buttonClassName="w-full"
            onFiles={ablegen}
          />
        ) : null}
        {/* Zweite Wahl (Ole, 16.11.2026): öffentlicher Rechner nur als unauffälliger Textlink */}
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[color:var(--muted)] hover:underline" data-rechner-oeffnen>
          <ExternalLink className="h-3.5 w-3.5" /> Öffentlichen {gesellschaft}-Rechner öffnen
        </a>
      </div>
    </Sheet>
  );
}

function SpeicherStatus({ status, readOnly, erneut }: { status: Status; readOnly: boolean; erneut: () => void }) {
  if (readOnly) return <span className="ml-auto text-xs text-[color:var(--muted)]">Vorschau: wird nicht gespeichert</span>;
  if (status === "fehler")
    return (
      <span className="ml-auto flex items-center gap-2 text-xs text-rose-700" data-speicher-status="fehler">
        Nicht gespeichert
        <button type="button" className="font-semibold underline" onClick={erneut}>
          Erneut versuchen
        </button>
      </span>
    );
  return (
    <span className={cn("ml-auto inline-flex items-center gap-1 text-xs", status === "gespeichert" ? "text-emerald-700" : "text-[color:var(--muted)]")} data-speicher-status={status}>
      {status === "speichert" ? "Speichert …" : (
        <>
          <Check className="h-3.5 w-3.5" /> {status === "gespeichert" ? "Gespeichert" : "Automatisch gespeichert"}
        </>
      )}
    </span>
  );
}

/** Betrag eingeben („11,40“); eigener Text, damit „11,“ beim Tippen stehen bleibt. */
function GeldFeld({ wert, onWert, label, klein, ro, className }: { wert: number | null; onWert: (n: number | null) => void; label: string; klein?: boolean; ro: boolean; className?: string }) {
  const [text, setText] = useState(geld(wert));
  const leer = betrag(text) == null;
  return (
    <label
      className={cn(
        "flex items-center rounded-[var(--radius-sm)] border bg-white focus-within:border-[color:var(--brand)] focus-within:ring-2 focus-within:ring-[color:var(--brand-soft)]",
        klein ? "h-8 w-[84px] shrink-0 px-1.5" : "h-10 w-32 px-2.5",
        leer && !klein ? "border-amber-300 bg-amber-50" : "border-[color:var(--border-strong)]",
        className,
      )}
    >
      <input
        inputMode="decimal"
        aria-label={label}
        placeholder={klein ? "0,00" : "Beitrag"}
        disabled={ro}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onWert(betrag(e.target.value));
        }}
        onBlur={() => betrag(text) != null && setText(geld(betrag(text)))}
        className={cn("w-full min-w-0 bg-transparent text-right font-semibold tabular-nums outline-none", klein ? "text-xs" : "text-[15px]")}
      />
      <span className={cn("ml-1 text-[color:var(--muted)]", klein && "text-xs")}>€</span>
    </label>
  );
}

function TarifKarte({
  sp,
  t,
  version,
  ro,
  anTarif,
  anSparte,
}: {
  sp: SparteWahl;
  t: TarifWahl;
  version: number;
  ro: boolean;
  anTarif: (id: string, fn: (t: TarifWahl, s: SparteWahl) => void) => void;
  anSparte: (fn: (s: SparteWahl) => void) => void;
}) {
  const empf = empfehlungVon(sp)?.id === t.id;
  const m = tarifMonat(sp, t);
  const mitExtra = m != null && (t.zahlweise === "jahr" || Object.values(t.bausteine).some((b) => b.an));
  const bs = sp.bausteine.filter((k) => t.bausteinStatus[k] === "inklusive" || t.bausteinStatus[k] === "optional");
  const bName = (k: string) => sp.schema.bausteine.find((b) => b.key === k)?.kurz ?? k;
  // Nicht gegengeprüfte Katalogwerte: „bitte prüfen“ statt des Stands (wie der Richtwert beim Beitrag)
  const pruefen = t.herkunft === "katalog" && t.werteUngeprueft;
  const sub = [t.gesellschaft || null, sp.label, t.herkunft === "eigen" ? "Eigener Tarif" : t.herkunft === "angebot" ? "Aus dem Angebot" : !pruefen && stand(t.stand) ? `Stand ${stand(t.stand)}` : null].filter(Boolean).join(" · ");
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border bg-white min-w-0 px-3.5 py-3 transition",
        empf ? "border-[color:var(--brand)] shadow-[inset_0_0_0_1px_var(--brand)]" : "border-[color:var(--border)]",
        !t.zeigen && "bg-[color:var(--surface-sunken)] opacity-70",
      )}
      data-tarif-karte={t.id}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e6eef7] text-[11px] font-bold text-[#003781]">{kuerzel(t.gesellschaft || t.kurz || "?")}</span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[15px]">{t.kurz}</b>
          <span className="block truncate text-xs text-[color:var(--muted)]">
            {sub}
            {pruefen ? (
              <>
                {" · "}
                <span className="font-medium text-amber-700" data-werte-pruefen>
                  bitte prüfen
                </span>
              </>
            ) : null}
          </span>
        </span>
        <button
          type="button"
          disabled={ro}
          aria-pressed={empf}
          aria-label={empf ? "Ihre Empfehlung" : "Als Empfehlung markieren"}
          title={empf ? "Ihre Empfehlung" : "Als Empfehlung markieren"}
          onClick={() =>
            anSparte((s) => {
              s.empfohlen = t.id;
              const x = s.tarife.find((y) => y.id === t.id);
              if (x) x.zeigen = true;
            })
          }
          className={cn("flex h-10 w-10 items-center justify-center rounded-lg", empf ? "text-amber-500" : "text-slate-400 hover:text-amber-500")}
        >
          <Star className="h-5 w-5" fill={empf ? "currentColor" : "none"} />
        </button>
      </div>
      {/* Ruhige Spalte (Ole, 16.11.2026): Beitrag füllt die Breite, Zahlweise bündig rechts; darunter Monatsbetrag und Folie */}
      <div className="mt-2.5 flex items-center gap-2">
        <GeldFeld
          key={`${t.id}-${version}`}
          wert={t.beitrag}
          label={`Beitrag ${t.kurz}`}
          ro={ro}
          className="w-auto min-w-0 flex-1"
          onWert={(n) =>
            anTarif(t.id, (x) => {
              x.beitrag = n;
              delete x.preisPruefen; // selbst eingetragen: kein Richtwert mehr
            })
          }
        />
        <span className="inline-flex h-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--border)]" role="group" aria-label="Zahlweise">
          {(["monat", "jahr"] as const).map((z) => (
            <button
              key={z}
              type="button"
              disabled={ro}
              aria-pressed={t.zahlweise === z}
              onClick={() => anTarif(t.id, (x) => void (x.zahlweise = z))}
              className={cn("px-3 text-xs font-semibold", t.zahlweise === z ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "bg-white text-[color:var(--muted)]")}
            >
              {z === "monat" ? "Monat" : "Jahr"}
            </button>
          ))}
        </span>
      </div>
      {t.preisPruefen && t.beitrag != null ? (
        <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius-sm)] bg-amber-50 py-1 pl-2.5 pr-1 text-xs text-amber-800" data-preis-pruefen>
          <span className="min-w-0 flex-1">{pruefEtikett(t.preisPruefen)}</span>
          {!ro ? (
            <button
              type="button"
              onClick={() => anTarif(t.id, (x) => void delete x.preisPruefen)}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2.5 font-semibold text-amber-900 hover:bg-amber-100"
              data-preis-bestaetigen
            >
              <Check className="h-3.5 w-3.5" /> Bestätigen
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-1.5 flex min-h-8 items-center gap-2">
        {mitExtra ? <span className="text-xs text-[color:var(--muted)]">{eur(m!)} im Monat</span> : null}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-[color:var(--muted)]">
          In Präsentation
          <button
            type="button"
            role="switch"
            aria-checked={t.zeigen}
            disabled={ro}
            onClick={() => anTarif(t.id, (x) => void (x.zeigen = !x.zeigen))}
            className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full transition", t.zeigen ? "bg-[color:var(--brand)]" : "bg-slate-300")}
          >
            <span className={cn("absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all", t.zeigen ? "left-[19px]" : "left-[3px]")} />
          </button>
        </label>
      </div>
      {t.zeigen && !gezeigteTarife(sp).some((x) => x.id === t.id) ? (
        <p className="mt-2 text-xs text-amber-700">Nicht auf der Folie: Es passen höchstens {grenzenFuer(sp).tarife} Tarife. Blenden Sie einen anderen aus.</p>
      ) : null}
      {bs.length ? (
        <div className="mt-2.5 grid gap-1.5">
          {bs.map((k) =>
            t.bausteinStatus[k] === "inklusive" ? (
              <span key={k} className="flex min-h-10 w-full items-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-2.5 py-1 text-[13px] leading-tight">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> <span className="min-w-0 flex-1">{bName(k)}</span> <small className="text-[color:var(--muted)]">inklusive</small>
              </span>
            ) : (
              <span
                key={k}
                className={cn(
                  "flex min-h-10 w-full items-center gap-1.5 rounded-xl border py-1 pl-1.5 pr-1.5 text-[13px] leading-tight",
                  t.bausteine[k]?.an ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-[color:var(--border-strong)] bg-white",
                )}
              >
                <button
                  type="button"
                  disabled={ro}
                  aria-pressed={!!t.bausteine[k]?.an}
                  onClick={() => anTarif(t.id, (x) => void (x.bausteine[k] = { an: !x.bausteine[k]?.an, beitrag: x.bausteine[k]?.beitrag ?? null }))}
                  className="inline-flex min-h-8 min-w-0 flex-1 items-center gap-1.5 pr-0.5 text-left"
                >
                  <span className={cn("flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2", t.bausteine[k]?.an ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-[color:var(--border-strong)]")}>
                    {t.bausteine[k]?.an ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                  {bName(k)}
                </button>
                <span className="text-xs text-[color:var(--muted)]">+</span>
                <GeldFeld
                  key={`${t.id}-${k}-${version}`}
                  klein
                  ro={ro}
                  label={`Preis ${bName(k)} ${t.kurz}`}
                  wert={t.bausteine[k]?.beitrag ?? null}
                  onWert={(n) => anTarif(t.id, (x) => void (x.bausteine[k] = { an: x.bausteine[k]?.an ?? false, beitrag: n }))}
                />
              </span>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Merkmale bzw. Bausteine auf der Folie: Zähler, Entfernen, weitere zugeklappt; volle Liste: Klick tauscht gegen das letzte. */
function Auswahl({
  titel,
  weitere,
  schema,
  gewaehlt,
  max,
  nummern,
  ro,
  setze,
}: {
  titel: string;
  weitere: string;
  schema: { key: string; label: string; kurz: string }[];
  gewaehlt: string[];
  max: number;
  nummern?: boolean;
  ro: boolean;
  setze: (liste: string[]) => void;
}) {
  const toast = useToast();
  const name = (k: string) => schema.find((x) => x.key === k)?.kurz ?? k;
  const an = gewaehlt.slice(0, max);
  const aus = schema.filter((x) => !an.includes(x.key));
  const voll = an.length >= max;
  if (!schema.length) return null;
  return (
    <div className="mt-4 border-t border-[color:var(--border)] pt-3.5" data-auswahl={titel}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {titel}
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-xs font-semibold", voll ? "bg-emerald-50 text-emerald-700" : "bg-[color:var(--surface-sunken)] text-[color:var(--muted)]")}>
          {an.length} von {max}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {an.map((k, i) => (
          <span key={k} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--brand)] bg-[color:var(--brand-soft)] pl-2.5 pr-1 text-[13px] font-medium text-[color:var(--brand-dark)]">
            {nummern ? <span className="text-[11px] font-bold opacity-70">{i + 1}</span> : null}
            {name(k)}
            {!ro ? (
              <button type="button" aria-label={`${name(k)} entfernen`} onClick={() => setze(auswahlWeg(an, k))} className="relative flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/60 after:absolute after:-inset-2 after:content-['']">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </span>
        ))}
        {!an.length ? <span className="text-[13px] text-[color:var(--muted)]">Keine gewählt</span> : null}
      </div>
      {aus.length && !ro ? (
        <details className="group mt-2">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-[color:var(--muted)] [&::-webkit-details-marker]:hidden">
            {weitere} <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {aus.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => {
                  const r = auswahlDazu(an, x.key, max);
                  setze(r.liste);
                  if (r.raus) toast.show({ message: `${x.kurz} statt ${name(r.raus)}`, actionLabel: "Rückgängig", onAction: () => setze(an) });
                }}
                className="inline-flex h-8 items-center rounded-full border border-dashed border-[color:var(--border-strong)] bg-white px-2.5 text-[13px] hover:border-[color:var(--brand)] hover:text-[color:var(--brand-dark)]"
              >
                {voll ? "⇄ " : "+ "}
                {x.kurz}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** Tarife ändern: Vertreter nur ihre Gesellschaft, Makler wählen erst Gesellschaften, dann Tarife; eigener Tarif als Rückfall. */
function TarifeAendern({
  sp,
  katalog,
  vertrieb,
  gesellschaften,
  eigene,
  anSparte,
  eigenerDazu,
  sparteWeg,
}: {
  sp: SparteWahl;
  katalog: Katalog;
  vertrieb: Vertrieb;
  gesellschaften: { key: string; name: string }[];
  eigene: EigenerTarifZeile[];
  anSparte: (fn: (s: SparteWahl) => void) => void;
  eigenerDazu: (e: EigenerTarifZeile) => void;
  sparteWeg: () => void;
}) {
  const toast = useToast();
  const makler = vertrieb.rolle === "makler";
  const imKatalog = [...new Set(tarifeFuer(katalog, sp.key).map((t) => t.gesellschaft))];
  const [filter, setFilter] = useState<string[]>(makler ? (vertrieb.gesellschaften.length ? vertrieb.gesellschaften : imKatalog) : vertrieb.gesellschaften);
  const [suche, setSuche] = useState("");
  const [eigenOffen, setEigenOffen] = useState(false);
  // Viele Gesellschaften (Makler, 16.11.2026: 21 im Katalog): gewählte zuerst, höchstens 6 Chips, Rest hinter „+ n weitere“
  const [alleChips, setAlleChips] = useState(false);
  const chipQuelle = makler ? gesellschaften.filter((g) => imKatalog.includes(g.key)) : vertrieb.gesellschaften.map((key) => ({ key, name: gesellschaftName(key) }));
  // Reihenfolge nach der Auswahl beim Öffnen, damit Chips beim Antippen nicht springen
  const [startFilter] = useState(filter);
  const chipsSortiert = [...chipQuelle.filter((g) => startFilter.includes(g.key)), ...chipQuelle.filter((g) => !startFilter.includes(g.key))];
  const CHIP_MAX = 6;
  const chipsSichtbar = alleChips || chipsSortiert.length <= CHIP_MAX + 1 ? chipsSortiert : chipsSortiert.slice(0, CHIP_MAX);
  const chipsVersteckt = chipsSortiert.length - chipsSichtbar.length;

  const q = suche.trim().toLowerCase();
  const passtSuche = (s: string) => !q || s.toLowerCase().includes(q);
  const imFilter = new Set(tarifeFuer(katalog, sp.key, filter.length ? filter : makler ? imKatalog : vertrieb.gesellschaften).map((t) => t.id));
  // gewählte Tarife bleiben sichtbar (zum Abwählen), auch wenn ihre Gesellschaft gerade ausgeblendet ist
  const kat = tarifeFuer(katalog, sp.key).filter((t) => (imFilter.has(t.id) || sp.tarife.some((x) => x.id === t.id)) && passtSuche(`${t.gesellschaftName} ${t.name} ${t.kurz}`));
  const eig = eigene.filter((e) => e.sparte === sp.key && passtSuche(`${e.gesellschaft} ${e.name}`));
  const gewaehlt = new Set(sp.tarife.map((t) => t.id));
  /** Passt noch ein Tarif auf die Folie? (3; 4 Stufen einer Gesellschaft mit kurzen Werten) */
  const platz = (neu: TarifWahl) => sp.tarife.length < grenzenFuer({ ...sp, tarife: [...sp.tarife, neu] }).tarife;
  const umschalten = (neu: TarifWahl, an: boolean) =>
    anSparte((s) => {
      if (!an) {
        s.tarife = s.tarife.filter((x) => x.id !== neu.id);
        if (s.empfohlen === neu.id) s.empfohlen = null;
        return;
      }
      tarifEinfuegen(s, neu);
      const g = grenzenFuer(s);
      if (s.merkmale.length > g.merkmale) {
        s.merkmale = s.merkmale.slice(0, g.merkmale);
        toast.show({ message: `Mit ${s.tarife.length} Tarifen passen ${g.merkmale} Merkmale auf die Folie` });
      }
    });
  const filterUmschalten = (k: string) => {
    const neu = filter.includes(k) ? filter.filter((x) => x !== k) : [...filter, k];
    setFilter(neu);
    void gesellschaftAction(null, neu);
  };
  const zeile = (id: string, titel: string, ges: string, rechts: string | null, an: boolean, frei: boolean, fn: () => TarifWahl, pruefen = false) => (
    <label key={id} className={cn("flex min-h-11 items-center gap-2.5 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2.5 py-1.5 text-sm", !an && !frei ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <input type="checkbox" checked={an} disabled={!an && !frei} onChange={(e) => umschalten(fn(), e.target.checked)} className="h-4 w-4" />
      <b className="font-semibold">{titel}</b>
      {/* Gesperrte Zeile am Handy ohne Gesellschaft, sonst wird sie zu „A…“ abgeschnitten */}
      <span className={cn("truncate text-[color:var(--muted)]", !an && !frei && "hidden sm:inline")}>{ges}</span>
      <small className={cn("ml-auto shrink-0 text-xs", pruefen && (an || frei) ? "font-medium text-amber-700" : "text-[color:var(--muted)]")} data-werte-pruefen={pruefen || undefined}>
        {!an && !frei ? `höchstens ${sp.tarife.length} auf einer Folie` : pruefen ? "bitte prüfen" : rechts}
      </small>
    </label>
  );

  return (
    <details className="group mt-4" data-tarife-aendern>
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
        {/* Zustand sichtbar wie bei „Weitere Bausteine“ (Ole, 16.11.2026: „aufgeklappt müsste aus dem + ein Minus werden“) */}
        Tarife ändern <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] p-3">
        <label className="flex h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] bg-white px-2.5">
          <Search className="h-4 w-4 text-[color:var(--muted)]" />
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Tarif suchen" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div className="mb-1 mt-2.5 flex flex-wrap items-center gap-1.5" data-gesellschaften>
          {makler || vertrieb.gesellschaften.length > 1 ? (
            chipsSichtbar.map((g) => (
              <button
                key={g.key}
                type="button"
                aria-pressed={filter.includes(g.key)}
                onClick={() => filterUmschalten(g.key)}
                className={cn("h-8 rounded-full border px-3 text-xs font-semibold", filter.includes(g.key) ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white" : "border-[color:var(--border-strong)] bg-white")}
              >
                {g.name}
              </button>
            )).concat(
              chipsVersteckt > 0
                ? [
                    <button key="mehr" type="button" onClick={() => setAlleChips(true)} className="h-8 rounded-full px-2 text-xs font-semibold text-[color:var(--brand)]" data-weitere-gesellschaften>
                      + {chipsVersteckt} weitere
                    </button>,
                  ]
                : [],
            )
          ) : vertrieb.gesellschaften.length ? (
            <>
              <span className="inline-flex h-8 items-center rounded-full bg-[#e6eef7] px-3 text-xs font-semibold text-[#003781]">{gesellschaftName(vertrieb.gesellschaften[0])}</span>
              <span className="text-xs text-[color:var(--muted)]">Tarife Ihrer Gesellschaft</span>
            </>
          ) : null}
        </div>
        <div className="mt-2 grid gap-1">
          {kat.map((t) =>
            zeile(t.id, t.kurz, t.gesellschaftName, stand(t.stand) ? `Stand ${stand(t.stand)}` : null, gewaehlt.has(t.id), platz(tarifAusKatalog(t)), () => sp.tarife.find((x) => x.id === t.id) ?? tarifAusKatalog(t), !!t.ungeprueft),
          )}
          {eig.map((e) => zeile(`eigen:${e.id}`, e.kurz, e.gesellschaft, "Eigener Tarif", gewaehlt.has(`eigen:${e.id}`), platz(tarifAusEigenem(e)), () => sp.tarife.find((x) => x.id === `eigen:${e.id}`) ?? tarifAusEigenem(e)))}
          {!kat.length && !eig.length ? <p className="py-1 text-sm text-[color:var(--muted)]">Kein Tarif im Katalog. Legen Sie einen eigenen an.</p> : null}
        </div>
        <div className="mt-2.5 text-[13px] text-[color:var(--muted)]">
          Tarif fehlt?{" "}
          <button type="button" className="font-medium text-[color:var(--brand)]" onClick={() => setEigenOffen((x) => !x)} data-eigener-tarif>
            Eigenen Tarif anlegen
          </button>
        </div>
        {eigenOffen ? (
          <EigenerTarif
            sp={sp}
            vorschlag={vertrieb.rolle === "vertreter" && vertrieb.gesellschaften[0] && vertrieb.gesellschaften[0] !== "andere" ? gesellschaftName(vertrieb.gesellschaften[0]) : ""}
            fertig={(e) => {
              eigenerDazu(e);
              setEigenOffen(false);
              const t = tarifAusEigenem(e);
              const frei = platz(t);
              if (frei) umschalten(t, true);
              toast.show({ message: frei ? "Eigener Tarif angelegt, nur für Sie sichtbar" : "Eigener Tarif angelegt. Für die Folie zuerst einen anderen Tarif abwählen." });
            }}
          />
        ) : null}
        <div className="mt-3 border-t border-[color:var(--border)] pt-2">
          <button type="button" onClick={sparteWeg} className="text-[13px] font-medium text-[color:var(--muted)] hover:text-rose-700">
            {sp.label} entfernen
          </button>
        </div>
      </div>
    </details>
  );
}

function EigenerTarif({ sp, vorschlag, fertig }: { sp: SparteWahl; vorschlag: string; fertig: (e: EigenerTarifZeile) => void }) {
  const toast = useToast();
  const [gesellschaft, setGesellschaft] = useState(vorschlag);
  const [name, setName] = useState("");
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);
  const feld = "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] bg-white px-2.5 text-sm";
  return (
    <form
      className="mt-2.5 grid gap-2.5 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setLaeuft(true);
        const r = await eigenerTarifAction({ sparte: sp.key, gesellschaft, name, werte });
        setLaeuft(false);
        if (!r.ok) return toast.show({ message: r.error, tone: "error" });
        fertig(r.tarif);
      }}
      data-eigener-tarif-form
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="grid gap-1 text-[13px]">
          Gesellschaft
          <input className={feld} value={gesellschaft} onChange={(e) => setGesellschaft(e.target.value)} required maxLength={60} />
        </label>
        <label className="grid gap-1 text-[13px]">
          Tarifname
          <input className={feld} value={name} onChange={(e) => setName(e.target.value)} placeholder={`z. B. ${sp.label} Best`} required maxLength={120} />
        </label>
      </div>
      {sp.merkmale.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {sp.merkmale.map((k) => {
            const m = sp.schema.merkmale.find((x) => x.key === k);
            return (
              <label key={k} className="grid gap-1 text-[13px]">
                {m?.kurz ?? k}
                <input className={feld} value={werte[k] ?? ""} onChange={(e) => setWerte({ ...werte, [k]: e.target.value })} placeholder="ja, nein oder Wert" maxLength={40} />
              </label>
            );
          })}
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="md" disabled={laeuft || !gesellschaft.trim() || !name.trim()}>
          Anlegen
        </Button>
      </div>
    </form>
  );
}

// ─── Live-Vorschau der echten Vergleichsfolie ───────────────────────────────────────────────

function Vorschau({
  auswahl,
  sparte,
  daten,
  katalog,
  children,
}: {
  auswahl: Tarifauswahl;
  sparte: SparteWahl;
  daten: Parameters<typeof VorbereitungNeu>[0]["vorschau"];
  katalog: Katalog;
  children: ReactNode;
}) {
  const termin = useMemo<VorbereitungDaten>(() => ({ ...daten.termin, termin: { ...daten.termin.termin, startsAt: new Date(daten.termin.termin.startsAt) } }), [daten.termin]);
  const { html, nr, von } = useMemo(() => {
    const fs = folien(termin, zuAngebote(auswahl, katalog.buendel), daten.marke, daten.ansprache);
    // Sparte „bei Bedarf“: steht erst auf „Ihr Schutz im Überblick“
    let i = sparte.zusatz ? fs.findIndex((f) => f.id === "ueberblick") : fs.findIndex((f) => f.id.startsWith("vergleich-") && f.titel === `Auswahl ${sparte.label}`);
    if (i < 0) i = fs.findIndex((f) => f.id === "empfehlung");
    return { html: fs[i]?.html ?? "", nr: i + 1, von: fs.length };
  }, [auswahl, sparte.label, sparte.zusatz, termin, daten.marke, daten.ansprache, katalog.buendel]);
  const box = useRef<HTMLDivElement>(null);
  const deck = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (deck.current) folienEinpassen(deck.current);
  }, [html, scale]);
  return (
    <div className="self-start lg:sticky lg:top-6" data-folien-vorschau>
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        <Presentation className="h-4 w-4" /> So sieht die Folie aus
        <span className="ml-auto font-medium text-[color:var(--muted)]">
          Folie {nr} von {von}
        </span>
      </div>
      <style dangerouslySetInnerHTML={{ __html: daten.css }} />
      <div ref={box} className="relative w-full overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)]" style={{ aspectRatio: "16 / 9" }}>
        <div ref={deck} className="deck pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: 1280, height: 720, transform: `scale(${scale})` }} dangerouslySetInnerHTML={{ __html: html }} aria-hidden />
      </div>
      {children}
    </div>
  );
}
