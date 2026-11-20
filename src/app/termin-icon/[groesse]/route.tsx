import { ImageResponse } from "next/og";

// Neutrales Favicon für die Buchungsadresse dein-beratungstermin.de (Ole, 20.11.2026): Leads sehen dort kein
// performancegrowth-Logo, sondern einen Kalender mit Häkchen. Die Middleware leitet /icon, /apple-icon und
// /favicon.ico auf der Buchungsadresse hierher um (lib/public-booking-host.ts terminIconFuer).

const GROESSEN: Record<string, number> = { "180": 180, "192": 192, "512": 512 };

export async function GET(_req: Request, { params }: { params: Promise<{ groesse: string }> }) {
  const size = GROESSEN[(await params).groesse] ?? 192;
  // iOS (180) ohne Rundung und Transparenz, sonst leicht gerundet
  const radius = size === 180 ? 0 : Math.round(size * 0.22);
  const glyph = Math.round(size * 0.62);
  const res = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F766E", borderRadius: radius }}>
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
          <line x1="8" y1="2.5" x2="8" y2="6.5" />
          <line x1="16" y1="2.5" x2="16" y2="6.5" />
          <line x1="3" y1="9.5" x2="21" y2="9.5" />
          <polyline points="8.5 15 11 17.5 15.5 13" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
  res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}
