"use client";

// Präsentationsmodus (Ole, 15.11.2026): Folie skaliert ins Fenster, ← → bzw. Leertaste, Vollbild zum Teilen im
// Videocall. Sprechzettel unter der Folie oder als zweites Fenster (blättert über BroadcastChannel mit).

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, NotebookText } from "lucide-react";
import { Button } from "@/components/ui";

type Folie = { id: string; titel: string; html: string; notizen: string[] };

export function Deck({ id, css, folien, nurNotizen }: { id: string; css: string; folien: Folie[]; nurNotizen?: boolean }) {
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(0.5);
  const box = useRef<HTMLDivElement>(null);
  const chan = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const c = new BroadcastChannel(`deck-${id}`);
    chan.current = c;
    c.onmessage = (ev) => typeof ev.data === "number" && setI(ev.data);
    return () => c.close();
  }, [id]);
  const go = useCallback(
    (n: number) => {
      const next = Math.max(0, Math.min(folien.length - 1, n));
      setI(next);
      chan.current?.postMessage(next);
    },
    [folien.length],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") go(i + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);
  useEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
      setScale(Math.min(el.clientWidth / 1280, (document.fullscreenElement ? window.innerHeight : el.clientWidth * 0.5625) / 720));
    };
    fit();
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, []);

  const f = folien[i];
  const notizen = (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-4" data-sprechzettel>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
        Sprechzettel · Folie {i + 1} von {folien.length}: {f.titel}
      </div>
      <ul className="list-disc space-y-1.5 pl-5 text-[15px]">
        {f.notizen.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {folien[i + 1] ? <div className="mt-3 text-xs text-[color:var(--muted)]">Als Nächstes: {folien[i + 1].titel}</div> : null}
    </div>
  );
  if (nurNotizen) return <div className="space-y-3">{notizen}<Nav i={i} n={folien.length} go={go} /></div>;

  return (
    <div className="space-y-4">
      <style>{css}</style>
      <div ref={box} className="deck relative w-full overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-black/5" style={{ aspectRatio: "16 / 9" }} data-deck>
        <div style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: f.html }} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Nav i={i} n={folien.length} go={go} />
        <Button variant="secondary" size="md" icon={Expand} onClick={() => box.current?.requestFullscreen?.()}>
          Vollbild
        </Button>
        <Button variant="secondary" size="md" icon={NotebookText} onClick={() => window.open(`?notizen=1`, `sprechzettel-${id}`, "width=520,height=640")}>
          Sprechzettel im eigenen Fenster
        </Button>
      </div>
      {notizen}
    </div>
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
