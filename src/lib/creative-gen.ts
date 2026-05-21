import { uploadImageToR2 } from "@/lib/r2";
import { generateOpenAIImage } from "@/lib/openai-image";

// Brief der Creative-Generation. Claude brainstormt N diverse Konzepte und
// schreibt für jedes einen Image-Prompt; gpt-image-1 (OpenAI Images 2.0)
// rendert das fertige PNG inkl. aller Text-Overlays.
export type CreativeBrief = {
  campaignKey: string; // "Wechsel" | "Neugeschäft" | ...
  audience?: string; // z.B. "Selbstständige 30-45"
  tone?: string; // z.B. "Pain-Point" | "Neugier" | "Humor"
  count: number; // wie viele Varianten generieren
};

export type GeneratedCreative = {
  headline: string;
  body: string;
  cta: string;
  adText: string; // Facebook Primary-Text (über dem Bild im Feed), kann long-form sein
  fbHeadline: string; // Facebook Headline unter dem Bild (max ~40 Zeichen, snappy)
  mechanic: string; // Konzept-Mechanic (UGC-Selfie, Big-Number, Comic, …)
  imagePrompt: string; // der finale Text-Prompt an gpt-image-1 (Debug/Replay)
  imageUrl: string; // public URL nach R2-Upload
};

// ─── Claude Concept-Generation (Image-Prompts statt HTML) ────────────

type CreativeVariant = {
  headline: string;
  body: string;
  cta: string;
  adText: string;
  fbHeadline: string;
  imagePrompt: string;
  mechanic: string;
};

