"use client";

// Präsentationsmodus (Ole, 15.11.2026), gemeinsam für Beratungspräsentation (Termin), Demo (/demo/beratung) und
// Vertriebspräsentation (Admin, Kontakt): Folie (1280×720) skaliert ins Fenster, ← → bzw. Leertaste, Wischen am Handy,
// Vollbild zum Teilen im Videocall (am Handy ohne Vollbild-API: Folie über den ganzen Bildschirm). Keine Sprechzettel
// (Ole, 15.11.2026). Klicks auf Schalter in der
// Folie (data-tarif, data-sparte, data-baustein) gehen an onKlick; die Antwort bringt die neuen Folien.

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

export type DeckFolie = { id: string; titel: string; html: string };
export type DeckKlick = { tarif: number | null; sparte: boolean; item: number; baustein: number; aktiv: boolean };
export type DeckAntwort = { ok: true; folien: DeckFolie[] } | { ok: false; error: string };

/** Taste aus einer eingebetteten Folie (iframe, z. B. Demo auf Folie 17) an das Deck darüber. */
export type DeckTasteNachricht = { deckTaste: "weiter" | "zurueck" };

const WEITER = new Set(["ArrowRight", " ", "PageDown"]);
const ZURUECK = new Set(["ArrowLeft", "PageUp"]);

export function FolienDeck({
  css,
  folien: start,
  startFolie = 0,
  onKlick,
  eingebettet,
  extra,
}: {
  css: string;
  folien: DeckFolie[];
  startFolie?: number;
  /** Klick auf einen Schalter in der Folie; ohne: Folien sind nur zum Ansehen. */
  onKlick?: (k: DeckKlick) => Promise<DeckAntwort>;
  /** In einer anderen Folie eingebettet (iframe): knappe Leiste, Pfeiltasten blättern das Deck darüber. */
  eingebettet?: boolean;
  /** Weitere Knöpfe in der Leiste (z. B. PDF). */
  extra?: ReactNode;
}) {
  const [folien, setFolien] = useState(start);
  const [i, setI] = useState(Math.max(0, Math.min(start.length - 1, startFolie)));
  const [pending, startT] = useTransition();
  const [pseudo, setPseudo] = useState(false);
  const toast = useToast();
  const [scale, setScale] = useState(0.5);
  const box = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const onSlideClick = (ev: React.MouseEvent) => {
    if (!onKlick || pending) return;
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-baustein],[data-tarif],[data-sparte]");
    if (!el) return;
    const t = el.dataset.tarif ?? el.dataset.sparte;
    const [item, b] = (el.dataset.baustein ?? "").split(":").map(Number);
    const aktiv = !el.classList.contains("an");
    el.classList.toggle("an", aktiv);
    startT(async () => {
      const r = await onKlick({ tarif: t != null ? Number(t) : null, sparte: el.dataset.sparte != null, item, baustein: b, aktiv });
      if (r.ok) setFolien(r.folien);
      else {
        el.classList.toggle("an", !aktiv);
        toast.show({ message: r.error, tone: "error" });
      }
    });
  };

  const go = useCallback((n: number) => setI(Math.max(0, Math.min(folien.length - 1, n))), [folien.length]);
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
      setScale(Math.min(w / 1280, h / 720));
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
    if (el?.requestFullscreen && document.fullscreenEnabled) el.requestFullscreen().catch(() => setPseudo(true));
    else setPseudo(true);
  };

  const f = folien[i];
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
          if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? i + 1 : i - 1);
        }}
      >
        <div className="relative shrink-0 overflow-hidden" style={{ width: 1280 * scale, height: 720 * scale }}>
          <div
            onClick={onSlideClick}
            className="absolute left-0 top-0"
            style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }}
            dangerouslySetInnerHTML={{ __html: f.html }}
          />
        </div>
        {pseudo ? (
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
        ) : null}
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
          <Button variant="secondary" size="md" icon={Expand} onClick={vollbild}>
            Vollbild
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
