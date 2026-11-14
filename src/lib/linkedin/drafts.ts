// LinkedIn-Entwürfe (Ole, 14.11.2026): Die KI schaut sich an, welche Posts die meiste
// Reichweite hatten, und schreibt neue Entwürfe, die den besten Post schlagen sollen.
// Jeder Entwurf testet genau eine Idee (Hypothese); das Ergebnis fließt in die nächsten ein.

import { prisma } from "@/lib/prisma";
import { claudeCall, runAgent, type LlmCall } from "@/lib/kampagnen/llm";
import type { Valid } from "@/lib/kampagnen/types";
import { sendToAdmins } from "@/lib/push";
import { getSettings, liftLabel, liftOf, postingDays, scoreOf, slotTimes, type Scored } from "@/lib/linkedin/posts";
import type { LinkedInPost } from "@/generated/prisma/client";
import { postText } from "@/lib/linkedin/text";
import { loadTrustFacts } from "@/lib/linkedin/trust";
import { createAiImage, type ImageGenerator, type ImageStyle } from "@/lib/linkedin/ai-image";

const DAY = 86_400_000;

/** Bild zum Post: eigenes Foto, KI-Foto (fotorealistisch), Text-Grafik oder keins. */
export type ImageKind = "foto" | "ki" | "grafik" | "keins";
export type Draft = { idea: string; hypothesis: string; text: string; image: ImageKind; photoId: string | null; imagePrompt: string; imageStyle: ImageStyle; graphic: string };
export type PhotoInfo = { id: string; description: string; lastUsed: Date | null };

export const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["idea", "hypothesis", "text", "image", "photoId", "imagePrompt", "imageStyle", "graphic"],
        properties: {
          idea: { type: "string", description: "Thema in wenigen Worten" },
          hypothesis: { type: "string", description: "Was dieser Post gegenüber dem bisher besten anders macht und warum das mehr Zielgruppen-Reichweite bringen soll (ein Satz)" },
          text: { type: "string", description: "Fertiger Post-Text, genau so wie er auf LinkedIn erscheinen soll" },
          image: { type: "string", enum: ["foto", "ki", "grafik", "keins"], description: "foto = Foto aus der Fotoablage, ki = fotorealistisches KI-Bild, grafik = Text-Grafik mit Kernaussage, keins = ohne Bild" },
          photoId: { type: "string", description: "Bei image=foto: ID aus der Fotoablage, sonst leer" },
          imagePrompt: { type: "string", description: "Immer ausfüllen: englische Bildbeschreibung einer fotorealistischen, emotionalen Szene passend zum Post (Personen, Ort, Licht, Stimmung)" },
          imageStyle: { type: "string", enum: ["foto", "illustration"], description: "Stil des KI-Bilds: meist foto (fotorealistisch), etwa jedes vierte Bild illustration (Zeichnung), wenn es zur Geschichte passt" },
          graphic: { type: "string", description: "Immer ausfüllen: Kernaussage für die Ersatz-Grafik (max. 90 Zeichen, ohne Gedankenstriche)" },
        },
      },
    },
  },
} as const;

