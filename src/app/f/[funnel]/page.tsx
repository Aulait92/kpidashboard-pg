import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { funnelDef, testSchritte, type Variante } from "@/lib/funnel/definition";
import { neueBesuchId } from "@/lib/funnel/host";
import { funnelPixelId, pixelBrauchtEinwilligung } from "@/lib/funnel/meta";
import { PKV_TEXTE } from "@/lib/funnel/pkv-beitrag-texte";
import { funnelDatenschutzEmail } from "@/lib/funnel/einstellungen";
import { variante } from "@/lib/experimente";
import { FunnelClient } from "./funnel-client";
import { funnelBasis, funnelMetadata, funnelViewport } from "./basis";

// Eigene Funnels (Ole, 20.11.2026): /f/pkv-beitrag, auf beitrag.pkv-tarife.com unter / (src/middleware.ts).
// Eine Frage je Schritt, Messung je Schritt, A/B-Fassungen je Schritt (lib/funnel/definition.ts, lib/experimente.ts).
// Besucher-ID je Seitenaufruf, ohne Cookie (Auflage L4): nur im Seitenzustand, Ereignisse und Absenden schicken sie mit.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ funnel: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return funnelMetadata((await params).funnel, PKV_TEXTE.seitenTitel);
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  return funnelViewport((await params).funnel);
}

export default async function FunnelPage({ params }: Props) {
  const { funnel } = await params;
  const f = funnelDef(funnel);
  if (!f) notFound();
  const besuchId = neueBesuchId();
  // Fassung je Schritt mit A/B-Test schon beim Laden kennen (kein Flackern); zugeteilt wird erst beim Ansehen des Schritts
  const varianten: Record<string, Variante> = {};
  for (const t of testSchritte(f)) varianten[t.schritt] = await variante(t.experiment, besuchId, { merken: false });
  const geladen = await serverZeit();
  return (
    <FunnelClient
      funnelKey={f.key}
      besuchId={besuchId}
      varianten={varianten}
      geladen={geladen}
      pixelId={funnelPixelId()}
      einwilligungNoetig={pixelBrauchtEinwilligung()}
      datenschutzEmail={funnelDatenschutzEmail()}
      basis={await funnelBasis(f.key)}
    />
  );
}

/** Serverzeit beim Laden (Mindestzeit beim Absenden, Bot-Schutz); eigene Funktion, damit die Seite rein bleibt. */
async function serverZeit(): Promise<number> {
  return Date.now();
}
