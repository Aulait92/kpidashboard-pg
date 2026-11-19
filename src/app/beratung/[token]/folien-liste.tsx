"use client";

// Folien untereinander, auf die Breite skaliert (Kundenlink, nur lesen). Zu langer Inhalt wird kleiner statt
// abgeschnitten, wie im Deck und im PDF.
// Handy (16.11.2026): Auf 390 px ist die Schrift einer 1280-px-Folie rund 7 px groß. Antippen öffnet die Folie
// bildschirmfüllend, im Hochformat quer gedreht, damit sie lesbar ist.
// Messung (19.11.2026): jede Folie, die zur Hälfte sichtbar war, einmal melden (onFolie); keine Lesedauer, kein Gerät.
// Fassung C (19.11.2026): mit onPaket sind die Paketkarten auf „Ihre Entscheidung“ antippbar (auch in der großen
// Ansicht); ohne bleiben sie reine Anzeige wie alle anderen Schalter.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { folienEinpassen } from "@/lib/folien-einpassen";

/** Antippen einer Paketkarte: die Indizes aus data-paket, sonst null (dann normal weiter, z. B. vergrößern). */
function paketAusKlick(ev: React.MouseEvent): number[] | null {
  const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-paket]");
  const v = el?.dataset.paket;
  return v && /^\d{1,2}(,\d{1,2}){0,7}$/.test(v) ? v.split(",").map(Number) : null;
}

export function FolienListe({
  css,
  folien,
  onFolie,
  onPaket,
}: {
  css: string;
  folien: { id: string; html: string }[];
  onFolie?: (id: string) => void;
  /** Paket gewählt (Fassung C, vor der Zusage) */
  onPaket?: (items: number[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [gross, setGross] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => ref.current && setScale(ref.current.clientWidth / 1280);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    folienEinpassen(el);
    let aktiv = true;
    document.fonts?.ready.then(() => aktiv && folienEinpassen(el));
    return () => {
      aktiv = false;
    };
  }, [folien]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onFolie || typeof IntersectionObserver === "undefined") return;
    const gemeldet = new Set<string>();
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          const id = (e.target as HTMLElement).dataset.folieId;
          if (e.isIntersecting && id && !gemeldet.has(id)) {
            gemeldet.add(id);
            onFolie(id);
          }
        }
      },
      { threshold: 0.5 },
    );
    el.querySelectorAll("[data-folie-id]").forEach((x) => io.observe(x));
    return () => io.disconnect();
  }, [folien, onFolie]);
  const klein = scale < 0.5;
  return (
    <>
      {klein ? <p className="mb-2 text-sm text-[color:var(--muted)]">Zum Vergrößern eine Folie antippen.</p> : null}
      <div ref={ref} className="flex flex-col gap-4" data-kundenfolien>
        <style>{`${css}\n.nurlesen .bs,.nurlesen .wahl,.nurlesen .teil,.nurlesen .st,.nurlesen .pk{cursor:default;pointer-events:none}\n.nurlesen .zusage,.nurlesen .zusage-zeile{display:none}${
          // Handy: erst vergrößern (Folie antippen), dort das Paket wählen; ab Tablet direkt in der Liste
          onPaket ? "\n.nurlesen button.pk{cursor:pointer;pointer-events:auto}" : ""
        }`}</style>
        {folien.map((f, i) => (
          <div
            key={f.id}
            data-folie-id={f.id}
            className="relative w-full overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] shadow-[var(--shadow-sm)]"
            style={{ aspectRatio: "16 / 9" }}
            onClickCapture={(ev) => {
              const p = onPaket ? paketAusKlick(ev) : null;
              if (p) {
                ev.stopPropagation();
                onPaket!(p);
              }
            }}
          >
            <div className="deck nurlesen absolute left-0 top-0" style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: f.html }} />
            {klein ? (
              <button type="button" className="absolute inset-0" aria-label={`Folie ${i + 1} vergrößern`} onClick={() => setGross(i)} data-folie-gross />
            ) : null}
          </div>
        ))}
      </div>
      {gross != null ? <FolieGross html={folien[gross].html} onClose={() => setGross(null)} onPaket={onPaket} /> : null}
    </>
  );
}

/** Eine Folie bildschirmfüllend; im Hochformat um 90° gedreht. */
function FolieGross({ html, onClose, onPaket }: { html: string; onClose: () => void; onPaket?: (items: number[]) => void }) {
  const [vp, setVp] = useState({ w: 390, h: 844 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    fit();
    window.addEventListener("resize", fit);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  const quer = vp.h > vp.w;
  // Erst ungedreht einpassen (die Messung braucht die normale Lage), dann drehen
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
    folienEinpassen(el);
    el.style.transform = quer ? "rotate(90deg)" : "";
  }, [html, quer]);
  // Platz für die Folie (gedreht: Höhe des Bildschirms ist die Folienbreite)
  const breite = quer ? vp.h - 24 : vp.w - 24;
  const hoehe = quer ? vp.w - 24 : vp.h - 24;
  const s = Math.min(breite / 1280, hoehe / 720);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose} role="dialog" aria-modal="true" data-folie-vollbild>
      <div
        ref={ref}
        style={{ width: 1280 * s, height: 720 * s }}
        className="relative shrink-0 overflow-hidden rounded-md bg-white"
        onClick={(ev) => {
          // Paketkarte antippen wählt, statt die große Ansicht zu schließen
          const p = onPaket ? paketAusKlick(ev) : null;
          if (p) {
            ev.stopPropagation();
            onPaket!(p);
          }
        }}
      >
        <div className="deck nurlesen absolute left-0 top-0" style={{ width: 1280, height: 720, transform: `scale(${s})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
        style={{ top: "max(12px, env(safe-area-inset-top))" }}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
