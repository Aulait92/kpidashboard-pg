"use client";

// Präsentationsmodus (Ole, 15.11.2026), gemeinsam für Beratungspräsentation (Termin), Demo (/demo/beratung) und
// Vertriebspräsentation (Admin, Kontakt): Folie (1280×720) skaliert ins Fenster, ← → bzw. Leertaste, Wischen am Handy,
// Vollbild zum Teilen im Videocall (am Handy ohne Vollbild-API: Folie über den ganzen Bildschirm). Keine Sprechzettel
// (Ole, 15.11.2026). Klicks auf Schalter in der
// Folie (data-tarif, data-sparte, data-baustein) gehen an onKlick; die Antwort bringt die neuen Folien.
// Startet immer mit Folie 1 (Ole, 15.11.2026): kein gespeicherter Stand, kein Sprung per Adresse.
// Kommt per Klick eine Produktfolie dazu (Cross-Selling „Mit anschauen“), springt das Deck vorwärts auf sie und
// meldet „{Produkt} hinzugefügt“ (Ole, 18.11.2026); im Vollbild und eingebettet steht der Hinweis in der Folie.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { folienEinpassen } from "@/lib/folien-einpassen";

export type DeckFolie = { id: string; titel: string; html: string; produkt?: string };
export type DeckKlick = { tarif: number | null; sparte: boolean; item: number; baustein: number; aktiv: boolean };
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

const WEITER = new Set(["ArrowRight", " ", "PageDown"]);
const ZURUECK = new Set(["ArrowLeft", "PageUp"]);

export function FolienDeck({
  css,
  folien: start,
  onKlick,
  eingebettet,
  extra,
}: {
  css: string;
  folien: DeckFolie[];
  /** Klick auf einen Schalter in der Folie; ohne: Folien sind nur zum Ansehen. */
  onKlick?: (k: DeckKlick) => Promise<DeckAntwort>;
  /** In einer anderen Folie eingebettet (iframe): knappe Leiste, Pfeiltasten blättern das Deck darüber. */
  eingebettet?: boolean;
  /** Weitere Knöpfe in der Leiste (z. B. PDF). */
  extra?: ReactNode;
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

  const onSlideClick = (ev: React.MouseEvent) => {
    if (!onKlick || pending) return;
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-baustein],[data-tarif],[data-sparte]");
    if (!el) return;
    const t = el.dataset.tarif ?? el.dataset.sparte;
    const [item, b] = (el.dataset.baustein ?? "").split(":").map(Number);
    const aktiv = !el.classList.contains("an");
    el.classList.toggle("an", aktiv);
    const aktuelleId = folien[i]?.id;
    startT(async () => {
      const r = await onKlick({ tarif: t != null ? Number(t) : null, sparte: el.dataset.sparte != null, item, baustein: b, aktiv });
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

  const go = useCallback((n: number) => setI(Math.max(0, Math.min(folien.length - 1, n))), [folien.length]);
  useEffect(() => {
    if (!hinweis) return;
    const t = setTimeout(() => setHinweis((h) => (h?.n === hinweis.n ? null : h)), 3000);
    return () => clearTimeout(t);
  }, [hinweis]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const richtung = WEITER.has(e.key) ? "weiter" : ZURUECK.has(e.key) ? "zurueck" : null;
      if (e.key === "Escape") setPseudo(false);
      if (!richtung) return;
      e.preventDefault();
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
  }, [i, go, eingebettet]);
  useEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
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

  const f = folien[i];
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
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
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
        <div className="flex flex-wrap items-center gap-3">
          <Nav i={i} n={folien.length} go={go} />
          {/* Handy: nur Symbol, damit Zurück, Zähler, Weiter und Vollbild in eine Zeile passen */}
          <Button variant="secondary" size="md" icon={Expand} onClick={vollbild} aria-label="Vollbild" title="Vollbild" className="px-3 sm:px-4">
            <span className="hidden sm:inline">Vollbild</span>
          </Button>
          {extra}
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

function Nav({ i, n, go }: { i: number; n: number; go: (n: number) => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      <Button variant="secondary" size="md" icon={ChevronLeft} disabled={i === 0} onClick={() => go(i - 1)}>
        Zurück
      </Button>
      <span className="min-w-[64px] text-center text-sm tabular-nums text-[color:var(--muted)]">
        {i + 1} / {n}
      </span>
      <Button variant="primary" size="md" icon={ChevronRight} disabled={i === n - 1} onClick={() => go(i + 1)}>
        Weiter
      </Button>
    </div>
  );
}
