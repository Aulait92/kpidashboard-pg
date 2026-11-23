"use client";

// Präsentationsmodus (Ole, 15.11.2026), gemeinsam für Beratungspräsentation (Termin), Demo (/demo/beratung) und
// Vertriebspräsentation (Admin, Kontakt): Folie (1280×720) skaliert ins Fenster, ← → bzw. Leertaste, Wischen am Handy,
// Vollbild zum Teilen im Videocall (am Handy ohne Vollbild-API: Folie über den ganzen Bildschirm). Keine Sprechzettel
// (Ole, 15.11.2026). Klicks auf Schalter in der
// Folie (data-tarif, data-sparte, data-baustein, data-paket) gehen an onKlick; die Antwort bringt die neuen Folien.
// data-paket (Fassung C, Folie „Ihre Entscheidung“): je Sparte eine Stufe auf einmal wählen („2,4“ = Indizes im Angebot).
// Startet immer mit Folie 1 (Ole, 15.11.2026): kein gespeicherter Stand, kein Sprung per Adresse.
// Kommt per Klick eine Produktfolie dazu (Cross-Selling „Mit anschauen“), springt das Deck vorwärts auf sie und
// meldet „{Produkt} hinzugefügt“ (Ole, 18.11.2026); im Vollbild und eingebettet steht der Hinweis in der Folie.
// Abschluss (19.11.2026): „Ja, so machen wir es“ (data-zusage) geht an onZusage, danach eine Folie weiter. Einwände
// (optionale Folien außerhalb der Reihenfolge) über „Einwände“ bzw. die Tasten 1 bis 6, zurück mit Esc oder Pfeil.
// Sprechhinweise nur für den Vermittler: zum Aufklappen unter dem Deck (Standard aus, nie in der Folie, nicht im
// Vollbild). onFolie meldet jede erreichte Folie einmal (Messung „Folie erreicht“).
// Rechen-Folien (data-rechner, Ole 20.11.2026): Eingaben rechnen sofort neu (folien-rechner.ts), bleiben beim Blättern
// erhalten; beim Tippen blättern weder Pfeiltasten noch Wischen, und die Tastatur am Handy verstellt die Folie nicht.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Expand, Lightbulb, MessageCircleQuestion, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { folienEinpassen } from "@/lib/folien-einpassen";
import { rechnerAnwenden, rechnerQuoten, zahlFeld, zahlLesen } from "@/lib/vertrieb/folien-rechner";

export type DeckFolie = { id: string; titel: string; html: string; produkt?: string; hinweis?: string };
export type DeckKlick = { tarif: number | null; sparte: boolean; item: number; baustein: number; aktiv: boolean; paket?: number[]; /** Folie, auf der geklickt wurde (Messung „Mit anschauen“) */ folie?: string };

/** „2,4“ aus data-paket; null, wenn es kein gültiges Paket ist. */
export function paketAusAttribut(v: string | undefined): number[] | null {
  if (!v || !/^\d{1,2}(,\d{1,2}){0,7}$/.test(v)) return null;
  return v.split(",").map(Number);
}

export type DeckAntwort = { ok: true; folien: DeckFolie[] } | { ok: false; error: string };

/** Taste aus einer eingebetteten Folie (iframe, z. B. Demo auf Folie 17) an das Deck darüber. */
export type DeckTasteNachricht = { deckTaste: "weiter" | "zurueck" };

/**
 * Wohin nach einem Klick: kam eine Folie dazu (nur beim Anschalten), auf die erste neue, mit Hinweis
 * „{Produkt} hinzugefügt“; sonst bleibt das Deck auf derselben Folie (fällt sie weg: dieselbe Nummer, höchstens die letzte).
 */
export function folieNachKlick(alt: { id: string }[], aktuelleId: string | undefined, neu: DeckFolie[], aktiv: boolean, i: number): { i: number; hinweis: string | null } {
  const n = aktiv ? neu.findIndex((x) => !alt.some((y) => y.id === x.id)) : -1;
  if (n >= 0) return { i: n, hinweis: `${neu[n].produkt ?? neu[n].titel} hinzugefügt` };
  const j = neu.findIndex((x) => x.id === aktuelleId);
  return { i: j >= 0 ? j : Math.max(0, Math.min(i, neu.length - 1)), hinweis: null };
}

/** Eingabefeld (Tippen hat Vorrang vor Blättern). */
const istEingabe = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

const WEITER = new Set(["ArrowRight", " ", "PageDown"]);
const ZURUECK = new Set(["ArrowLeft", "PageUp"]);

