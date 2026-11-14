// Text-Grafik für LinkedIn-Posts ohne Foto (Ole, 14.11.2026): nur Typografie – die Kernaussage
// groß in Weiß auf performancegrowth-Blau, unten das Logo. Keine Zeichnungen/Illustrationen.

import { ImageResponse } from "next/og";

export const GRAPHIC_SIZE = 1200;

function fontSize(text: string): number {
  const n = text.length;
  if (n <= 40) return 92;
  if (n <= 70) return 76;
  if (n <= 100) return 64;
  return 54;
}

export function graphicResponse(text: string): ImageResponse {
  const clean = text.trim().slice(0, 140);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#2563EB",
          padding: 96,
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", width: 120, height: 10, background: "#ffffff", opacity: 0.35, borderRadius: 5 }} />
        <div style={{ display: "flex", fontSize: fontSize(clean), fontWeight: 700, lineHeight: 1.15, letterSpacing: -1 }}>{clean}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 16, background: "#ffffff" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 600 }}>performancegrowth</div>
        </div>
      </div>
    ),
    { width: GRAPHIC_SIZE, height: GRAPHIC_SIZE },
  );
}

/** PNG der Grafik (für das Hochladen zu LinkedIn). */
export async function renderGraphic(text: string): Promise<Buffer> {
  return Buffer.from(await graphicResponse(text).arrayBuffer());
}