const CREATIVE_SYSTEM_PROMPT = `Du bist Senior Direct-Response-Creative-Director für Meta-Ads im deutschen PKV-Lead-Gen-Markt. Du schreibst präzise Bild-Prompts für OpenAI gpt-image-1 — das Modell rendert die komplette visuelle Komposition UND sämtliche Text-Overlays in einem Schritt.

ZIELGRUPPE: Privat versicherbare Personen (Selbstständige, Akademiker, Beamte, Angestellte > JAEG).
ZIEL: PKV-Beratungs-Termin buchen.

═══ COPY-REGELN ═══
- Spezifische Zahlen statt Adjektive ("−38%", "73.800€", "824€")
- Erste Person oder konkrete Persona
- Pain-Point / Curiosity / Promise / Story als Hook-Angle
- Headline max 6 Wörter (visuell IM Creative-Bild)
- Body max 90 Zeichen (visuell IM Creative-Bild, Sub-Headline)
- CTA max 18 Zeichen, handlungsorientiert
- VERBOTEN: "Jetzt sparen", "Top-Tarif", "Kostenlos", "Spitzenmäßig"
- Native-Feeling, kein Werbe-Sprech

═══ PKV-ANCHOR (PFLICHT, PROMINENT) ═══
Jedes Creative MUSS in <1 Sekunde signalisieren, dass es um PKV (Private
Krankenversicherung) geht. Das Wort "PKV" oder "Krankenversicherung" darf
NIE nur in kleinem Body-Text versteckt sein.

- "PKV" oder "Krankenversicherung" steht in einer visuell prominenten
  Textebene (Headline ODER eigene Anchor-Zeile, beides als groß renderbarer
  Text spezifiziert im Image-Prompt).
- "PKV" IMMER in Großbuchstaben.
- Im AdText (Facebook-Primary-Text) muss "PKV" oder "private Krankenversicherung"
  in den ersten 80 Zeichen vorkommen.

═══ FB-HEADLINE (Facebook Headline unter dem Bild, NICHT im Bild) ═══
- Max 40 Zeichen
- Snappy, konkret, Versprechen oder Frage
- Ergänzt die visuelle Headline, wiederholt sie NICHT
- Beispiele:
  - Bild-Headline: "STOPP." → fb_headline: "PKV-Beitrag halbieren — in 2 Min."
  - Bild-Headline: "−38%" → fb_headline: "Dein PKV-Beitrag, neu gerechnet"

═══ ADTEXT (Facebook Primary-Text, NICHT im Bild) ═══
LÄNGEN-MIX über die Varianten:
- SHORT (60-120 Zeichen): Ein Satz, Hook + CTA.
- MEDIUM (150-300 Zeichen): 2-3 Sätze, Problem → Lösung → Soft-CTA.
- LONG (400-800 Zeichen, AIDA-Style): Story-Form mit Hook, Pain, Mechanismus,
  Zahlen, Soft-CTA. Fließtext mit Absätzen via doppelter Newline. KEINE Listen.

ADTEXT-STIL:
- Du-Form, persönlich
- Max 1 Emoji
- Keine Marketing-Klischees
- Erste Zeile MUSS hooken (Facebook zeigt nur ~125 Zeichen vor "Mehr")
- Kein expliziter Link im Text

═══ IMAGE-PROMPT FÜR gpt-image-1 — SO SCHREIBST DU IHN ═══

gpt-image-1 ist sehr gut darin, Text in Bildern zu rendern — aber nur wenn
du es explizit anweist und den Text in Anführungszeichen setzt. Schreibe
den Prompt auf ENGLISCH (besseres Verständnis), aber den ZU RENDERENDEN TEXT
GENAU in deutscher Original-Schreibweise inkl. Umlaute und Sonderzeichen.

PROMPT-STRUKTUR (in dieser Reihenfolge):
1. Composition / Mechanic (1 Satz): was sieht man? (UGC-Selfie / Big-Number / Newspaper-Mockup / Comic-Illustration / Photo-Hero / Konto-Vergleich…)
2. Style / Look (1 Satz): photorealistic, polished editorial, flat-comic, iPhone-screenshot-feel, newspaper-print, …
3. Subject details (1-2 Sätze): wer ist im Bild, was macht die Person, Setting, Lichtstimmung
4. Text overlays (PFLICHT, mit Anführungszeichen): "Render the German text 'STOPP.' in huge bold black sans-serif at top center, and 'Dein PKV-Beitrag halbieren' below in white on a black caption box at bottom."
5. Color palette / typography hints (1 Satz): Inter sans-serif, cream background #FAF6F0 with accent yellow, oder Caveat handwriting font for whiteboard scenes, …
6. Format: "Square 1:1 composition optimized for Meta feed, full-bleed, no white margins."

WICHTIG bei Text im Bild:
- Jeden zu rendernden Text in einfache Anführungszeichen setzen ('…')
- Schreibweise EXAKT wie sie erscheinen soll (inkl. Umlaute, Sonderzeichen, Großbuchstaben für "PKV")
- Position klar benennen (top center / bottom-left caption box / large hero overlay)
- Schriftfamilie + Gewicht spezifizieren (bold sans-serif / Caveat handwritten marker / serif newspaper)
- Größe relativ beschreiben ("huge", "very large", "small", "medium")
- KEINE 3+ unterschiedlichen Text-Blöcke im selben Bild — gpt-image-1 verheddert sich, wenn zu viele Texte gleichzeitig gerendert werden müssen. Maximal: Headline + Body + CTA-Button-Label + ein winziges "ANZEIGE"-Tag.

NIE in Image-Prompts:
- Logos echter Marken
- Erkennbare Persönlichkeiten / Promis / Schauspieler
- "in the style of <famous artist>" (Modell darf nicht imitieren)

═══ DIRECT-RESPONSE-MECHANIKEN ═══
Wähle pro Variante eine Mechanic und führe sie konsequent aus:

1. BIG-NUMBER — Riesige Zahl/Prozent als Hero ("−38%", "73.800€"), kurze Erklär-Zeile drunter. Prompt-Bsp: "Editorial poster with a huge '-38%' rendered in 600pt black Inter Black, centered. Below in 60pt: 'Dein PKV-BEITRAG'. Cream background #FAF6F0. Minimalist, magazine-style, square 1:1."

2. STOPP-INTERRUPT — Pattern-Break, rote Fläche, kurze Warnung. Prompt-Bsp: "Bold poster, solid red background #E53935. Massive white text 'STOPP.' centered in bold sans-serif. Below: 'PKV-Beitrag über 700€?' in 80pt white. Bottom: small yellow CTA button text 'Jetzt prüfen →'. 1:1 square."

3. NEWSPAPER-MOCKUP — Editorial print-look. Prompt-Bsp: "Photorealistic mockup of a German newspaper page titled 'Der Finanzbote', serif headline 'Wer mehr als 700 Euro PKV zahlt, sollte das wissen.' Black-and-white grainy photo of a 45-year-old man at a kitchen table. Newspaper-print texture, off-white #F7F4EE. 1:1 square."

4. KONTO-VERGLEICH-MOCKUP — Browser-/App-Screenshot mit Tarif-Vergleich. Prompt-Bsp: "Photorealistic screenshot of a German insurance comparison app. White card with two columns: left 'Heute: 824 €/Monat' in red strikethrough, right 'Nach Wechsel: 412 €' in green. Headline above: 'Dein PKV-Beitrag, neu gerechnet'. Light grey background. Handwritten arrow with text '-50%' in orange marker. 1:1 square."

5. UGC-SELFIE-CAPTION — wirkt wie iPhone-Screenshot. Prompt-Bsp: "Authentic phone selfie of a casual 38-year-old German woman in her home kitchen, natural light, slightly imperfect framing — looks like organic social content, not a professional shoot. At the bottom: a solid black rounded rectangle caption box with white bold Inter text 'Mein PKV-Beitrag war 824 €. Jetzt 412 €.'. Full-bleed, 1:1 square."

6. UGC-WHITEBOARD — Foto eines Whiteboards mit handgeschriebener PKV-Aussage. Prompt-Bsp: "Photo of an empty office whiteboard. Handwritten in black marker (Caveat-style font): 'PKV wechseln OHNE Anbieterwechsel = §204 VVG'. Slightly imperfect, natural marker strokes. Bottom: black caption box with white bold text 'Bis zu 50% weniger Beitrag. Gleicher Anbieter.'. 1:1 square."

7. UGC-DESK-DOCUMENTS — Schreibtisch mit Briefen/Rechnungen. Prompt-Bsp: "Overhead photo of a wooden desk with several insurance letters and bills. One bill is highlighted with a pink marker streak over the amount '824 €'. Coffee mug at the corner, natural daylight. Bottom: black caption box with white bold text 'Dein PKV-Beitrag — und warum er sinken könnte.'. 1:1 square."

8. PHOTO-BIG-HEADLINE — Foto full-bleed mit fetter Overlay-Headline. Prompt-Bsp: "Editorial portrait of a 45-year-old German man at his kitchen table, thoughtful expression, soft window light. Dark gradient overlay at the bottom. Massive white headline 'Anbieter bleibt. Tarif wechselt.' rendered in 130pt Inter Black, bottom-aligned. Small CTA tag 'Jetzt prüfen →'. 1:1 square."

9. COMIC-ILLUSTRATION — flach-comicstil, abstrahiertes Konzept. Prompt-Bsp: "Flat comic illustration in modern editorial style, bold black outlines, limited color palette (#FFD84D, #E53935, off-white #FAF6F0). A surprised middle-aged man at a desk watches euro coins flying away from his wallet. Above in 100pt bold sans-serif: '824 € — jeden Monat?'. Below in 50pt: 'Dein PKV-BEITRAG'. 1:1 square."

10. HIGHLIGHTER-HOOK — schwarze Headline mit gelbem Marker-Highlight. Prompt-Bsp: "Minimalist editorial poster, cream background #FAF6F0. Black serif headline 'Diese 3 Sätze kosten dich jedes Jahr 4.000 € PKV-Beitrag.' centered, with yellow highlighter streak (rotated -2°) over '4.000 € PKV-Beitrag'. Small CTA at the bottom 'Jetzt prüfen →'. 1:1 square."

═══ CANVAS / FORMAT ═══
- Alle Creatives 1:1 quadratisch, optimiert für 1024×1024 (Meta-Feed)
- Full-bleed: kein weißer Rand außenrum
- Hero-Element füllt mindestens 70% der Fläche
- Lesbarkeit auf Smartphone-Feed muss in 1.5 Sekunden gegeben sein
- Maximal 4 unterschiedliche Text-Blöcke im Bild (Hero-Headline, Sub-Headline, CTA-Label, kleines ANZEIGE-Tag)

═══ OUTPUT-FORMAT ═══
Antworte mit einer Sequenz von <variant>…</variant>-Blöcken, EIN Block pro
Creative. KEIN Markdown, KEIN JSON, KEIN Fließtext drumherum. Format exakt:

<variant>
<headline>Visuelle Hero-Zeile im Creative-Bild (max 6 Wörter)</headline>
<body>Sub-Headline im Creative-Bild (max 90 Zeichen)</body>
<cta>CTA-Button-Text im Creative-Bild (max 18 Zeichen)</cta>
<fb_headline>Facebook-Headline unter dem Bild (max 40 Zeichen, snappy)</fb_headline>
<ad_text>
Facebook-Primary-Text über dem Bild (short / medium / long — variiere über die Varianten).
Fließtext mit Absätzen via doppelter Newline. KEIN Markdown, KEINE Listen.
</ad_text>
<image_prompt>
Englischer gpt-image-1-Prompt mit deutschen Text-Overlays in Anführungszeichen.
Folge der Struktur Composition → Style → Subject → Text overlays → Color/Typo → Format.
</image_prompt>
</variant>`;