export function FolienDeck({
  css,
  folien: start,
  onKlick,
  eingebettet,
  extra,
  onZusage,
  onFolie,
  einwaende = [],
}: {
  css: string;
  folien: DeckFolie[];
  /** Klick auf einen Schalter in der Folie; ohne: Folien sind nur zum Ansehen. */
  onKlick?: (k: DeckKlick) => Promise<DeckAntwort>;
  /** In einer anderen Folie eingebettet (iframe): knappe Leiste, Pfeiltasten blättern das Deck darüber. */
  eingebettet?: boolean;
  /** Weitere Knöpfe in der Leiste (z. B. PDF). */
  extra?: ReactNode;
  /** „Ja, so machen wir es“ auf der Folie „Ihre Entscheidung“; die Antwort bringt die Folien mit „Zugesagt“. */
  onZusage?: () => Promise<DeckAntwort>;
  /** Jede erreichte Folie der Reihenfolge einmal (Messung). */
  onFolie?: (id: string) => void;
  /** Einwand-Folien (Sprungziele für den Vermittler, außerhalb der Reihenfolge). */
  einwaende?: DeckFolie[];
}) {
  const [folien, setFolien] = useState(start);
  const [i, setI] = useState(0);
  const [pending, startT] = useTransition();
  const [pseudo, setPseudo] = useState(false);
  const toast = useToast();
  const [scale, setScale] = useState(0.5);
  // Vollbild im Hochformat (Handy): Folie um 90° gedreht wie im Kundenlink (UX Runde 4, Vorschlag 8)
  const [gedreht, setGedreht] = useState(false);
  // Vollbild (echt oder nachgebaut): dort ist der Toast der Seite verdeckt
  const [vollAn, setVollAn] = useState(false);
  const [hinweis, setHinweis] = useState<{ text: string; n: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const rahmen = useRef<HTMLDivElement>(null);
  const folie = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // Einwand-Folie statt der aktuellen (null = Reihenfolge)
  const [einwand, setEinwand] = useState<number | null>(null);
  const [einwandMenue, setEinwandMenue] = useState(false);
  // Sprechhinweise: bei jedem Öffnen aus (nichts gespeichert, Ole 15.11.2026: Präsentation ohne Sprechzettel als Standard)
  const [sprech, setSprech] = useState(false);
  const gemeldet = useRef(new Set<string>());
  const sprechUmschalten = () => setSprech((x) => !x);
  // Eingaben auf Rechen-Folien je Folie und Feld („folie-16:leads“ → „20“), damit sie beim Zurückblättern bleiben
  const eingaben = useRef(new Map<string, string>());

  const onRechnerEingabe = (ev: React.FormEvent) => {
    const t = ev.target as HTMLElement;
    const r = t.closest<HTMLElement>("[data-rechner]");
    if (!r || !(t instanceof HTMLInputElement) || !t.dataset.feld) return;
    eingaben.current.set(`${f.id}:${t.dataset.feld}`, t.value);
    // Leads geändert: Termine und Abschlüsse ziehen mit gleicher Quote mit (Ole, 20.11.2026)
    for (const k of rechnerQuoten(r, t.dataset.feld)) {
      const i = r.querySelector<HTMLInputElement>(`input[data-feld="${k}"]`);
      if (i) eingaben.current.set(`${f.id}:${k}`, i.value);
    }
    rechnerAnwenden(r);
  };
  // Beim Verlassen des Felds deutsch formatieren („1200“ → „1.200“)
  const onRechnerFertig = (ev: React.FocusEvent) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.feld || !t.closest("[data-rechner]")) return;
    const n = zahlLesen(t.value);
    const text = zahlFeld(n, t.dataset.euro != null);
    if (n != null && text !== t.value) {
      t.value = text;
      eingaben.current.set(`${f.id}:${t.dataset.feld}`, t.value);
    }
  };

  const onSlideClick = (ev: React.MouseEvent) => {
    const z = (ev.target as HTMLElement).closest<HTMLElement>("[data-zusage]");
    if (z) {
      if (!onZusage || pending || z.classList.contains("an")) return;
      z.classList.add("an");
      startT(async () => {
        const r = await onZusage();
        if (r.ok) {
          setFolien(r.folien);
          setI((n) => Math.min(n + 1, r.folien.length - 1));
          toast.show({ message: "Zusage gespeichert", durationMs: 3000 });
          setHinweis({ text: "Zusage gespeichert", n: Date.now() });
        } else {
          z.classList.remove("an");
          toast.show({ message: r.error, tone: "error" });
        }
      });
      return;
    }
    if (istEingabe(ev.target) || !onKlick || pending) return;
    // Paket (Fassung C): das angetippte wird gewählt, das andere nicht mehr; ein gewähltes erneut antippen ändert nichts
    const pk = (ev.target as HTMLElement).closest<HTMLElement>("[data-paket]");
    if (pk) {
      const paket = paketAusAttribut(pk.dataset.paket);
      if (!paket || pk.classList.contains("an")) return;
      const vorher = [...(folie.current?.querySelectorAll<HTMLElement>("[data-paket]") ?? [])].map((x) => [x, x.classList.contains("an")] as const);
      vorher.forEach(([x]) => x.classList.toggle("an", x === pk));
      startT(async () => {
        const r = await onKlick({ tarif: null, sparte: false, item: -1, baustein: -1, aktiv: true, paket });
        if (r.ok) setFolien(r.folien);
        else {
          vorher.forEach(([x, an]) => x.classList.toggle("an", an));
          toast.show({ message: r.error, tone: "error" });
        }
      });
      return;
    }
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-baustein],[data-tarif],[data-sparte]");
    if (!el) return;
    const t = el.dataset.tarif ?? el.dataset.sparte;
    const [item, b] = (el.dataset.baustein ?? "").split(":").map(Number);
    const aktiv = !el.classList.contains("an");
    el.classList.toggle("an", aktiv);
    const aktuelleId = folien[i]?.id;
    startT(async () => {
      const r = await onKlick({ tarif: t != null ? Number(t) : null, sparte: el.dataset.sparte != null, item, baustein: b, aktiv, folie: aktuelleId });
      if (r.ok) {
        // Neue Produktfolie (z. B. „Mit anschauen“ nimmt eine Sparte in den Vergleich): direkt dorthin, mit Hinweis
        const z = folieNachKlick(folien, aktuelleId, r.folien, aktiv, i);
        setFolien(r.folien);
        setI(z.i);
        if (z.hinweis) {
          toast.show({ message: z.hinweis, durationMs: 3000 });
          setHinweis({ text: z.hinweis, n: Date.now() });
        }
      } else {
        el.classList.toggle("an", !aktiv);
        toast.show({ message: r.error, tone: "error" });
      }
    });
  };

  const go = useCallback(
    (n: number) => {
      setEinwand(null);
      setI(Math.max(0, Math.min(folien.length - 1, n)));
    },
    [folien.length],
  );
  // Aus einer Einwand-Folie führen Pfeile und Esc zurück auf die Folie, von der aus gesprungen wurde
  const zurueckAusEinwand = useCallback(() => setEinwand(null), []);
  useEffect(() => {
    if (!onFolie || einwand != null) return;
    const id = folien[i]?.id;
    if (id && !gemeldet.current.has(id)) {
      gemeldet.current.add(id);
      onFolie(id);
    }
  }, [i, folien, einwand, onFolie]);
  useEffect(() => {
    if (!hinweis) return;
    const t = setTimeout(() => setHinweis((h) => (h?.n === hinweis.n ? null : h)), 3000);
    return () => clearTimeout(t);
  }, [hinweis]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (istEingabe(e.target)) return;
      const richtung = WEITER.has(e.key) ? "weiter" : ZURUECK.has(e.key) ? "zurueck" : null;
      // Tasten 1 bis 6: Einwand-Folie (auch im Vollbild, ohne sichtbares Menü)
      const nr = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
      if (!eingebettet && nr >= 0 && nr < einwaende.length) {
        e.preventDefault();
        setEinwand(nr);
        return;
      }
      if (e.key === "Escape") {
        if (einwand != null) return zurueckAusEinwand();
        setPseudo(false);
      }
      if (!richtung) return;
      e.preventDefault();
      if (einwand != null) return zurueckAusEinwand();
      if (eingebettet && window.parent !== window) {
        window.parent.postMessage({ deckTaste: richtung } satisfies DeckTasteNachricht, window.location.origin);
        return;
      }
      go(richtung === "weiter" ? i + 1 : i - 1);
    };
    // Pfeiltasten aus einer eingebetteten Folie (gleiche Herkunft)
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || eingebettet) return;
      const d = e.data as Partial<DeckTasteNachricht> | null;
      if (d?.deckTaste === "weiter") go(i + 1);
      if (d?.deckTaste === "zurueck") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMsg);
    };
  }, [i, go, eingebettet, einwand, einwaende.length, zurueckAusEinwand]);
  useEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
      // Handy-Tastatur beim Tippen in ein Feld der Folie: Größe nicht neu berechnen (sonst springt bzw. dreht die Folie)
      if (istEingabe(document.activeElement) && el.contains(document.activeElement)) return;
      const voll = !!document.fullscreenElement || pseudo;
      const w = voll ? window.innerWidth : el.clientWidth;
      const h = voll ? window.innerHeight : el.clientWidth * 0.5625;
      const hoch = voll && h > w;
      setVollAn(voll);
      setGedreht(hoch);
      setScale(hoch ? Math.min(h / 1280, w / 720) : Math.min(w / 1280, h / 720));
    };
    fit();
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, [pseudo]);

  const vollbild = () => {
    const el = box.current;
    // Android: im Vollbild quer stellen, wenn möglich; sonst dreht fit() die Folie
    const quer = () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.("landscape").catch(() => {});
    if (el?.requestFullscreen && document.fullscreenEnabled) el.requestFullscreen().then(quer, () => setPseudo(true));
    else setPseudo(true);
  };

  const f = (einwand != null ? einwaende[einwand] : null) ?? folien[i];
  // Zu langer Inhalt wird kleiner statt abgeschnitten (gleich wie im PDF)
  useLayoutEffect(() => {
    const el = folie.current;
    if (!el) return;
    // Messen in normaler Lage (die Drehung vertauscht Breite und Höhe)
    const einpassen = () => {
      const r = rahmen.current;
      const t = r?.style.transform ?? "";
      if (r) r.style.transform = "";
      folienEinpassen(el);
      if (r) r.style.transform = t;
    };
    einpassen();
    let aktiv = true;
    document.fonts?.ready.then(() => aktiv && einpassen());
    return () => {
      aktiv = false;
    };
  }, [f.html, gedreht]);
  // Rechen-Folie: gemerkte Eingaben wieder einsetzen und rechnen
  useLayoutEffect(() => {
    folie.current?.querySelectorAll<HTMLElement>("[data-rechner]").forEach((r) => {
      r.querySelectorAll<HTMLInputElement>("input[data-feld]").forEach((i) => {
        const v = eingaben.current.get(`${f.id}:${i.dataset.feld}`);
        if (v != null) i.value = v;
      });
      rechnerAnwenden(r);
    });
  }, [f.html, f.id]);
  const leiste = (
          <div className="absolute bottom-3 right-3 flex items-center gap-2" data-vollbild-leiste>
            <RundKnopf label="Zurück" onClick={() => go(i - 1)} disabled={i === 0}>
              <ChevronLeft className="h-5 w-5" />
            </RundKnopf>
            <span className="rounded-full bg-black/50 px-2 py-1 text-xs tabular-nums text-white">
              {i + 1} / {folien.length}
            </span>
            <RundKnopf label="Weiter" onClick={() => go(i + 1)} disabled={i === folien.length - 1}>
              <ChevronRight className="h-5 w-5" />
            </RundKnopf>
            <RundKnopf label="Vollbild beenden" onClick={() => setPseudo(false)}>
              <X className="h-5 w-5" />
            </RundKnopf>
          </div>
  );
  return (
    <div className={eingebettet ? "flex w-full flex-col gap-2" : "space-y-4"}>
      <style>{css}</style>
      <div
        ref={box}
        className={`deck relative flex w-full items-center justify-center overflow-hidden [&:fullscreen]:bg-black ${
          pseudo ? "fixed inset-0 z-[1000] bg-black" : `${eingebettet ? "rounded-lg" : "rounded-[var(--radius-md)]"} border border-[color:var(--border)] bg-black/5`
        }`}
        style={pseudo ? undefined : { aspectRatio: "16 / 9" }}
        data-deck
        data-folie={f.id}
        onTouchStart={(e) => (touch.current = istEingabe(e.target) || istEingabe(document.activeElement) ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const s = touch.current;
          touch.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          // gedreht: Folien-x ist Bildschirm-y
          const [a, b] = gedreht ? [dy, dx] : [dx, dy];
          if (Math.abs(a) > 60 && Math.abs(a) > 1.5 * Math.abs(b)) go(a < 0 ? i + 1 : i - 1);
        }}
      >
        <div ref={rahmen} className="relative shrink-0" style={{ width: 1280 * scale, height: 720 * scale, transform: gedreht ? "rotate(90deg)" : undefined }}>
          <div className="relative h-full w-full overflow-hidden">
          <div
            ref={folie}
            onClick={onSlideClick}
            onInput={onRechnerEingabe}
            onBlur={onRechnerFertig}
            onKeyDown={(ev) => {
              // Enter im Feld: fertig (Tastatur zu), Ergebnis steht schon
              if (ev.key === "Enter" && ev.target instanceof HTMLInputElement) ev.target.blur();
            }}
            className="absolute left-0 top-0"
            style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }}
            dangerouslySetInnerHTML={{ __html: f.html }}
          />
          </div>
          {pseudo && gedreht ? leiste : null}
          {(vollAn || eingebettet) && hinweis ? (
            <div role="status" className="pointer-events-none absolute inset-x-0 top-3 flex justify-center" data-deck-hinweis>
              <span className="ui-fade-in inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[color:var(--foreground)] px-4 py-2 text-sm text-white shadow-[var(--shadow-lg)]">
                <Check className="h-4 w-4 text-emerald-300" />
                {hinweis.text}
              </span>
            </div>
          ) : null}
        </div>
        {pseudo && !gedreht ? leiste : null}
      </div>
      {eingebettet ? (
        <div className="flex items-center justify-center gap-3">
          <RundKnopf label="Zurück" onClick={() => go(i - 1)} disabled={i === 0} hell>
            <ChevronLeft className="h-5 w-5" />
          </RundKnopf>
          <span className="min-w-[90px] truncate text-center text-sm tabular-nums text-[color:var(--muted)]">
            {i + 1} / {folien.length}
          </span>
          <RundKnopf label="Weiter" onClick={() => go(i + 1)} disabled={i === folien.length - 1} hell>
            <ChevronRight className="h-5 w-5" />
          </RundKnopf>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Nav i={i} n={folien.length} go={go} einwand={einwand != null} />
            {/* Handy: nur Symbole, damit Zurück, Zähler, Weiter und die Knöpfe in eine Zeile passen */}
            <Button variant="secondary" size="md" icon={Expand} onClick={vollbild} aria-label="Vollbild" title="Vollbild" className="px-3 sm:px-4">
              <span className="hidden sm:inline">Vollbild</span>
            </Button>
            {einwaende.length ? (
              <Button
                variant="secondary"
                size="md"
                icon={MessageCircleQuestion}
                onClick={() => setEinwandMenue((x) => !x)}
                aria-expanded={einwandMenue}
                aria-label="Einwände"
                title={`Einwände (Tasten 1 bis ${einwaende.length})`}
                className="px-3 sm:px-4"
                data-einwaende-knopf
              >
                <span className="hidden sm:inline">Einwände</span>
              </Button>
            ) : null}
            {folien.some((x) => x.hinweis) ? (
              <Button
                variant={sprech ? "primary" : "secondary"}
                size="md"
                icon={Lightbulb}
                onClick={sprechUmschalten}
                aria-pressed={sprech}
                aria-label="Sprechhinweise"
                title="Sprechhinweise (nur für Sie)"
                className="px-3 sm:px-4"
                data-sprechhinweise-knopf
              >
                <span className="hidden sm:inline">Hinweise</span>
              </Button>
            ) : null}
            {extra}
          </div>
          {einwand != null || einwandMenue ? (
            <div className="flex flex-wrap items-center gap-2" data-einwaende>
              {einwand != null ? (
                <Button variant="primary" size="sm" icon={Undo2} onClick={zurueckAusEinwand}>
                  Zurück zu Folie {i + 1}
                </Button>
              ) : null}
              {einwaende.map((x, k) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setEinwand(k)}
                  className={`min-h-10 rounded-full border px-3 text-sm ${
                    einwand === k ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-[color:var(--border)] bg-white hover:bg-[color:var(--surface-sunken)]"
                  }`}
                >
                  {x.titel}
                </button>
              ))}
            </div>
          ) : null}
          {sprech && f.hinweis ? (
            <p className="whitespace-pre-line rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-sprechhinweis>
              <span className="font-semibold">Nur für Sie: </span>
              {f.hinweis}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RundKnopf({ label, onClick, disabled, hell, children }: { label: string; onClick: () => void; disabled?: boolean; hell?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40 ${
        hell ? "border border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:bg-[color:var(--surface-sunken)]" : "bg-black/50 text-white hover:bg-black/70"
      }`}
    >
      {children}
    </button>
  );
}

function Nav({ i, n, go, einwand }: { i: number; n: number; go: (n: number) => void; einwand?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2">
      <Button variant="secondary" size="md" icon={ChevronLeft} disabled={i === 0 && !einwand} onClick={() => go(einwand ? i : i - 1)}>
        Zurück
      </Button>
      <span className="min-w-[64px] text-center text-sm tabular-nums text-[color:var(--muted)]">
        {einwand ? "Einwand" : `${i + 1} / ${n}`}
      </span>
      <Button variant="primary" size="md" icon={ChevronRight} disabled={i === n - 1 && !einwand} onClick={() => go(einwand ? i : i + 1)}>
        Weiter
      </Button>
    </div>
  );
}
