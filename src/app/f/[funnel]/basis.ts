// Gemeinsames der Funnel-Seiten auf dem Server: Metadata (Marke, Icons), Viewport (Markenfarbe) und Pfad-Basis
// (auf der Funnel-Adresse „/“, auf der App-Adresse „/f/<funnel>“).
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { funnelDef } from "@/lib/funnel/definition";
import { parseFunnelHosts } from "@/lib/funnel/host";
import { markeFuer } from "@/lib/funnel/marken";

export function funnelMetadata(key: string, titel: string): Metadata {
  const m = markeFuer(funnelDef(key)?.marke);
  return {
    title: { absolute: `${titel} | ${m.name}` },
    robots: { index: false, follow: false },
    icons: { icon: [{ url: m.dateien.favicon, type: "image/svg+xml" }], apple: [{ url: m.dateien.appleIcon, sizes: "180x180" }] },
    // Kein App-Manifest (performancegrowth) auf den Funnel-Seiten
    manifest: null,
  };
}

export function funnelViewport(key: string): Viewport {
  return { themeColor: markeFuer(funnelDef(key)?.marke).farben.primaer };
}

/** Pfad-Basis des Funnels für Links (Partnerliste, Start). */
export async function funnelBasis(key: string): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return parseFunnelHosts(process.env.FUNNEL_HOSTS).get(host) === key ? "" : `/f/${key}`;
}
