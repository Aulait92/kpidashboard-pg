// Antwortmail aus dem Verlauf vorschlagen (Ole, 27.11.2026): Das E-Mail-Fenster der Kontaktakte schaut sich den Verlauf
// an (Einträge, E-Mails, Angebot, Stufe) und schlägt direkt eine passende Antwort vor. Ole prüft und sendet selbst;
// nichts geht automatisch raus. Sie/Du: wie bisher im Verlauf (das Modell erkennt es), oder fest, wenn Ole es umschaltet.

import { prisma } from "@/lib/prisma";
import { claudeCall, runAgent, type LlmCall } from "@/lib/kampagnen/llm";
import { absenderName, crmAnrede } from "@/lib/vertrieb/crm-vorlagen";
import { ACTIVITY_LABEL, STAGE_LABEL } from "@/lib/vertrieb/crm";

export type MailVorschlag = { subject: string; body: string; du: boolean };
type Valid<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const SCHEMA = {
  type: "object",
  properties: { du: { type: "boolean" }, betreff: { type: "string" }, text: { type: "string" } },
  required: ["du", "betreff", "text"],
  additionalProperties: false,
};

const kurz = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+\n/g, "\n").trim();
  return t.length > n ? `${t.slice(0, n)} …` : t;
};
const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

/** Verlauf als Text für das Modell (neueste zuerst), ohne IDs. */
export function verlaufText(x: {
  activities: { type: string; outcome: string | null; note: string | null; occurredAt: Date }[];
  emails: { direction: string; subject: string | null; text: string | null; sentAt: Date; isAutoReply: boolean }[];
}): string {
  const eintraege = [
    ...x.activities.map((a) => ({ at: a.occurredAt, t: `${datum(a.occurredAt)} ${ACTIVITY_LABEL[a.type as keyof typeof ACTIVITY_LABEL] ?? a.type}${a.outcome ? `: ${a.outcome}` : ""}${a.note ? `\n${kurz(a.note, 1200)}` : ""}` })),
    ...x.emails
      .filter((e) => !e.isAutoReply)
      .map((e) => ({ at: e.sentAt, t: `${datum(e.sentAt)} E-Mail ${e.direction === "OUT" ? "von uns" : "vom Kontakt"}${e.subject ? ` „${kurz(e.subject, 120)}“` : ""}\n${kurz(e.text, 1200)}` })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 14);
  return eintraege.map((e) => e.t).join("\n\n") || "(noch kein Verlauf)";
}

function pruefen(du: boolean | null) {
  return (x: unknown): Valid<{ du: boolean; betreff: string; text: string }> => {
    const o = x as { du?: unknown; betreff?: unknown; text?: unknown };
    const errors: string[] = [];
    const betreff = typeof o?.betreff === "string" ? o.betreff.trim() : "";
    const text = typeof o?.text === "string" ? o.text.trim() : "";
    const alsDu = du ?? o?.du === true;
    if (!betreff || betreff.length > 120) errors.push("betreff fehlt oder ist länger als 120 Zeichen.");
    if (!text || text.length > 1500) errors.push("text fehlt oder ist länger als 1500 Zeichen.");
    if (/garantie/i.test(text)) errors.push("Bitte ohne das Wort Garantie.");
    if (/[[{]/.test(text + betreff)) errors.push("Keine Platzhalter in Klammern.");
    if (!alsDu && /\b(du|dich|dir|dein|deine|deinen|deinem|deiner)\b/i.test(text)) errors.push("Bitte durchgehend Sie-Form.");
    if (alsDu && /\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer)\b/.test(text.replace(/^[^\n]*\n/, ""))) errors.push("Bitte durchgehend Du-Form.");
    return errors.length ? { ok: false, errors } : { ok: true, value: { du: alsDu, betreff, text } };
  };
}

/** Vorschlag für eine Antwortmail an den Kontakt. du = null: Form wie im Verlauf. */
export async function mailVorschlag(
  contactId: string,
  opts: { du: boolean | null; absender: { displayName: string | null; email: string }; llm?: LlmCall; now?: Date },
): Promise<MailVorschlag | null> {
  const c = await prisma.salesContact.findUnique({
    where: { id: contactId },
    select: {
      name: true,
      salutation: true,
      firstName: true,
      lastName: true,
      stage: true,
      nieKontaktierenAt: true,
      art17GeloeschtAt: true,
      activities: { orderBy: { occurredAt: "desc" }, take: 14, select: { type: true, outcome: true, note: true, occurredAt: true } },
      emails: { orderBy: { sentAt: "desc" }, take: 8, select: { direction: true, subject: true, text: true, sentAt: true, isAutoReply: true } },
      offers: { orderBy: { createdAt: "desc" }, take: 3, select: { number: true, status: true, monthlyFee: true, setupFee: true, validUntil: true, isTest: true } },
    },
  });
  if (!c || c.nieKontaktierenAt || c.art17GeloeschtAt) return null;
  const absender = absenderName(opts.absender.displayName, opts.absender.email);
  const anredeSie = crmAnrede(c, false);
  const anredeDu = crmAnrede(c, true);
  const angebote = c.offers
    .filter((o) => !o.isTest)
    .map((o) => `${o.number}: ${o.status}, ${Number(o.setupFee)} € Setup, ${Number(o.monthlyFee)} € im Monat netto${o.validUntil ? `, gültig bis ${datum(o.validUntil).slice(0, 8)}` : ""}`)
    .join("\n");
  const form =
    opts.du === null
      ? `Ansprache: wie bisher im Verlauf (duzt man sich dort, schreib Du-Form mit „${anredeDu},“, sonst Sie-Form mit „${anredeSie},“). Setze "du" entsprechend.`
      : opts.du
        ? `Ansprache: Du-Form, beginne mit „${anredeDu},“. Setze "du": true.`
        : `Ansprache: Sie-Form, beginne mit „${anredeSie},“. Setze "du": false.`;
  const system = `Du schreibst für ${absender} (performancegrowth: Leadgenerierung und Software für Versicherungsvermittler) eine E-Mail an einen Vertriebskontakt. Lies den Verlauf und schreib die eine Mail, die jetzt sinnvoll ist: Antwort auf seine letzte Nachricht bzw. Absage, oder ein freundliches Nachfassen. Respektiere klare Wünsche (z. B. „meld dich im Mai“): dann kurz, wertschätzend bestätigen, ohne Druck und ohne erneutes Verkaufen.

Regeln:
- ${form}
- Natürlich, freundlich, wie von einem Menschen geschrieben. Höchstens 110 Wörter. Kurze Absätze, getrennt durch eine Leerzeile.
- Keine Gedankenstriche (weder „–“ noch „—“), keine Aufzählungen, keine Platzhalter, keine erfundenen Fakten oder Termine.
- Keine Versprechen zu Ergebnissen, nie das Wort „Garantie“. Preise nur, wenn sie im Verlauf oder Angebot stehen.
- Ende mit einem kurzen Gruß und in der letzten Zeile „${absender}“.
- Betreff kurz und konkret, ohne „Re:“.
Antworte nur mit dem JSON-Objekt {"du": true|false, "betreff": "...", "text": "..."}.`;
  const user = [
    `Kontakt: ${c.name}${c.firstName || c.lastName ? ` (${[c.firstName, c.lastName].filter(Boolean).join(" ")})` : ""}`,
    `Stufe: ${STAGE_LABEL[c.stage as keyof typeof STAGE_LABEL] ?? c.stage}`,
    angebote ? `Angebote:\n${angebote}` : "Kein Angebot.",
    `Heute: ${datum(opts.now ?? new Date()).slice(0, 8)}`,
    `Verlauf (neueste zuerst):\n${verlaufText(c)}`,
  ].join("\n\n");
  const { value } = await runAgent(opts.llm ?? claudeCall, { agent: "Vertrieb-Mailvorschlag", system, user, schema: SCHEMA, maxTokens: 2000 }, pruefen(opts.du));
  return { subject: value.betreff, body: value.text, du: value.du };
}
