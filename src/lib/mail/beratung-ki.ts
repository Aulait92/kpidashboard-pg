// Gesprächszusammenfassung „Mit KI formulieren“ (Paket M5, Ole 18.11.2026; Entscheidung: KI-Zusammenfassung als
// gekennzeichneter Entwurf über die EU-KI, docs/plan-lead-verlauf.md). Nur mit EU-Zugang (lib/ki-eu.ts, Bedrock
// Frankfurt); ohne Zugang gibt es den Knopf nicht. Die KI formuliert nur den Entwurf ohne KI (lib/mail/beratung.ts
// zusammenfassungEntwurf) bzw. den Text im Editor um, sie bekommt keine Formular- oder Chat-Rohdaten und nie
// Policen oder andere Dokumente.
//
// Grenzen:
//   - Gesundheitsangaben einer Person gehen nie an die KI: Eingabe gefiltert (ohneGesundheitsangaben); bei
//     Gesundheitssparten (Kranken, Zahn, BU, Leben, Pflege …) gibt es den Knopf gar nicht. Eine Einwilligung des Leads,
//     die die KI-Verarbeitung von Gesundheitsangaben abdeckt, gibt es derzeit nicht (die Policen-Einwilligung gilt nur
//     für die Ablage), also im Zweifel aus.
//   - Wie beim Assistenten (lib/whatsapp/beratungs-sperre.ts): keine eigenen Beträge, Prozente, Versicherer,
//     Vergleiche oder Empfehlungen. Die Antwort wird geprüft (kiErgebnisPruefen); ergänzt die KI so etwas, wird der
//     Entwurf verworfen. Stellen zum Ergänzen („[bitte ergänzen]“, die Gründe) bleiben stehen.
//   - Das Ergebnis ist ein Entwurf: im Blatt als „Entwurf der KI, bitte prüfen“ gekennzeichnet, Senden und Ablegen
//     erst nach dem Ansehen.

import { angebotOhneGesundheitsdaten, istGesundheitsSparte } from "@/lib/angebote";
import { a, type Ansprache } from "@/lib/ansprache";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { ohneGesundheitsangaben, redactHealthText, HEALTH_REDACTED } from "@/lib/gesundheitsdaten";
import { bedrockEu, type BedrockEu } from "@/lib/ki-eu-konfig";
import { GRUENDE_ERGAENZEN } from "@/lib/mail/beratung";
import { VERSICHERER, beratungsTreffer } from "@/lib/whatsapp/beratungs-sperre";

export type KiStatus = { moeglich: boolean; grund: "nicht_eingerichtet" | "gesundheit" | null };

/**
 * Darf „Mit KI formulieren“ erscheinen? Nur mit EU-Zugang und nicht bei Gesundheitssparten. Im Zweifel aus: ohne
 * gewählte Tarife zählt das Produkt des Leads, und nur Produkte, die sicher ohne Gesundheitsangaben sind
 * (Privatschutz, Sach, Tier …), sind erlaubt. gesundheitsEinwilligungKi: Einwilligung des Leads, die die KI abdeckt
 * (gibt es derzeit nicht, deshalb immer false).
 */
export function kiZusammenfassungStatus(o: { konfig: BedrockEu | null; produkt: string | null; sparten: string[]; gesundheitsEinwilligungKi?: boolean }): KiStatus {
  if (!o.konfig) return { moeglich: false, grund: "nicht_eingerichtet" };
  const gesundheit =
    istGesundheitsSparte(o.produkt) || o.sparten.some((s) => istGesundheitsSparte(s)) || (!o.sparten.length && !angebotOhneGesundheitsdaten(o.produkt));
  if (gesundheit && !o.gesundheitsEinwilligungKi) return { moeglich: false, grund: "gesundheit" };
  return { moeglich: true, grund: null };
}