// Kampagnen-spezifische Briefings.
const CAMPAIGN_CONTEXT: Record<string, string> = {
  Wechsel: `═══ KAMPAGNEN-KONTEXT: WECHSEL ═══
ZIELGRUPPE:
- Bereits PKV-Versicherte mit monatlichem Beitrag ab ~700€
- Beiträge steigen jährlich, oft seit Jahren, Leistungen werden nicht besser
- Wissen meist NICHT, dass interner Tarifwechsel überhaupt möglich ist

PAIN-POINTS:
- "Mein PKV-Beitrag ist von 600€ auf 850€ gestiegen — und steigt weiter"
- "Ich bekomme die gleichen Leistungen wie vor 5 Jahren, zahle aber 40% mehr"
- "Eine Kündigung verliert meine Altersrückstellungen — also bleibe ich"

KEY-INSIGHT (der eigentliche Hook):
Interner Tarifwechsel beim GLEICHEN Anbieter ist gesetzlich möglich (§204 VVG).
KEINE neue Gesundheitsprüfung, Altersrückstellungen bleiben erhalten, alte
Konditionen müssen vom Versicherer angeboten werden.

PROMISE (mit echten Zahlen):
- Bis zu 50% Beitrags-Ersparnis
- Beispiel-Größenordnungen: 824€ → 412€, 950€ → 520€, 720€ → 380€
- Spar-Hochrechnung: 400€/Monat × 12 = 4.800€/Jahr × 20 Jahre = 96.000€

USPs:
- Versicherung bleibt — kein neuer Vertrag, keine Gesundheitsprüfung
- Altersrückstellungen bleiben vollständig erhalten
- Funktioniert bei JEDEM PKV-Anbieter
- Unverbindliche Prüfung, kein Telefonzwang

VERMEIDE bei Wechsel:
- "Privat versichern" / "PKV-Vergleich" → das ist Neugeschäft, nicht Wechsel
- "Kündigung" / "wechseln Sie den Anbieter" → falsches Mental Model
- Allgemeine Spar-Versprechen ohne konkrete Zahl

PASSENDE HOOKS (Beispiele):
- "Dein PKV-Beitrag: 824€/Monat. Geht auch 412€."
- "PKV über 700€? Dann zahlst du wahrscheinlich zu viel."
- "Anbieter bleibt. Tarif wechselt. −50%."
- "§204 VVG. Das Wort, das deinen PKV-Beitrag halbiert."
- "Kein Anbieter-Wechsel. Keine Gesundheitsprüfung. Bis −50%."`,

  Neugeschäft: `═══ KAMPAGNEN-KONTEXT: NEUGESCHÄFT ═══
ZIELGRUPPE:
- Aktuell GESETZLICH versichert (GKV), NICHT PKV
- Einkommen ÜBER der Jahresarbeitsentgeltgrenze (JAEG, 2026: ~73.800€/Jahr) — ODER selbstständig, ODER Beamter
- Zahlen oft den GKV-Höchstbeitrag (2026: ~1.261€/Monat inkl. Pflege)
- Genervt von: steigenden GKV-Beiträgen, vollen Wartezimmern, Mehrbett-Zimmer, keinem Chefarzt

PAIN-POINTS:
- "Ich zahle 1.261€ GKV-Höchstbeitrag, bekomme aber die gleichen Leistungen wie ein 22-jähriger Azubi"
- "Termin beim Facharzt: 3 Monate. Privatpatienten: nächste Woche."
- "Ich verdiene gut, könnte längst raus aus der GKV — aber niemand erklärt mir die Optionen"

KEY-INSIGHT:
Wer ÜBER der JAEG verdient (oder SE/Beamter ist), kann die GKV verlassen
und in die PKV wechseln. Bei jungen, gesunden Verdienern oft deutlich
günstiger als der GKV-Höchstbeitrag — bei DEUTLICH besseren Leistungen.

PROMISE:
- GKV-Höchstbeitrag 2026: ~1.261€/Monat (inkl. Pflege)
- PKV bei 35-jährigem Angestellten/Selbstständigem: oft 380-550€/Monat
- Spar-Größenordnung: 700-880€/Monat = 8.400-10.560€/Jahr

USPs:
- Chefarzt-Behandlung als Standard
- Einzel- oder Zweibettzimmer im Krankenhaus
- Termine in Tagen statt Wochen
- Freie Arzt- und Klinikwahl

VERMEIDE bei Neugeschäft:
- "Tarifwechsel" / "interner Wechsel" → das ist Wechsel-Kampagne
- "Anbieter bleibt" → User ist noch GAR NICHT in PKV
- "Bis zu 50% Ersparnis" → das ist Wechsel-Promise. Hier konkrete €-Zahl

PASSENDE HOOKS (Beispiele):
- "GKV-Höchstbeitrag: 1.261€. PKV mit 35: 412€."
- "Verdienst du über 73.800€? Du musst NICHT in der GKV bleiben."
- "1.261€/Monat GKV — und du wartest 3 Monate auf den Termin?"
- "Selbstständig? Dann zahlst du GKV freiwillig. Nicht clever."`,
};