export function validateDrafts(x: unknown, n: number, photoIds: string[] = []): Valid<Draft[]> {
  const posts = (x as { posts?: unknown })?.posts;
  if (!Array.isArray(posts)) return { ok: false, errors: ["posts fehlt"] };
  const errors: string[] = [];
  const out: Draft[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  for (const [i, p] of posts.entries()) {
    const d = p as Record<string, unknown>;
    let image = (["foto", "ki", "grafik", "keins"].includes(str(d.image)) ? str(d.image) : "keins") as ImageKind;
    const photoId = str(d.photoId) || null;
    if (image === "foto" && (!photoId || !photoIds.includes(photoId))) errors.push(`Post ${i + 1}: Foto-ID ${photoId ?? "(leer)"} gibt es nicht. Eine ID aus der Fotoablage nehmen oder image=ki/grafik/keins.`);
    const text = postText(str(d.text));
    const hypothesis = str(d.hypothesis);
    const idea = str(d.idea);
    const imagePrompt = str(d.imagePrompt).slice(0, 800);
    const graphic = postText(str(d.graphic)).slice(0, 120);
    if (image === "ki" && imagePrompt.length < 20) errors.push(`Post ${i + 1}: imagePrompt für das KI-Bild fehlt`);
    if ((image === "grafik" || image === "ki") && !graphic) errors.push(`Post ${i + 1}: graphic (Kernaussage für die Ersatz-Grafik) fehlt`);
    if (text.length < 150) errors.push(`Post ${i + 1}: Text zu kurz (mind. 150 Zeichen)`);
    if (text.length > 2900) errors.push(`Post ${i + 1}: Text zu lang (höchstens 2.900 Zeichen)`);
    if (!hypothesis) errors.push(`Post ${i + 1}: Hypothese fehlt`);
    if (image !== "foto" && image !== "ki" && image !== "grafik") image = "keins";
    // Ole (14.11.2026): fotorealistische Bilder statt Grafiken – Grafik nur als Ersatz
    if (image === "grafik" && imagePrompt.length >= 20) image = "ki";
    const imageStyle: ImageStyle = str(d.imageStyle) === "illustration" ? "illustration" : "foto";
    out.push({ idea: idea.slice(0, 120), hypothesis: hypothesis.slice(0, 300), text, image, photoId: image === "foto" ? photoId : null, imagePrompt, imageStyle, graphic });
  }
  if (out.length !== n) errors.push(`Genau ${n} Posts schreiben (geliefert: ${out.length})`);
  const firsts = out.map((d) => d.text.slice(0, 60).toLowerCase());
  if (new Set(firsts).size !== firsts.length) errors.push("Jeder Post braucht einen eigenen Einstieg");
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

type PostRow = Pick<LinkedInPost, "id" | "text" | "hypothesis" | "impressions" | "reactions" | "comments" | "reposts" | "publishedAt" | "status" | "photoId" | "icpShare">;

const when = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d) : "–";
const pct = (x: number) => `${Math.round(x * 100)} %`;

function block(p: PostRow, all: Scored[], share: number | null): string {
  const score = scoreOf(p, share);
  const icp = p.icpShare != null ? `${pct(p.icpShare)} Zielgruppe` : share != null ? `Zielgruppe ~${pct(share)} (Profil-Schnitt)` : "Zielgruppe unbekannt";
  return [
    `— ${when(p.publishedAt)} · Zielgruppen-Reichweite ${score ?? "?"} (${p.impressions ?? "?"} Impressionen, ${icp}) · ${p.reactions ?? "?"} Reaktionen · ${p.comments ?? "?"} Kommentare · ${liftLabel(liftOf(p, all, share))}${p.status === "veroeffentlicht" ? (p.photoId ? " · mit Foto" : " · ohne Foto") : ""}`,
    p.text.trim(),
  ].join("\n");
}

function photoBlock(photos: PhotoInfo[], scored: PostRow[], share: number | null): string {
  if (!photos.length) return "## Fotoablage\n(keine Fotos – photoId leer lassen)";
  const app = scored.filter((p) => p.status === "veroeffentlicht" && p.impressions != null);
  const avg = (xs: PostRow[]) => (xs.length ? Math.round(xs.reduce((a, p) => a + scoreOf(p, share)!, 0) / xs.length) : null);
  const withPhoto = avg(app.filter((p) => p.photoId));
  const without = avg(app.filter((p) => !p.photoId));
  const stat = withPhoto != null && without != null ? `\nBisher: mit Foto im Schnitt ${withPhoto}, ohne Foto ${without} Zielgruppen-Reichweite.` : "";
  return `## Fotoablage (ID: Beschreibung · zuletzt genutzt)${stat}\n${photos
    .map((f) => `- ${f.id}: ${f.description || "(ohne Beschreibung)"} · ${f.lastUsed ? when(f.lastUsed) : "noch nie"}`)
    .join("\n")}`;
}

export type PromptInput = {
  about: string;
  icp: string;
  accountIcpShare: number | null;
  n: number;
  slots: Date[];
  posts: PostRow[];
  recent: string[];
  photos?: PhotoInfo[];
  /** Echte Zahlen aus der Software (ohne Namen) */
  trustFacts?: string[];
  /** Trust-Material von Ole (Kundenstimmen mit Freigabe, Erfolge) */
  trustNotes?: string;
};

/** Prompt aus den bisherigen Posts (exportiert für Tests). */
export function buildDraftPrompt(input: PromptInput): { system: string; user: string } {
  const share = input.accountIcpShare;
  const scored = input.posts.filter((p) => p.impressions != null && p.publishedAt);
  const withText = scored.filter((p) => p.text.trim().length > 0);
  const byScore = (a: PostRow, b: PostRow) => scoreOf(b, share)! - scoreOf(a, share)!;
  const top = [...withText].sort(byScore).slice(0, 5);
  const flop = [...withText].sort(byScore).reverse().slice(0, 3).filter((p) => !top.includes(p));
  const tests = scored
    .filter((p) => p.hypothesis)
    .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
    .slice(0, 20)
    .map((p) => `- ${p.hypothesis} → ${liftLabel(liftOf(p, scored, share))} (${scoreOf(p, share)} Zielgruppen-Reichweite)`);
  const best = top[0];

  const system = [
    "Du schreibst LinkedIn-Posts für das persönliche Profil des Gründers (Ich-Form, Deutsch, Du- oder Sie-Ansprache wie in seinen bisherigen Posts).",
    "Ziel ist NICHT Reichweite insgesamt, sondern Reichweite in seiner Zielgruppe (siehe „Zielgruppe“): Menschen, die er als Kunden gewinnen will. Gemessen wird „Zielgruppen-Reichweite“ = Impressionen × Anteil der Zielgruppe an den Zuschauern.",
    "Ein Post mit 30.000 Impressionen bei Coaches und Recruitern ist schlechter als einer mit 3.000 Impressionen bei Versicherungsvermittlern. Schreibe deshalb keine allgemeinen Motivations-, Karriere- oder Gründer-Posts ohne klaren Bezug zum Arbeitsalltag der Zielgruppe (Neukunden, Leads, Termine, Abschlussquote, Vertrieb, Digitalisierung im Vertrieb, Zeit für Beratung).",
    "Arbeitsweise: Lies, was bei ihm in der Zielgruppe funktioniert hat und was nicht. Jeder neue Post nimmt das Erfolgsrezept des besten Posts und verändert genau EINE Sache (z. B. Einstieg, Länge, Format, Thema, Perspektive, Schluss-Frage). Diese Veränderung ist die Hypothese.",
    "Die Posts eines Tages testen verschiedene Hypothesen. Was in früheren Tests verloren hat, nicht wiederholen; was gewonnen hat, weiter ausbauen.",
    "LinkedIn-Handwerk (so schreibt er in seinen besten Posts): Die ersten zwei Zeilen entscheiden (vor „mehr anzeigen“) und zeigen sofort, dass es um Versicherungsvermittler geht. Sehr kurze Absätze, oft nur ein Satz, mit Leerzeile dazwischen. Konkrete Zahlen und Fälle statt Allgemeinplätzen. Rechnungen gern mit Pfeilen (100 Leads → 12 Abschlüsse → 4.300 € Nettoprämie). Am Ende eine echte Frage an die Vermittler und oft eine Einladung zur Direktnachricht („Schreib mir eine DM.“). Höchstens 1 bis 2 Emojis, keine Links im Text.",
    "Verboten: Gedankenstriche (– oder —); stattdessen Punkt, Komma, Doppelpunkt oder neuer Absatz. Keine Hashtags.",
    "Keine Wiederholungen: Von den besten Posts lernst du Stil, Aufbau und Art der Belege, nicht den Inhalt. Ein Case, der schon gepostet wurde (siehe bisherige Posts, oder im Trust-Material als „schon gepostet“ markiert), darf nur mit einem klar neuen Blickwinkel vorkommen (z. B. was danach passiert ist), nie mit demselben Einstieg, derselben Rechnung oder demselben Bild.",
    "Formate, die bei ihm funktionieren: (1) Trust-Post mit echtem Kunden-Case und Zahlen (sein bester Post), (2) „Stell dir vor:“-Geschichte aus dem Alltag eines Vermittlers oder seiner Kunden mit emotionaler Wendung und Schluss-Frage. Trust-Posts nur mit Fakten aus „Trust-Fakten“ oder „Trust-Material“.",
    "Wahrheit: Erfinde keine Zahlen, Kundennamen, Zitate, Erlebnisse oder Ergebnisse. Nutze nur, was in „Über mich“, „Zielgruppe“ oder seinen bisherigen Posts steht. Wo eine konkrete Zahl fehlt, formuliere ohne Zahl.",
    "Keine Versprechen über Ergebnisse für Kunden, keine Aussagen über Mitbewerber oder einzelne Versicherer.",
    "Bilder (image): Jeder Post bekommt ein Bild. Passt ein Foto aus der Fotoablage (Fotos von ihm oder Beweis-Screenshots), nimm es (image=foto, kein Foto zweimal am selben Tag, kürzlich genutzte meiden; der Text darf das Foto nur so beschreiben, wie es in der Beschreibung steht). Sonst image=ki mit einer emotionalen Szene passend zur Geschichte: meist fotorealistisch (imageStyle=foto, z. B. Vater mit Sohn am Krankenbett), etwa jedes vierte Bild als Illustration oder Zeichnung (imageStyle=illustration, z. B. Kinderzeichnung „Unser Zuhause“), wenn es zur Geschichte passt. Kein Text im Bild, keine echten Personen, Marken oder Logos. Wähle image=grafik nicht selbst; die Text-Grafik ist nur der Ersatz, falls das KI-Bild nicht erzeugt werden kann. Fülle imagePrompt und graphic deshalb immer aus.",
    "Antworte nur mit JSON im vorgegebenen Format.",
  ].join("\n");

  const user = [
    `## Zielgruppe (für sie schreiben)\n${input.icp.trim() || "Versicherungsvermittler (Vertreter und Makler)"}`,
    `## Über mich\n${input.about.trim() || "(noch nichts hinterlegt)"}`,
    share != null ? `Über das ganze Profil gehören etwa ${pct(share)} der Zuschauer zur Zielgruppe.` : "",
    best
      ? `## Zu schlagen: bester Post in der Zielgruppe (${scoreOf(best, share)} Zielgruppen-Reichweite)\n${block(best, scored, share)}`
      : "## Noch keine Zahlen\nEs gibt noch keine ausgewerteten Posts. Teste deshalb bewusst unterschiedliche Formate (Geschichte, Liste, Meinung, Frage, Vorher/Nachher) zu Themen der Zielgruppe, damit wir schnell lernen.",
    top.length > 1 ? `## Weitere starke Posts\n${top.slice(1).map((p) => block(p, scored, share)).join("\n\n")}` : "",
    flop.length ? `## Schwache Posts (daraus lernen)\n${flop.map((p) => block(p, scored, share)).join("\n\n")}` : "",
    tests.length ? `## Bisherige Tests (Hypothese → Ergebnis gegenüber üblicher Zielgruppen-Reichweite)\n${tests.join("\n")}` : "",
    input.recent.length ? `## Bisherige Posts und Entwürfe (Einstiege; nichts davon wiederholen)\n${input.recent.map((t) => `- ${t.replace(/\s+/g, " ").slice(0, 160)}`).join("\n")}` : "",
    input.trustFacts?.length ? `## Trust-Fakten aus der Software (echt, zusammengefasst, ohne Kundennamen)\n${input.trustFacts.map((f) => `- ${f}`).join("\n")}` : "",
    input.trustNotes?.trim()
      ? `## Trust-Material von ihm (nur das darf als Kunden-Case, Zitat oder Erfolg verwendet werden; Namen nur, wenn hier ausdrücklich freigegeben)\n${input.trustNotes.trim()}`
      : "",
    photoBlock(input.photos ?? [], scored, share),
    `## Aufgabe\nSchreibe genau ${input.n} Posts für ${input.slots.map((s) => when(s)).join(", ")} (in dieser Reihenfolge). Jeder mit eigener Hypothese.${input.n >= 2 && (input.trustFacts?.length || input.trustNotes?.trim()) ? " Mindestens einer davon ist ein Trust-Post." : ""}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user };
}

/**
 * Entwürfe für einen Tag schreiben (fehlende Uhrzeiten auffüllen). Idempotent je Tag.
 * Gibt die Zahl neuer Entwürfe zurück.
 */
export async function generateDrafts(day: string, opts: { llm?: LlmCall; now?: Date; push?: boolean; imageGen?: ImageGenerator } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const settings = await getSettings();
  const slots = slotTimes(settings, day);
  if (!slots.length) return 0;
  // Verworfene Entwürfe geben ihre Uhrzeit frei (Ole hatte gelöscht → „alle Uhrzeiten belegt“)
  const existing = await prisma.linkedInPost.findMany({ where: { draftDate: day, status: { not: "verworfen" } }, select: { scheduledAt: true } });
  const usedMs = new Set(existing.map((e) => e.scheduledAt?.getTime()));
  const free = slots.filter((s) => !usedMs.has(s.getTime()));
  if (!free.length) return 0;

  const posts = await prisma.linkedInPost.findMany({
    where: { status: { in: ["veroeffentlicht", "importiert"] }, publishedAt: { gte: new Date(now.getTime() - 180 * DAY) } },
    select: { id: true, text: true, hypothesis: true, impressions: true, reactions: true, comments: true, reposts: true, publishedAt: true, status: true, photoId: true, icpShare: true },
  });
  // Nicht wiederholen: Entwürfe der letzten 3 Wochen + alle Posts der letzten 6 Monate (auch ältere, importierte)
  const recentRows = await prisma.linkedInPost.findMany({
    where: {
      text: { not: "" },
      OR: [{ createdAt: { gte: new Date(now.getTime() - 21 * DAY) } }, { status: { in: ["veroeffentlicht", "importiert", "freigegeben"] }, publishedAt: { gte: new Date(now.getTime() - 180 * DAY) } }],
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { text: true },
  });
  const recent = [...new Set(recentRows.map((r) => r.text.replace(/\s+/g, " ").slice(0, 160)))];

  // Fotos/Screenshots, die in den letzten 90 Tagen schon in einem veröffentlichten Post waren, nicht erneut vorschlagen
  const photoRows = await prisma.linkedInPhoto.findMany({
    where: { generated: false, NOT: { posts: { some: { status: { in: ["veroeffentlicht", "freigegeben", "sendet"] }, scheduledAt: { gte: new Date(now.getTime() - 90 * DAY) } } } } },
    orderBy: { createdAt: "asc" },
    take: 60,
    select: { id: true, description: true, posts: { orderBy: { scheduledAt: "desc" }, take: 1, select: { scheduledAt: true } } },
  });
  const photos: PhotoInfo[] = photoRows.map((f) => ({ id: f.id, description: f.description, lastUsed: f.posts[0]?.scheduledAt ?? null }));
  const trustFacts = await loadTrustFacts(now).catch(() => []);
  const { system, user } = buildDraftPrompt({
    about: settings.about,
    icp: settings.icp,
    accountIcpShare: settings.accountIcpShare,
    n: free.length,
    slots: free,
    posts,
    recent,
    photos,
    trustFacts,
    trustNotes: settings.trustNotes,
  });
  const { value } = await runAgent(opts.llm ?? claudeCall, { agent: "linkedin", system, user, schema: DRAFT_SCHEMA as unknown as Record<string, unknown>, maxTokens: 24000 }, (x) =>
    validateDrafts(x, free.length, photos.map((f) => f.id)),
  );
  // KI-Bilder erzeugen (nacheinander); klappt das nicht, wird die Text-Grafik genommen
  for (const [i, d] of value.entries()) {
    let photoId = d.photoId;
    let useGraphic = d.image === "grafik";
    if (d.image === "ki") {
      photoId = await createAiImage(d.imagePrompt, opts.imageGen, d.imageStyle).catch(() => null);
      if (!photoId) useGraphic = !!d.graphic;
    }
    await prisma.linkedInPost.create({
      data: {
        status: "entwurf",
        text: d.text,
        idea: d.idea || null,
        hypothesis: d.hypothesis,
        draftDate: day,
        scheduledAt: free[i],
        photoId,
        graphic: d.graphic || null,
        useGraphic: useGraphic && !photoId,
      },
    });
  }
  if (opts.push !== false) {
    const label = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long" }).format(free[0]);
    await sendToAdmins({
      title: `LinkedIn: ${value.length} Entwürfe für ${label}`,
      body: "Antippen, lesen und mit einem Klick freigeben.",
      url: "/admin/marketing/linkedin",
      tag: "linkedin-drafts",
    }).catch(() => null);
  }
  return value.length;
}

/** Cron: ab der eingestellten Uhrzeit Entwürfe für die Posting-Tage im Vorlauf schreiben (je Lauf ein Tag). */
export async function maybeGenerateDrafts(now: Date, llm?: LlmCall): Promise<number> {
  const settings = await getSettings();
  if (!settings.autoDrafts || !settings.about.trim() || !process.env.ANTHROPIC_API_KEY) return 0;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < settings.draftHour) return 0;
  // Vorlauf: erster Posting-Tag im Fenster, für den noch gar nichts geschrieben wurde (je Lauf ein Tag)
  const window = postingDays(settings, now, Math.max(1, Math.min(14, settings.planDays)));
  const counts = await prisma.linkedInPost.groupBy({ by: ["draftDate"], where: { draftDate: { in: window } }, _count: true });
  const done = new Set(counts.map((c) => c.draftDate));
  const day = window.find((d) => !done.has(d));
  if (!day) return 0;
  // Sperre: nur ein Lauf gleichzeitig (abgelaufen nach 15 Minuten)
  const lock = await prisma.linkedInSettings.updateMany({
    where: { id: "default", OR: [{ draftingAt: null }, { draftingAt: { lt: new Date(now.getTime() - 15 * 60_000) } }] },
    data: { draftingAt: now },
  });
  if (!lock.count) return 0;
  try {
    const n = await generateDrafts(day, { llm, now });
    await prisma.linkedInSettings.update({ where: { id: "default" }, data: { draftingAt: null } });
    return n;
  } catch (e) {
    // Fehler: Sperre 1 Stunde halten, damit nicht alle 5 Minuten neu (und kostenpflichtig) versucht wird
    await prisma.linkedInSettings.update({ where: { id: "default" }, data: { draftingAt: new Date(now.getTime() + 45 * 60_000) } });
    throw e;
  }
}
