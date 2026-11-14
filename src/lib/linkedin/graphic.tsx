// Text-Grafik für LinkedIn-Posts ohne Foto (Ole, 14.11.2026): nur Typografie, keine
// Zeichnungen/Illustrationen. Mehrere Designs (Farben, Zahl groß), je Aussage fest gewählt,
// damit nicht alle Grafiken gleich aussehen (Ole: „alle Grafiken waren gleich“).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Fette Schrift (Geist Bold, SIL OFL – public/fonts/Geist-LICENSE.txt); der Standard von next/og hat nur „Regular“.
let fontPromise: Promise<ArrayBuffer | null> | null = null;
function boldFont(): Promise<ArrayBuffer | null> {
  fontPromise ??= readFile(join(process.cwd(), "public/fonts/Geist-Bold.ttf"))
    .then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    .catch(() => null);
  return fontPromise;
}

export const GRAPHIC_SIZE = 1200;

type Theme = { bg: string; fg: string; accent: string; muted: string; logoBg: string; logoFg: string };
export const THEMES: Theme[] = [
  { bg: "#2563EB", fg: "#FFFFFF", accent: "#BFDBFE", muted: "#DBEAFE", logoBg: "#FFFFFF", logoFg: "#2563EB" },
  { bg: "#0F172A", fg: "#FFFFFF", accent: "#60A5FA", muted: "#CBD5E1", logoBg: "#2563EB", logoFg: "#FFFFFF" },
  { bg: "#FFFFFF", fg: "#0F172A", accent: "#2563EB", muted: "#475569", logoBg: "#2563EB", logoFg: "#FFFFFF" },
  { bg: "#F5EFE6", fg: "#1F2937", accent: "#C2410C", muted: "#57534E", logoBg: "#1F2937", logoFg: "#F5EFE6" },
  { bg: "#ECFDF5", fg: "#064E3B", accent: "#059669", muted: "#065F46", logoBg: "#064E3B", logoFg: "#ECFDF5" },
];

/** Stabiler Index aus dem Text (gleiche Aussage → gleiches Design, verschiedene Aussagen → meist verschieden). */
export function themeIndex(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % THEMES.length;
}

/** „4.300 € Nettoprämie aus 100 Leads“ → Zahl groß oben, Rest darunter. */
export function splitNumber(text: string): { big: string; rest: string } | null {
  const m = /^\s*([\d.,]+\s*(?:%|€|x|×)?)\s+(.{4,})$/.exec(text);
  return m && m[1].replace(/\D/g, "").length >= 1 ? { big: m[1].trim(), rest: m[2].trim() } : null;
}

function fontSize(text: string): number {
  const n = text.length;
  if (n <= 40) return 92;
  if (n <= 70) return 76;
  if (n <= 100) return 64;
  return 54;
}

function Logo({ t }: { t: Theme }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 16, background: t.logoBg }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={t.logoFg} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </div>
      <div style={{ display: "flex", fontSize: 36, fontWeight: 600, color: t.fg }}>performancegrowth</div>
    </div>
  );
}

export async function graphicResponse(text: string, variant?: number): Promise<ImageResponse> {
  const font = await boldFont();
  const clean = text.trim().slice(0, 140);
  const idx = variant ?? themeIndex(clean);
  const t = THEMES[idx % THEMES.length];
  const num = splitNumber(clean);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: t.bg,
          padding: 96,
          color: t.fg,
          ...(font ? { fontFamily: "Geist" } : {}),
        }}
      >
        <div style={{ display: "flex", width: 120, height: 10, background: t.accent, borderRadius: 5 }} />
        {num ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", fontSize: num.big.length > 7 ? 150 : 200, fontWeight: 800, lineHeight: 1, letterSpacing: -4, color: t.accent }}>{num.big}</div>
            <div style={{ display: "flex", fontSize: fontSize(num.rest) - 6, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1 }}>{num.rest}</div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: fontSize(clean), fontWeight: 700, lineHeight: 1.15, letterSpacing: -1 }}>{clean}</div>
        )}
        <Logo t={t} />
      </div>
    ),
    { width: GRAPHIC_SIZE, height: GRAPHIC_SIZE, ...(font ? { fonts: [{ name: "Geist", data: font, weight: 700 as const, style: "normal" as const }] } : {}) },
  );
}

/** PNG der Grafik (für das Hochladen zu LinkedIn). */
export async function renderGraphic(text: string): Promise<Buffer> {
  return Buffer.from(await (await graphicResponse(text)).arrayBuffer());
}