/** Text für die KI: Gesundheitsangaben einer Person weg (auch Platzhalter-Sätze), höchstens 6.000 Zeichen. */
export function kiEingabe(t: { wuensche: string; rat: string }, o: { tier?: boolean } = {}): { wuensche: string; rat: string } {
  const sauber = (s: string) =>
    s
      .split("\n")
      // Zeilen, die nur aus Gesundheitsangaben bestanden, fallen ganz weg (auch das „• “); Leerzeilen bleiben
      .flatMap((z) => {
        if (!z.trim()) return [""];
        const t = ohneGesundheitsangaben(redactHealthText(z, o), o).replace(HEALTH_REDACTED, "").trimEnd();
        return t.replace(/^[\s•*]+/, "") ? [t] : [];
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 3000);
  return { wuensche: sauber(t.wuensche), rat: sauber(t.rat) };
}

export function kiSystem(an: Ansprache): string {
  return [
    "Du hilfst einem Versicherungsvermittler, die Zusammenfassung eines Beratungsgesprächs für seinen Kunden klar und freundlich zu formulieren (Beratungsdokumentation nach §§ 61, 62 VVG).",
    `Schreibe in der ${a(an, "Du-Form", "Sie-Form")} an den Kunden, aus Sicht des Vermittlers (ich).`,
    "Regeln:",
    "- Nutze nur, was im Entwurf steht. Erfinde nichts, lass nichts Wichtiges weg.",
    "- Keine eigenen Empfehlungen, Bewertungen, Vergleiche oder Begründungen. Kein „günstiger“, „besser“, „die beste“, kein „ich empfehle“, wenn es nicht wörtlich im Entwurf steht.",
    "- Beträge, Prozente, Versicherer und Tarifnamen nur genau so, wie sie im Entwurf stehen. Keine neuen Zahlen.",
    `- Stellen in eckigen Klammern wie ${GRUENDE_ERGAENZEN} unverändert übernehmen, nicht füllen.`,
    "- Keine Gesundheitsangaben. Keine Gedankenstriche, kein Markdown, keine Überschriften außer den zwei Markierungen.",
    "- Kurze Sätze oder Aufzählungen mit „• “.",
    "Antworte genau in diesem Format:",
    "WÜNSCHE:",
    "<Wünsche und Bedürfnisse>",
    "RAT:",
    "<Rat und Gründe>",
  ].join("\n");
}

/** Antwort der KI in die zwei Teile zerlegen; null, wenn das Format nicht passt. */
export function kiAntwortLesen(text: string): { wuensche: string; rat: string } | null {
  const m = text.replace(/\r\n?/g, "\n").match(/W(?:Ü|UE)NSCHE:\s*\n?([\s\S]*?)\n\s*RAT:\s*\n?([\s\S]*)$/i);
  if (!m) return null;
  const wuensche = m[1].trim();
  const rat = m[2].trim();
  return wuensche || rat ? { wuensche, rat } : null;
}

export const betraege = (t: string) =>
  new Set(
    [...t.matchAll(/\d[\d.,]*\s*(€|euro\b|eur\b|%|prozent\b)/gi)].map((m) => {
      const zahl = m[0].replace(/[^\d,.]/g, "").replace(/[.,]$/, "");
      const einheit = /%|prozent/i.test(m[1]) ? "%" : "€";
      return `${zahl}${einheit}`;
    }),
  );
export const versichererIn = (t: string) => {
  const l = ` ${t.toLowerCase()} `;
  return VERSICHERER.filter((v) => new RegExp(`(^|[^a-zäöüß0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-zäöüß0-9])`).test(l));
};
const anzahl = (t: string, s: string) => t.split(s).length - 1;

/**
 * Prüft die KI-Antwort gegen die Eingabe (Grenzen wie lib/whatsapp/beratungs-sperre.ts): keine neuen Beträge oder
 * Prozente, keine neuen Versicherer, keine Vergleiche oder Empfehlungen, die nicht schon in der Eingabe standen, und
 * alle Stellen zum Ergänzen bleiben. null = in Ordnung, sonst der Grund (Sie-Form, für den Vermittler).
 */
export function kiErgebnisPruefen(eingabe: { wuensche: string; rat: string }, ausgabe: { wuensche: string; rat: string }): string | null {
  const ein = `${eingabe.wuensche}\n${eingabe.rat}`;
  const aus = `${ausgabe.wuensche}\n${ausgabe.rat}`;
  const bekannt = betraege(ein);
  if ([...betraege(aus)].some((b) => !bekannt.has(b))) return "Die KI hat Beträge oder Prozente ergänzt.";
  const vs = new Set(versichererIn(ein));
  if (versichererIn(aus).some((v) => !vs.has(v))) return "Die KI hat einen Versicherer ergänzt.";
  const vorher = new Set(beratungsTreffer(ein));
  if (beratungsTreffer(aus).some((t) => (t === "vergleich" || t === "eignung") && !vorher.has(t))) return "Die KI hat eine Bewertung oder Empfehlung ergänzt.";
  if (anzahl(aus, GRUENDE_ERGAENZEN) < anzahl(ein, GRUENDE_ERGAENZEN)) return "Die KI hat eine Stelle zum Ergänzen gefüllt.";
  return null;
}

export type MessagesClient = { messages: { create: (body: Record<string, unknown>) => Promise<{ content: { type: string; text?: string }[] }> } };

export type KiErgebnis = { ok: true; wuensche: string; rat: string } | { ok: false; error: string };

/** Entwurf über die EU-KI umformulieren (wirft nicht). client nur für Tests. */
export async function kiZusammenfassung(
  entwurf: { wuensche: string; rat: string },
  o: { an: Ansprache; tier?: boolean; konfig?: BedrockEu | null; client?: MessagesClient },
): Promise<KiErgebnis> {
  const konfig = o.konfig === undefined ? bedrockEu() : o.konfig;
  if (!konfig) return { ok: false, error: "Die KI ist nicht eingerichtet." };
  const ein = kiEingabe(entwurf, { tier: o.tier });
  if (!ein.wuensche && !ein.rat) return { ok: false, error: "Es gibt noch nichts zum Formulieren." };
  try {
    const client = o.client ?? ((await import("@/lib/ki-eu")).bedrockClient(konfig) as unknown as MessagesClient);
    const resp = await client.messages.create({
      model: konfig.model,
      max_tokens: 1500,
      system: kiSystem(o.an),
      messages: [{ role: "user", content: `Entwurf:\nWÜNSCHE:\n${ein.wuensche}\nRAT:\n${ein.rat}` }],
    });
    const text = resp.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join("");
    const teile = kiAntwortLesen(text);
    if (!teile) return { ok: false, error: "Die KI hat nicht passend geantwortet. Bitte erneut versuchen." };
    // Zeilenweise filtern (die Aufzählung bleibt erhalten)
    const sauber = (t: string) => ohneGedankenstriche(t.split("\n").map((z) => ohneGesundheitsangaben(z, { tier: o.tier })).join("\n").replace(/\n{3,}/g, "\n\n").trim());
    const aus = { wuensche: sauber(teile.wuensche), rat: sauber(teile.rat) };
    const problem = kiErgebnisPruefen(ein, aus);
    if (problem) return { ok: false, error: `${problem} Der Entwurf bleibt wie er ist.` };
    return { ok: true, ...aus };
  } catch (err) {
    console.error("[beratung-ki]", (err as { status?: number }).status ?? "", (err instanceof Error ? err.message : String(err)).slice(0, 200));
    return { ok: false, error: "Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen." };
  }
}