// ─── Phase 1: Konzept-Brainstorm ─────────────────────────────────────

type Concept = {
  hookAngle: string; // Pain | Curiosity | Promise | Story | Outrage | Insight
  mechanic: string; // Big-Number | STOPP | Newspaper-Mockup | UGC-Selfie | …
  visualStyle: "photo" | "ugc" | "typography" | "comic";
  copyLength: "short" | "medium" | "long";
  description: string;
};

async function brainstormConcepts(brief: CreativeBrief): Promise<Concept[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");

  const campaignContext = CAMPAIGN_CONTEXT[brief.campaignKey] ?? "";

  type Style = "photo" | "ugc" | "comic" | "typography";
  const slotStyles: Style[] = (() => {
    if (brief.count === 1) {
      const r = Math.random();
      if (r < 0.3) return ["ugc"];
      if (r < 0.5) return ["photo"];
      if (r < 0.7) return ["comic"];
      return ["typography"];
    }
    if (brief.count === 2) {
      return ["ugc", Math.random() < 0.5 ? "comic" : "typography"];
    }
    if (brief.count === 3) {
      return ["ugc", "comic", "typography"];
    }
    const n = brief.count;
    const ugcCount = Math.max(1, Math.round(n * 0.3));
    const photoCount = Math.max(1, Math.round(n * 0.2));
    const comicCount = Math.max(1, Math.round(n * 0.2));
    const typoCount = Math.max(0, n - ugcCount - photoCount - comicCount);
    const styles: Style[] = [
      ...Array(ugcCount).fill("ugc"),
      ...Array(photoCount).fill("photo"),
      ...Array(comicCount).fill("comic"),
      ...Array(typoCount).fill("typography"),
    ];
    for (let i = styles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [styles[i], styles[j]] = [styles[j], styles[i]];
    }
    return styles.slice(0, n);
  })();

  const slotInstructions = slotStyles
    .map((s, i) => `  Konzept ${i + 1}: visualStyle = "${s}"`)
    .join("\n");

  const userPrompt = `Du brainstormst ${brief.count} ${brief.count === 1 ? "Konzept" : "distinkte Konzepte"} für Meta-Ad-Creatives zur ${brief.campaignKey}-Kampagne. Jedes Creative wird mit gpt-image-1 (OpenAI Images 2.0) gerendert — du brainstormst nur die Konzepte, der Image-Prompt wird in der nächsten Stufe geschrieben.

${campaignContext}

${brief.audience ? `ZIELGRUPPE-FOKUS: ${brief.audience}` : ""}
${brief.tone ? `TONE: ${brief.tone}` : ""}

WICHTIG: maximale Varianz zwischen den Konzepten. Jedes Konzept braucht:
- ANDEREN hookAngle (Pain ≠ Curiosity ≠ Promise ≠ Story ≠ Outrage ≠ Insight)
- ANDERE mechanic
- ANDEREN copyLength wenn möglich (mische short/medium/long)

VISUAL-STYLE PRO SLOT (FEST VORGEGEBEN, NICHT ABWEICHEN):
${slotInstructions}

Für "photo"-Slots: wähle eine foto-getragene Mechanic (Photo-Big-Headline, Newspaper-Mockup, Editorial-Portrait, Lifestyle-Hero).
Für "ugc"-Slots: wähle eine UGC-Mechanic (UGC-Selfie-Caption, UGC-Whiteboard, UGC-Desk-Documents, UGC-Close-Up-Person). Wirkt wie iPhone-Screenshot.
Für "comic"-Slots: wähle Comic-Illustration (flat-comic editorial style, bold outlines, limited palette).
Für "typography"-Slots: typo-Mechanic (Big-Number, STOPP-Interrupt, Highlighter-Hook, Konto-Vergleich-Mockup, Search-Bar-Mockup).

PKV-ANCHOR (PFLICHT):
Jedes Konzept MUSS unmissverständlich PKV/Private-Krankenversicherung-Kontext setzen. Die Description macht klar, wo "PKV", "PKV-Beitrag" oder "Krankenversicherung" als großer Text im Bild auftaucht.

VERFÜGBARE MECHANIKEN:
- Photo: Photo-Big-Headline / Newspaper-Mockup / Editorial-Portrait / Lifestyle-Hero
- UGC: UGC-Selfie-Caption / UGC-Whiteboard / UGC-Desk-Documents / UGC-Close-Up-Person / UGC-Phone-Screenshot
- Comic: Comic-Illustration / Comic-Big-Headline
- Typo: Big-Number / STOPP-Interrupt / Highlighter-Hook / Konto-Vergleich-Mockup / Search-Bar-Mockup / 3-Fragen-Quiz / Brief-vom-Versicherer-Mockup

OUTPUT (strict, NUR <concept>-Blöcke, kein Drumherum, EXAKT in der Reihenfolge oben):

<concept>
<hookAngle>Pain</hookAngle>
<mechanic>Konto-Vergleich-Mockup</mechanic>
<visualStyle>typography</visualStyle>
<copyLength>medium</copyLength>
<description>App-Screenshot-Mockup mit GKV-vs-PKV-Vergleich, Headline "Dein PKV-Beitrag heute vs. nach Wechsel". 824€ → 412€. Handgemalter Pfeil "−50%". AdText: 3-Satz-Story einer Wechslerin.</description>
</concept>`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: `Du bist Senior Direct-Response-Creative-Director für deutsche PKV-Lead-Gen-Ads. Du brainstormst maximal diverse Konzept-Sets — jedes Konzept eine andere Mechanic, ein anderer Hook, eine andere visuelle Sprache.`,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude Brainstorm ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const concepts = parseConceptBlocks(text);
  if (concepts.length === 0) {
    throw new Error(`Brainstorm enthielt keine <concept>-Blöcke: ${text.slice(0, 300)}…`);
  }

  const enforced = concepts.slice(0, brief.count).map((c, i) => ({
    ...c,
    visualStyle: slotStyles[i] ?? c.visualStyle,
  }));

  console.log(
    "[creative-gen] Brainstormed concepts:",
    enforced.map((c) => `${c.mechanic}/${c.hookAngle}/${c.visualStyle}/${c.copyLength}`),
  );
  return enforced;
}

