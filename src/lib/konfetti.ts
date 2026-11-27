// Konfetti bei gewonnenem Deal (Ole, 27.11.2026). Kundenbereich: Abschluss eingetragen (Heute, Kontakt, Pipeline,
// Abschluss-Blatt, weiterer Vertrag). Admin: Vertriebskontakt auf „Gewonnen“.
//
// Regeln:
//   - Nur als Reaktion auf die eigene erfolgreiche Aktion (Server meldet „gewonnen“), nie aus dem Seitenzustand, also
//     nicht beim Neuladen. Je Deal (Schlüssel, z. B. Lead-ID) höchstens einmal je Sitzung im Tab.
//   - Eigene kleine Canvas-Animation (keine Abhängigkeit), ca. 1,5 s, Farben PG-Blau, Dunkelblau, Grün.
//   - prefers-reduced-motion: keine Animation, nur der Toast. Kein Ton.
//   - Haptik (Erfolg) macht der Toast selbst (lib/haptics.ts: App über das native Plugin, Android-Browser vibrate).
// Auslösen über den Toast: toast.show({ message, feiern: "<schlüssel>" }) (components/ui/toast.tsx).

export const GLUECKWUNSCH = "Glückwunsch zum Abschluss! 🎉";
export const KONFETTI_FARBEN = ["#2563eb", "#0b1220", "#22c55e"] as const;
export const KONFETTI_DAUER_MS = 1500;

const gefeiert = new Set<string>();
let laeuft = false;

/** true beim ersten Mal je Schlüssel (und merkt ihn), danach false. Leerer Schlüssel: nie. */
export function ersteFeier(key: string | null | undefined): boolean {
  const k = (key ?? "").trim();
  if (!k || gefeiert.has(k)) return false;
  gefeiert.add(k);
  return true;
}

/** Nutzer möchte keine Bewegung (Systemeinstellung). Ohne Fenster bzw. matchMedia: wie reduziert (nichts animieren). */
export function bewegungReduziert(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export type Teilchen = { x: number; y: number; vx: number; vy: number; w: number; h: number; dreh: number; vdreh: number; farbe: string };

/** Startwerte: zwei Fontänen von unten links und unten rechts zur Mitte hin (reine Funktion, testbar). */
export function erzeugeTeilchen(anzahl: number, breite: number, hoehe: number, zufall: () => number = Math.random): Teilchen[] {
  const out: Teilchen[] = [];
  for (let i = 0; i < anzahl; i++) {
    const links = i % 2 === 0;
    const winkel = ((links ? -60 : -120) + (zufall() - 0.5) * 40) * (Math.PI / 180);
    const tempo = (0.9 + zufall() * 0.6) * Math.max(9, hoehe / 55);
    out.push({
      x: links ? breite * 0.1 : breite * 0.9,
      y: hoehe * 0.95,
      vx: Math.cos(winkel) * tempo,
      vy: Math.sin(winkel) * tempo,
      w: 6 + zufall() * 5,
      h: 8 + zufall() * 6,
      dreh: zufall() * Math.PI,
      vdreh: (zufall() - 0.5) * 0.3,
      farbe: KONFETTI_FARBEN[i % KONFETTI_FARBEN.length],
    });
  }
  return out;
}

/**
 * Konfetti abspielen (ca. 1,5 s). false, wenn nichts animiert wird: ohne Browser, bei reduzierter Bewegung oder
 * solange schon eines läuft.
 */
export function konfetti(dauerMs = KONFETTI_DAUER_MS): boolean {
  if (typeof document === "undefined" || laeuft || bewegungReduziert()) return false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return false;
  laeuft = true;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const breite = window.innerWidth;
  const hoehe = window.innerHeight;
  canvas.width = breite * dpr;
  canvas.height = hoehe * dpr;
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.konfetti = "";
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "70" });
  document.body.appendChild(canvas);
  ctx.scale(dpr, dpr);
  const teile = erzeugeTeilchen(breite < 500 ? 70 : 110, breite, hoehe);
  const start = performance.now();
  const ende = () => {
    canvas.remove();
    laeuft = false;
  };
  const bild = (jetzt: number) => {
    const t = jetzt - start;
    if (t >= dauerMs) return ende();
    ctx.clearRect(0, 0, breite, hoehe);
    // Letztes Drittel ausblenden
    ctx.globalAlpha = t > dauerMs * 0.66 ? Math.max(0, 1 - (t - dauerMs * 0.66) / (dauerMs * 0.34)) : 1;
    for (const p of teile) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.dreh += p.vdreh;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.dreh);
      ctx.fillStyle = p.farbe;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.dreh)));
      ctx.restore();
    }
    requestAnimationFrame(bild);
  };
  requestAnimationFrame(bild);
  // Sicherheitsnetz, falls der Tab im Hintergrund keine Bilder zeichnet
  setTimeout(() => (laeuft ? ende() : undefined), dauerMs + 500);
  return true;
}

/**
 * Abschluss feiern: null, wenn dieser Deal schon gefeiert wurde (kein zweites Mal), sonst Konfetti (außer bei
 * reduzierter Bewegung) und { animiert }.
 */
export function feiern(key: string | null | undefined): { animiert: boolean } | null {
  if (!ersteFeier(key)) return null;
  return { animiert: konfetti() };
}

/** Nur für Tests. */
export function _konfettiZuruecksetzen(): void {
  gefeiert.clear();
  laeuft = false;
}
