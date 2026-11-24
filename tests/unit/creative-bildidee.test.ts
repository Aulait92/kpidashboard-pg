// Creative-Agent bei Mustern aus einem anderen Werbekonto (Ole, 24.11.2026): Er bekommt nur die abstrakte Bildidee
// (feste Kategorien), nie ein Vorlagenbild. Für eigene Gewinner bleibt das Vorlagenbild wie bisher.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ gerendert: [] as string[] }));
vi.mock("@/lib/html-to-png", () => ({ renderHtmlToImage: async (html: string) => (h.gerendert.push(html), Buffer.from("bild")) }));
vi.mock("@/lib/r2", () => ({ uploadImageToR2: async (o: { key: string }) => `https://r2.test/${o.key}` }));
vi.mock("@/lib/openai-image", () => ({
  resolvePhotoPlaceholders: async (html: string) => html,
  resolveComicPlaceholders: async (html: string) => html,
  generateFullCreativeImage: async () => null,
}));
vi.mock("@/lib/google-veo", () => ({ generateVideo: async () => ({ buffer: Buffer.from(""), durationSec: 0 }) }));
vi.mock("@/lib/video-subtitles", () => ({ burnGermanSubtitles: async () => ({ buffer: Buffer.from(""), burned: false }), concatVideos: async () => Buffer.from("") }));

import { renderProductCreative } from "@/lib/creative-gen";
import type { Bildidee } from "@/lib/kampagnen/types";

const FREMD_BILD = "https://scontent-fra3-1.xx.fbcdn.net/v/t45.1600-4/lohmann-katze.jpg?oe=ABC123";
const EIGENES_BILD = "https://scontent-fra3-1.xx.fbcdn.net/v/t45.1600-4/eigene-anzeige.jpg?oe=DEF456";
const BILDIDEE: Bildidee = { motivart: "tier", bildaufbau: "vollflaechig", bildausschnitt: "nah", farbwelt: "hell_warm", textplatzierung: "unten", textgestaltung: "band" };
const basis = { product: "Katzenversicherung (TKV)", place: "20095 Hamburg", advisorName: "Peter Schwarzkopf", headline: "Tierarztrechnung?", subline: "Ihr Berater in Hamburg", angle: "Kosten: Was kostet der Tierarzt?", requestId: "run1", index: 0 };

type Anfrage = { model: string; messages: { role: string; content: string | { type: string; text?: string; source?: { type: string; url: string } }[] }[] };
let anfragen: Anfrage[] = [];
const vorher = { ...process.env };

beforeEach(() => {
  anfragen = [];
  h.gerendert = [];
  process.env.ANTHROPIC_API_KEY = "test-key";
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    anfragen.push(JSON.parse(init.body) as Anfrage);
    return new Response(JSON.stringify({ content: [{ type: "text", text: "<creative_html><!DOCTYPE html><html><body>Creative</body></html></creative_html>" }], stop_reason: "end_turn" }), { status: 200 });
  });
});
afterEach(() => {
  process.env = { ...vorher };
  vi.unstubAllGlobals();
});

describe("renderProductCreative: Bildidee statt Vorlagenbild", () => {
  it("mit Bildidee: kein Bild an das Modell, nur der Text aus den festen Kategorien", async () => {
    const r = await renderProductCreative({ ...basis, bildidee: BILDIDEE });
    expect(r.imageUrl).toMatch(/^https:\/\/r2\.test\/kampagnen\/run1\/1-/);
    expect(anfragen).toHaveLength(1);
    const inhalt = anfragen[0].messages[0].content;
    expect(typeof inhalt).toBe("string"); // kein Bild-Block
    expect(inhalt).toContain("BILDIDEE (abstraktes Muster aus gut laufenden Anzeigen, es gibt kein Vorlagenbild): Motivart: Foto eines Tiers; Bildaufbau: ein Motiv füllt die ganze Fläche, der Text liegt darüber;");
    expect(inhalt).toContain("Keine Personen, Namen, Logos, Zahlen oder Texte aus anderen Anzeigen.");
    expect(inhalt).not.toMatch(/BILDSTIL-VORLAGE|eigene Anzeige des Kunden|Bild oben angehängt/);
    expect(JSON.stringify(anfragen)).not.toMatch(/fbcdn|scontent/);
  });

  it("selbst wenn zusätzlich ein Vorlagenbild und ein Stilhinweis übergeben würden: mit Bildidee gehen sie nie hinaus", async () => {
    await renderProductCreative({ ...basis, bildidee: BILDIDEE, referenceImageUrl: FREMD_BILD, styleHint: "Eigene Gewinner-Anzeige des Kunden „Lohmann | Katze“ (7,76 € je Lead, 31 Leads)" });
    expect(typeof anfragen[0].messages[0].content).toBe("string");
    expect(JSON.stringify(anfragen)).not.toMatch(/fbcdn|scontent|Lohmann|7,76|31 Leads|BILDSTIL-VORLAGE/);
    // freier Text statt fester Schlüssel: wird verworfen, auch dann kein Vorlagenbild
    anfragen = [];
    await renderProductCreative({ ...basis, bildidee: { ...BILDIDEE, motivart: "Max Lohmann vor seinem Büro in Musterstadt" }, referenceImageUrl: FREMD_BILD });
    expect(typeof anfragen[0].messages[0].content).toBe("string");
    expect(JSON.stringify(anfragen)).not.toMatch(/fbcdn|Lohmann|Musterstadt|BILDIDEE/);
  });

  it("eigener Gewinner wie bisher: Vorlagenbild angehängt, Stilhinweis im Text", async () => {
    const stil = "Eigene Gewinner-Anzeige des Kunden „Katze Tierarztrechnung“ (8 € je Lead, 30 Leads). Bildaufbau als Vorlage nehmen.";
    await renderProductCreative({ ...basis, referenceImageUrl: EIGENES_BILD, styleHint: stil });
    const inhalt = anfragen[0].messages[0].content as { type: string; text?: string; source?: { type: string; url: string } }[];
    expect(inhalt[0]).toEqual({ type: "image", source: { type: "url", url: EIGENES_BILD } });
    expect(inhalt[1].text).toContain(`BILDSTIL-VORLAGE (bestlaufende eigene Anzeige des Kunden, Bild oben angehängt): ${stil}`);
    expect(inhalt[1].text).not.toContain("BILDIDEE");
    // ohne alles: weder Bild noch Hinweis
    anfragen = [];
    await renderProductCreative(basis);
    expect(typeof anfragen[0].messages[0].content).toBe("string");
    expect(anfragen[0].messages[0].content).not.toMatch(/BILDSTIL-VORLAGE|BILDIDEE/);
  });
});