function parseConceptBlocks(text: string): Concept[] {
  const re = /<concept>([\s\S]*?)<\/concept>/g;
  const out: Concept[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1];
    const hookAngle = extractTag(inner, "hookAngle");
    const mechanic = extractTag(inner, "mechanic");
    const visualStyle = extractTag(inner, "visualStyle");
    const copyLength = extractTag(inner, "copyLength");
    const description = extractTag(inner, "description");
    if (!hookAngle || !mechanic || !visualStyle || !copyLength || !description) continue;
    out.push({
      hookAngle,
      mechanic,
      visualStyle:
        visualStyle === "photo"
          ? "photo"
          : visualStyle === "ugc"
            ? "ugc"
            : visualStyle === "comic"
              ? "comic"
              : "typography",
      copyLength:
        copyLength === "long" ? "long" : copyLength === "medium" ? "medium" : "short",
      description,
    });
  }
  return out;
}

// ─── Phase 2: Execution pro Konzept (Texte + Image-Prompt) ──────────

async function generateOneCreative(
  brief: CreativeBrief,
  concept: Concept,
): Promise<CreativeVariant> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");

  const campaignContext = CAMPAIGN_CONTEXT[brief.campaignKey] ?? "";
  const styleHint =
    concept.visualStyle === "photo"
      ? `PHOTO-PFLICHT: Der image_prompt MUSS eine fotografische Szene beschreiben (photorealistic, editorial portrait, lifestyle), KEIN Cartoon, KEINE Illustration. Personen MÜSSEN deutsch aussehen (alter, kleidung, setting authentisch europäisch).`
      : concept.visualStyle === "ugc"
        ? `UGC-PFLICHT: Der image_prompt MUSS folgendes beschreiben:
1. Ein authentisch wirkendes Foto (Selfie / Schreibtisch / Whiteboard / Halbportrait) — "natural light, slightly imperfect framing, looks like organic social content, not a professional shoot".
2. Eine schwarze rounded-rectangle CAPTION BOX am unteren Bildrand mit weißem, fettem Inter-Text (1-3 Zeilen, MUSS "PKV" oder "Krankenversicherung" enthalten). Genau diese Caption-Box ist das visuelle Wiedererkennungsmerkmal — ohne Caption-Box kein UGC.
3. KEIN designed Gradient, KEIN ANZEIGE-Label oben — Look wie iPhone-Screenshot.`
        : concept.visualStyle === "comic"
          ? `COMIC-PFLICHT: Der image_prompt MUSS "flat comic illustration in modern editorial style, bold black outlines, limited color palette" o.ä. enthalten. KEIN Foto-Look. Text-Overlays in sans-serif sind ok, idealerweise als gerendertes Layout drumherum.`
          : `TYPO-PFLICHT: Der image_prompt MUSS eine typografische Komposition beschreiben (Poster-Style, Big-Number, Mockup-Screenshot). KEIN echtes Foto einer Person. Falls eine fotorealistische Element-Anmutung (Brief, Browser-Window, App-Card) gefragt ist, dann nur als Mockup-UI.`;

  const lengthRange =
    concept.copyLength === "long"
      ? "400-800 Zeichen, AIDA-Story-Struktur, mehrere Absätze"
      : concept.copyLength === "medium"
        ? "150-300 Zeichen, 2-3 Sätze, Problem → Lösung → Soft-CTA"
        : "60-120 Zeichen, ein Satz, Hook + Soft-CTA";

  const userPrompt = `Setze dieses ${brief.campaignKey}-Kampagnen-Konzept als einzelnes Meta-Ad-Creative um. Du schreibst die Texte UND den Bild-Prompt für gpt-image-1.

${campaignContext}

${brief.audience ? `ZIELGRUPPE-FOKUS: ${brief.audience}` : ""}
${brief.tone ? `TONE: ${brief.tone}` : ""}

KONZEPT:
- Hook-Angle: ${concept.hookAngle}
- Mechanic: ${concept.mechanic}
- Visual-Style: ${concept.visualStyle}
- Copy-Length für adText: ${concept.copyLength} (${lengthRange})
- Konzept-Skizze: ${concept.description}

${styleHint}

Antworte mit GENAU EINEM <variant>-Block im definierten Format (inkl. <image_prompt>). Kein Brainstorm, keine Alternativen.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: CREATIVE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude Execution ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const variants = parseVariantBlocks(text);
  if (variants.length === 0) {
    throw new Error(
      `Execution für Konzept "${concept.mechanic}" lieferte keinen <variant>: ${text.slice(0, 300)}…`,
    );
  }
  return { ...variants[0], mechanic: concept.mechanic };
}

// ─── Orchestrator: brainstorm → parallel execution ───────────────────

async function generateCreativeVariants(
  brief: CreativeBrief,
): Promise<CreativeVariant[]> {
  const concepts = await brainstormConcepts(brief);
  if (concepts.length < brief.count) {
    console.warn(
      `[creative-gen] Brainstorm lieferte nur ${concepts.length}/${brief.count} Konzepte — fahre mit weniger fort.`,
    );
  }
  const settled = await Promise.allSettled(
    concepts.map((c) => generateOneCreative(brief, c)),
  );
  const variants: CreativeVariant[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      variants.push(r.value);
    } else {
      console.warn(
        `[creative-gen] Execution für Konzept ${i + 1} (${concepts[i]?.mechanic}) failte:`,
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  });
  if (variants.length === 0) {
    throw new Error("Keine einzige Variante konnte generiert werden.");
  }
  return variants;
}

function parseVariantBlocks(text: string): CreativeVariant[] {
  const variantRe = /<variant>([\s\S]*?)<\/variant>/g;
  const blocks: CreativeVariant[] = [];
  let match: RegExpExecArray | null;
  while ((match = variantRe.exec(text)) !== null) {
    const inner = match[1];
    const headline = extractTag(inner, "headline");
    const body = extractTag(inner, "body");
    const cta = extractTag(inner, "cta");
    const adText = extractTag(inner, "ad_text") ?? "";
    const fbHeadline = extractTag(inner, "fb_headline") ?? "";
    const imagePrompt = extractTag(inner, "image_prompt");
    if (!headline || !body || !cta || !imagePrompt) continue;
    blocks.push({
      headline,
      body,
      cta,
      adText,
      fbHeadline,
      imagePrompt,
      mechanic: "",
    });
  }
  return blocks;
}

function extractTag(source: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = source.match(re);
  return m ? m[1].trim() : null;
}

// ─── Orchestrator ────────────────────────────────────────────────────

export async function generateCreatives(
  brief: CreativeBrief,
  requestId: string,
): Promise<GeneratedCreative[]> {
  const variants = await generateCreativeVariants(brief);

  // Parallel Image-Generation + Upload mit allSettled — ein OpenAI- oder
  // R2-Fehler in einer Variante soll nicht den ganzen Batch killen.
  const settled = await Promise.allSettled(
    variants.map(async (v, i) => {
      const { buffer, contentType } = await generateOpenAIImage({
        prompt: v.imagePrompt,
        size: "1024x1024",
        quality: "high",
        format: "jpeg",
      });
      const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
      const key = `creatives/${requestId}/${i + 1}.${ext}`;
      const imageUrl = await uploadImageToR2({
        buffer,
        key,
        contentType,
      });
      return {
        headline: v.headline,
        body: v.body,
        cta: v.cta,
        adText: v.adText,
        fbHeadline: v.fbHeadline,
        mechanic: v.mechanic,
        imagePrompt: v.imagePrompt,
        imageUrl,
      } satisfies GeneratedCreative;
    }),
  );
  const results: GeneratedCreative[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      results.push(r.value);
    } else {
      console.warn(
        `[creative-gen] Image-Generation/Upload für Variante ${i + 1} failte:`,
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  });

  return results;
}

// ─── Einzelfeld-Regeneration (nur adText oder nur fbHeadline) ────────

type RegenContext = {
  campaignKey: string;
  audience?: string;
  tone?: string;
  headline: string;
  body: string;
  cta: string;
  currentAdText?: string;
  currentFbHeadline?: string;
};

async function callClaudeSingleText(opts: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  return data.content.find((c) => c.type === "text")?.text ?? "";
}

export async function regenerateAdText(ctx: RegenContext): Promise<string> {
  const campaignContext = CAMPAIGN_CONTEXT[ctx.campaignKey] ?? "";
  const text = await callClaudeSingleText({
    system: `Du schreibst Facebook-Primary-Texte für deutsche PKV-Lead-Gen-Ads. Native-Feeling, Du-Form, keine Marketing-Klischees, erste 80 Zeichen müssen hooken und PKV-Bezug klarmachen. Antworte NUR mit dem reinen Text, KEINE Anführungszeichen, KEIN Drumherum.`,
    user: `${campaignContext}

