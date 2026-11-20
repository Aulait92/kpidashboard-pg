import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { funnelDef, testSchritte, type Variante } from "@/lib/funnel/definition";
import { BESUCH_COOKIE, BESUCH_HEADER, gueltigeBesuchId, neueBesuchId } from "@/lib/funnel/host";
import { funnelPixelId, pixelBrauchtEinwilligung } from "@/lib/funnel/meta";
import { PKV_TEXTE } from "@/lib/funnel/pkv-beitrag-texte";
import { variante } from "@/lib/experimente";
import { FunnelClient } from "./funnel-client";

// Eigene Funnels (Ole, 20.11.2026): /f/pkv-beitrag, auf beitrag.pkv-tarife.com unter / (src/middleware.ts).
// Eine Frage je Schritt, Messung je Schritt, A/B-Fassungen je Schritt (lib/funnel/definition.ts, lib/experimente.ts).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: PKV_TEXTE.seitenTitel,
  robots: { index: false, follow: false },
};

export default async function FunnelPage({ params }: { params: Promise<{ funnel: string }> }) {
  const { funnel } = await params;
  const f = funnelDef(funnel);
  if (!f) notFound();
  const h = await headers();
  const besuchId = gueltigeBesuchId(h.get(BESUCH_HEADER)) ?? gueltigeBesuchId((await cookies()).get(BESUCH_COOKIE)?.value) ?? neueBesuchId();
  // Fassung je Schritt mit A/B-Test schon beim Laden kennen (kein Flackern); zugeteilt wird erst beim Ansehen des Schritts
  const varianten: Record<string, Variante> = {};
  for (const t of testSchritte(f)) varianten[t.schritt] = await variante(t.experiment, besuchId, { merken: false });
  const geladen = await serverZeit();
  return <FunnelClient funnelKey={f.key} besuchId={besuchId} varianten={varianten} geladen={geladen} pixelId={funnelPixelId()} einwilligungNoetig={pixelBrauchtEinwilligung()} />;
}

/** Serverzeit beim Laden (Mindestzeit beim Absenden, Bot-Schutz); eigene Funktion, damit die Seite rein bleibt. */
async function serverZeit(): Promise<number> {
  return Date.now();
}
