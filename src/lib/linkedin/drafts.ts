// LinkedIn-Entwürfe (Ole, 14.11.2026): Die KI schaut sich an, welche Posts die meiste
// Reichweite hatten, und schreibt neue Entwürfe, die den besten Post schlagen sollen.
// Jeder Entwurf testet genau eine Idee (Hypothese); das Ergebnis fließt in die nächsten ein.

import { prisma } from "@/lib/prisma";
import { claudeCall, runAgent, type LlmCall } from "@/lib/kampagnen/llm";
import type { Valid } from "@/lib/kampagnen/types";
import { sendToAdmins } from "@/lib/push";
import { getSettings, liftLabel, liftOf, nextPostingDay, scoreOf, slotTimes, type Scored } from "@/lib/linkedin/posts";
import type { LinkedInPost } from "@/generated/prisma/client";

const DAY = 86_400_000;

export type Draft = { idea: string; hypothesis: string; text: string; photoId: string | null };
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
        required: ["idea", "hypothesis", "text", "photoId"],
        properties: {
          idea: { type: "string", description: "Thema in wenigen Worten" },
          hypothesis: { type: "string", description: "Was dieser Post gegenüber dem bisher besten anders macht und warum das mehr Reichweite bringen soll (ein Satz)" },
          text: { type: "string", description: "Fertiger Post-Text, genau so wie er auf LinkedIn erscheinen soll" },
          photoId: { type: "string", description: "ID eines Fotos aus der Fotoablage, das zum Post passt, oder leer für einen Post ohne Foto" },
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
  for (const [i, p] of posts.entries()) {
    const d = p as Partial<Omit<Draft, "photoId">> & { photoId?: unknown };
    const photoId = typeof d.photoId === "string" && d.photoId.trim() ? d.photoId.trim() : null;
    if (photoId && !photoIds.includes(photoId)) errors.push(`Post ${i + 1}: Foto-ID ${photoId} gibt es nicht (leer lassen oder eine ID aus der Fotoablage)`);
    const text = typeof d.text === "string" ? d.text.trim() : "";
    const hypothesis = typeof d.hypothesis === "string" ? d.hypothesis.trim() : "";
    const idea = typeof d.idea === "string" ? d.idea.trim() : "";
    if (text.length < 150) errors.push(`Post ${i + 1}: Text zu kurz (mind. 150 Zeichen)`);
    if (text.length > 2900) errors.push(`Post ${i + 1}: Text zu lang (höchstens 2.900 Zeichen)`);
    if (!hypothesis) errors.push(`Post ${i + 1}: Hypothese fehlt`);
    out.push({ idea: idea.slice(0, 120), hypothesis: hypothesis.slice(0, 300), text, photoId });
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
    "LinkedIn-Handwerk: Die ersten zwei Zeilen entscheiden (vor „mehr anzeigen“) und sollen sofort zeigen, dass der Post für Versicherungsvermittler ist. Kurze Absätze, Leerzeilen, keine Links im Text (kosten Reichweite), höchstens 3 Hashtags am Ende, keine Emoji-Flut.",
    "Wahrheit: Erfinde keine Zahlen, Kundennamen, Zitate, Erlebnisse oder Ergebnisse. Nutze nur, was in „Über mich“, „Zielgruppe“ oder seinen bisherigen Posts steht. Wo eine konkrete Zahl fehlt, formuliere ohne Zahl.",
    "Keine Versprechen über Ergebnisse für Kunden, keine Aussagen über Mitbewerber oder einzelne Versicherer.",
    "Fotos: Gibt es eine Fotoablage, wähle je Post das Foto, das inhaltlich am besten passt (photoId), oder bewusst keins. Kein Foto zweimal am selben Tag, kürzlich genutzte Fotos meiden. Der Text darf das Foto nur so beschreiben, wie es in der Beschreibung steht.",
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
    input.recent.length ? `## Zuletzt geschrieben (nicht wiederholen)\n${input.recent.map((t) => `- ${t.replace(/\s+/g, " ").slice(0, 160)}`).join("\n")}` : "",
    photoBlock(input.photos ?? [], scored, share),
    `## Aufgabe\nSchreibe genau ${input.n} Posts für ${input.slots.map((s) => when(s)).join(", ")} (in dieser Reihenfolge). Jeder mit eigener Hypothese.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user };
}

/**
 * Entwürfe für einen Tag schreiben (fehlende Uhrzeiten auffüllen). Idempotent je Tag.
 * Gibt die Zahl neuer Entwürfe zurück.
 */
export async function generateDrafts(day: string, opts: { llm?: LlmCall; now?: Date; push?: boolean } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const settings = await getSettings();
  const slots = slotTimes(settings, day);
  if (!slots.length) return 0;
  const existing = await prisma.linkedInPost.findMany({ where: { draftDate: day }, select: { scheduledAt: true } });
  const usedMs = new Set(existing.map((e) => e.scheduledAt?.getTime()));
  const free = slots.filter((s) => !usedMs.has(s.getTime()));
  if (!free.length) return 0;

  const posts = await prisma.linkedInPost.findMany({
    where: { status: { in: ["veroeffentlicht", "importiert"] }, publishedAt: { gte: new Date(now.getTime() - 180 * DAY) } },
    select: { id: true, text: true, hypothesis: true, impressions: true, reactions: true, comments: true, reposts: true, publishedAt: true, status: true, photoId: true, icpShare: true },
  });
  const recent = (
    await prisma.linkedInPost.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 21 * DAY) }, text: { not: "" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { text: true },
    })
  ).map((r) => r.text);

  const photoRows = await prisma.linkedInPhoto.findMany({
    orderBy: { createdAt: "asc" },
    take: 60,
    select: { id: true, description: true, posts: { orderBy: { scheduledAt: "desc" }, take: 1, select: { scheduledAt: true } } },
  });
  const photos: PhotoInfo[] = photoRows.map((f) => ({ id: f.id, description: f.description, lastUsed: f.posts[0]?.scheduledAt ?? null }));
  const { system, user } = buildDraftPrompt({ about: settings.about, icp: settings.icp, accountIcpShare: settings.accountIcpShare, n: free.length, slots: free, posts, recent, photos });
  const { value } = await runAgent(opts.llm ?? claudeCall, { agent: "linkedin", system, user, schema: DRAFT_SCHEMA as unknown as Record<string, unknown>, maxTokens: 24000 }, (x) =>
    validateDrafts(x, free.length, photos.map((f) => f.id)),
  );
  await prisma.linkedInPost.createMany({
    data: value.map((d, i) => ({ status: "entwurf", text: d.text, idea: d.idea || null, hypothesis: d.hypothesis, draftDate: day, scheduledAt: free[i], photoId: d.photoId })),
  });
  if (opts.push !== false) {
    const label = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long" }).format(free[0]);
    await sendToAdmins({
      title: `LinkedIn: ${value.length} Entwürfe für ${label}`,
      body: "Antippen, lesen und mit einem Klick freigeben.",
      url: "/admin/vertrieb/linkedin",
      tag: "linkedin-drafts",
    }).catch(() => null);
  }
  return value.length;
}

/** Cron: Entwürfe ab der eingestellten Uhrzeit für den nächsten Posting-Tag schreiben. */
export async function maybeGenerateDrafts(now: Date, llm?: LlmCall): Promise<number> {
  const settings = await getSettings();
  if (!settings.autoDrafts || !settings.about.trim() || !process.env.ANTHROPIC_API_KEY) return 0;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < settings.draftHour) return 0;
  const day = nextPostingDay(settings, now);
  if (await prisma.linkedInPost.count({ where: { draftDate: day } })) return 0;
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