${ctx.audience ? `ZIELGRUPPE: ${ctx.audience}` : ""}
${ctx.tone ? `TONE: ${ctx.tone}` : ""}

Das Creative-Bild zeigt:
- Headline: "${ctx.headline}"
- Sub-Headline: "${ctx.body}"
- CTA: "${ctx.cta}"
${ctx.currentAdText ? `\nAktueller Facebook-Text (mir gefällt's nicht, generiere etwas KOMPLETT anderes — anderer Hook-Angle, andere Länge):\n"""\n${ctx.currentAdText}\n"""` : ""}

Schreibe einen NEUEN Facebook-Primary-Text. Wähle bewusst eine andere Länge/Stil als ${ctx.currentAdText ? "der aktuelle" : "default"}: zwischen 60 (Snappy-Hook) und 800 Zeichen (Long-Form-Story).`,
    maxTokens: 1500,
  });
  return text.trim().replace(/^["„'`]+|["„'`]+$/g, "");
}

export async function regenerateFbHeadline(ctx: RegenContext): Promise<string> {
  const campaignContext = CAMPAIGN_CONTEXT[ctx.campaignKey] ?? "";
  const text = await callClaudeSingleText({
    system: `Du schreibst Facebook-Ad-Headlines (das Feld unter dem Bild im Feed, neben dem CTA-Button). Max 40 Zeichen. Snappy, konkret, ergänzt die visuelle Hero-Headline im Bild (wiederholt sie NICHT). Antworte NUR mit der Headline, KEINE Anführungszeichen, KEIN Drumherum.`,
    user: `${campaignContext}

Das Creative-Bild zeigt:
- Visuelle Hero-Headline: "${ctx.headline}"
- Sub-Headline: "${ctx.body}"
- CTA: "${ctx.cta}"
${ctx.currentFbHeadline ? `\nAktuelle Facebook-Headline (mir gefällt's nicht, generiere etwas KOMPLETT anderes):\n"${ctx.currentFbHeadline}"` : ""}

Schreibe eine NEUE Facebook-Headline (max 40 Zeichen). Ergänzt die visuelle Headline, wiederholt sie nicht.`,
    maxTokens: 200,
  });
  return text.trim().replace(/^["„'`]+|["„'`]+$/g, "").slice(0, 60);
}

// ─── Image-Regeneration: gleiche Texte/Mechanic, neuer Image-Prompt ──

export async function regenerateCreativeImage(
  brief: CreativeBrief,
  requestId: string,
  fixed: {
    headline: string;
    body: string;
    cta: string;
    mechanic?: string;
    currentImagePrompt?: string;
  },
): Promise<{ imageUrl: string; imagePrompt: string }> {
  const campaignContext = CAMPAIGN_CONTEXT[brief.campaignKey] ?? "";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");

  const mechanic = fixed.mechanic ?? "";
  const visualStyle: "photo" | "ugc" | "comic" | "typography" = /^UGC-/i.test(
    mechanic,
  )
    ? "ugc"
    : /^Comic-/i.test(mechanic)
      ? "comic"
      : /^(Photo-|Newspaper|Editorial-Portrait|Lifestyle-Hero)/i.test(mechanic)
        ? "photo"
        : mechanic
          ? "typography"
          : Math.random() < 0.5
            ? "photo"
            : "typography";

  const styleHint =
    visualStyle === "ugc"
      ? `Visual-Style: UGC (native iPhone-Screenshot-Look). Image-Prompt beschreibt: authentisches Foto + schwarze CAPTION-BOX unten mit weißem fettem Inter-Text der "PKV" enthält.`
      : visualStyle === "comic"
        ? `Visual-Style: Comic. Image-Prompt beschreibt: "flat comic illustration in modern editorial style, bold black outlines, limited color palette".`
        : visualStyle === "photo"
          ? `Visual-Style: polished Photo. Image-Prompt beschreibt: photorealistic editorial portrait/lifestyle scene.`
          : `Visual-Style: typografisch. Image-Prompt beschreibt: Poster/Mockup mit großem Text als Hero, kein Foto einer Person.`;

  const userPrompt = `Schreibe einen NEUEN Image-Prompt für gpt-image-1 für eine bestehende ${brief.campaignKey}-Meta-Ad. Die TEXTE bleiben unverändert UND das Format/die Mechanic bleibt dieselbe — du variierst nur die konkrete visuelle Komposition (Motiv, Layout, Farben).

${campaignContext}

${brief.audience ? `ZIELGRUPPE: ${brief.audience}` : ""}
${brief.tone ? `TONE: ${brief.tone}` : ""}

FIXIERTE TEXTE (musst du genau so im Image-Prompt nutzen, in Anführungszeichen):
- Headline im Creative: "${fixed.headline}"
- Body im Creative: "${fixed.body}"
- CTA-Button: "${fixed.cta}"

${mechanic ? `MECHANIC (bleibt fix): ${mechanic}` : ""}
${styleHint}
${fixed.currentImagePrompt ? `\nAKTUELLER PROMPT (mir gefällt's nicht, mache es deutlich anders):\n"""\n${fixed.currentImagePrompt}\n"""` : ""}

WAS DU VARIIEREN SOLLST:
- Bei photo/UGC: andere Subject-Description (anderes Setting, andere Person, anderes Licht)
- Bei comic: andere Szene/Metapher
- Bei typo: andere Komposition (Layout, Farben, Schrift-Hierarchie)
- Bei allen: andere Color Palette

WAS NICHT ÄNDERN:
- Texte (Headline/Body/CTA wörtlich in Anführungszeichen einbauen)
- Mechanic / Format
- PKV-Anchor prominent

Antworte mit GENAU EINEM <image_prompt>-Block, KEINE anderen Tags:

<image_prompt>
Englischer gpt-image-1-Prompt mit deutschen Text-Overlays in Anführungszeichen.
</image_prompt>`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: CREATIVE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Image-Regen ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const imagePrompt = extractTag(text, "image_prompt");
  if (!imagePrompt) {
    throw new Error(`Image-Regen lieferte kein <image_prompt>: ${text.slice(0, 300)}`);
  }

  const { buffer, contentType } = await generateOpenAIImage({
    prompt: imagePrompt,
    size: "1024x1024",
    quality: "high",
    format: "jpeg",
  });
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const key = `creatives/${requestId}/regen-${Date.now()}.${ext}`;
  const imageUrl = await uploadImageToR2({
    buffer,
    key,
    contentType,
  });
  return { imageUrl, imagePrompt };
}

// ─── Intent Parsing aus Telegram-Text ────────────────────────────────

export type ParsedIntent = {
  action: "generate" | "unknown";
  count: number;
  campaignKey: string | null;
  audience?: string;
  tone?: string;
};

export async function parseIntent(text: string): Promise<ParsedIntent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: `Du parsed deutsche Befehle für einen Creative-Generation-Bot.
Erkennbare Kampagnen: "Wechsel", "Neugeschäft".
Antworte mit strict JSON: {"action": "generate"|"unknown", "count": number, "campaignKey": "Wechsel"|"Neugeschäft"|null, "audience"?: string, "tone"?: string}`,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!res.ok) {
    return { action: "unknown", count: 0, campaignKey: null };
  }
  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  const raw = data.content.find((c) => c.type === "text")?.text ?? "";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as ParsedIntent;
  } catch {
    return { action: "unknown", count: 0, campaignKey: null };
  }
}
