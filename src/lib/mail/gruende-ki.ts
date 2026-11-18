// „Vorschlag erstellen“ für Rat und Gründe (Ole, 18.11.2026: „Kann die KI Rat und Gründe auch ausfüllen oder zumindest
// per Klick?“). Gleicher Weg wie „Mit KI formulieren“ (lib/mail/beratung-ki.ts): nur die EU-KI (lib/ki-eu.ts, Bedrock
// Frankfurt), ohne Zugang gibt es den Knopf nicht. Der Rat selbst (gewählte Tarife) kommt ohne KI aus der Tarifauswahl;
// die KI schlägt nur die Gründe vor, der Vermittler übernimmt sie mit einem Tipp, kann sie ändern, und gespeichert
// wird erst mit dem normalen Senden bzw. Ablegen.
//
// Grenzen:
//   - Eingabe: gewählte Tarife (Sparte, Versicherer, Tarif, Beitrag, Leistungen aus dem Katalog) und der Text
//     „Wünsche und Bedürfnisse“ aus dem Blatt (Formular, Assistent, bestehende Verträge, „Was hat … schon?“, Notizen),
//     zeilenweise ohne Gesundheitsangaben (kiEingabe). Keine Dokumente, keine PDFs, keine Chat-Rohdaten.
//   - Gesundheitssparten (Kranken, Zahn, BU, Leben, Pflege, Unfall …) oder unklares Thema: strikt, an die KI gehen
//     nur Sparte, Versicherer, Tarif und Beitrag. Kein Wunschtext, keine Leistungen, keine Notizen.
//   - Antwort geprüft wie beim Formulieren: keine neuen Beträge, Prozente oder Versicherer, keine Vergleiche, kein
//     „Garantie“, keine Stellen in eckigen Klammern; Gesundheitsangaben und Gedankenstriche fallen weg.

import { angebotOhneGesundheitsdaten, istGesundheitsSparte } from "@/lib/angebote";
import { a, type Ansprache } from "@/lib/ansprache";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { ohneGesundheitsangaben } from "@/lib/gesundheitsdaten";
import { bedrockEu, type BedrockEu } from "@/lib/ki-eu-konfig";
import { vorschlagGrund, type AuswahlZeile, type VorschlagInfo } from "@/lib/mail/beratung";
import { betraege, kiEingabe, versichererIn, type MessagesClient } from "@/lib/mail/beratung-ki";
import { beratungsTreffer } from "@/lib/whatsapp/beratungs-sperre";

const UNFALL = /unfall/i;

/**
 * Strikt (nur Sparte, Versicherer, Tarif, Beitrag an die KI)? Im Zweifel ja: Gesundheitssparte oder Unfall im Thema,
 * in einer Sparte oder im Tarifnamen, oder ein Thema bzw. eine Sparte, die nicht sicher ohne Gesundheitsangaben ist.
 */
export function vorschlagStrikt(themen: (string | null | undefined)[], auswahl: Pick<AuswahlZeile, "sparte" | "tarif">[]): boolean {
  const namen = [...themen, ...auswahl.map((x) => x.sparte)].map((t) => (t ?? "").trim()).filter(Boolean);
  if (namen.some((t) => istGesundheitsSparte(t) || UNFALL.test(t) || !angebotOhneGesundheitsdaten(t))) return true;
  return auswahl.some((x) => istGesundheitsSparte(x.tarif) || UNFALL.test(x.tarif ?? ""));
}

/** Info fürs Blatt (null = keine EU-KI, kein Knopf). */
export function vorschlagInfo(o: { konfig: BedrockEu | null; themen: (string | null | undefined)[]; auswahl: AuswahlZeile[] }): VorschlagInfo {
  if (!o.konfig) return null;
  return {
    tarif: o.auswahl.length > 0,
    leistungen: o.auswahl.some((x) => (x.leistungen ?? []).some((l) => l.trim())),
    strikt: vorschlagStrikt(o.themen, o.auswahl),
  };
}

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const zeile = (t: string) => t.replace(/\s+/g, " ").trim();

/** Text an die KI. Strikt: nur Sparte, Versicherer, Tarif, Beitrag; sonst auch Leistungen und Wünsche (ohne Gesundheit). */
export function vorschlagEingabe(q: { auswahl: AuswahlZeile[]; wuensche: string; strikt: boolean; tier?: boolean }): string {
  const z: string[] = ["Gewählte Tarife (der Rat):"];
  for (const x of q.auswahl.slice(0, 6)) {
    const name = [x.gesellschaft, x.tarif]
      .map((t) => zeile(t ?? ""))
      .filter(Boolean)
      .join(" ");
    z.push(`• ${zeile(x.sparte)}${name ? `: ${name}` : ""}${x.beitrag != null ? `, ${eur(x.beitrag)} im Monat` : ""}`);
    const l = q.strikt
      ? []
      : (x.leistungen ?? [])
          .map((t) => ohneGesundheitsangaben(zeile(t), { tier: q.tier }))
          .filter(Boolean)
          .slice(0, 6);
    if (l.length) z.push(`  Leistungen: ${l.join(", ")}`);
  }
  if (!q.strikt) {
    const w = kiEingabe({ wuensche: q.wuensche, rat: "" }, { tier: q.tier }).wuensche;
    if (w) z.push("", "Wünsche und Bedürfnisse des Kunden:", w);
  }
  return z.join("\n").slice(0, 4000);
}

export function vorschlagSystem(an: Ansprache, strikt: boolean): string {
  return [
    "Du hilfst einem Versicherungsvermittler, in seiner Beratungsdokumentation (§§ 61, 62 VVG) die Gründe für seinen Rat aufzuschreiben. Der Rat steht fest: die gewählten Tarife in der Eingabe.",
    `Schreibe in der ${a(an, "Du-Form", "Sie-Form")} an den Kunden, aus Sicht des Vermittlers (ich).`,
    "Regeln:",
    strikt
      ? "- Es gibt nur Sparte, Versicherer, Tarif und Beitrag. Schreibe höchstens 2 kurze, sachliche Punkte, z. B. dass der Tarif den gewünschten Schutz der Sparte abdeckt und der Beitrag besprochen ist."
      : "- 2 bis 4 kurze Punkte. Jeder Punkt verbindet einen genannten Wunsch, Bedarf oder eine bestehende Absicherung mit dem gewählten Tarif oder einer genannten Leistung.",
    "- Nutze nur Angaben aus der Eingabe. Erfinde keine Leistungen, Wünsche, Zahlen, Versicherer oder Tarifnamen.",
    "- Beträge, Versicherer und Tarifnamen nur genau so, wie sie in der Eingabe stehen.",
    "- Keine Vergleiche mit anderen Angeboten (kein „günstiger“, „besser als“, „die beste“), keine Versprechen, nicht das Wort Garantie.",
    "- Keine Gesundheitsangaben und keine Vermutungen über die Gesundheit.",
    "- Keine Gedankenstriche, kein Markdown, keine eckigen Klammern. Jeder Punkt beginnt mit „• “.",
    "Antworte genau in diesem Format:",
    "GRÜNDE:",
    "• <Grund>",
  ].join("\n");
}

/** Antwort lesen: Punkte nach „GRÜNDE:“ (oder die Punkte allein); null, wenn nichts Brauchbares da ist. */
export function vorschlagLesen(text: string): string | null {
  const t = text.replace(/\r\n?/g, "\n");
  const m = t.match(/GR(?:Ü|UE)NDE:\s*\n?([\s\S]*)$/i);
  const roh = (m ? m[1] : t).trim();
  const punkte = roh
    .split("\n")
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z) => `• ${z.replace(/^([•*-]|\d+[.)])\s*/, "").trim()}`)
    .filter((z) => z.length > 3)
    .slice(0, 5);
  return punkte.length ? punkte.join("\n") : null;
}

/** Prüft den Vorschlag gegen die Eingabe. null = in Ordnung, sonst der Grund (Sie-Form). */
export function vorschlagPruefen(eingabe: string, ausgabe: string): string | null {
  const bekannt = betraege(eingabe);
  if ([...betraege(ausgabe)].some((b) => !bekannt.has(b))) return "Der Vorschlag enthielt Beträge, die nicht in Ihren Angaben stehen.";
  const vs = new Set(versichererIn(eingabe));
  if (versichererIn(ausgabe).some((v) => !vs.has(v))) return "Der Vorschlag nannte einen anderen Versicherer.";
  const vorher = new Set(beratungsTreffer(eingabe));
  if (beratungsTreffer(ausgabe).some((t) => t === "vergleich" && !vorher.has(t))) return "Der Vorschlag enthielt einen Vergleich.";
  if (/garantie|garantiert/i.test(ausgabe)) return "Der Vorschlag enthielt ein Versprechen.";
  if (/\[[^\]]*\]/.test(ausgabe)) return "Der Vorschlag war unvollständig.";
  return null;
}

export type VorschlagErgebnis = { ok: true; gruende: string; strikt: boolean } | { ok: false; error: string };

/** Gründe über die EU-KI vorschlagen (wirft nicht). client nur für Tests. */
export async function gruendeVorschlagen(
  q: {
    an: Ansprache;
    themen: (string | null | undefined)[];
    auswahl: AuswahlZeile[];
    wuensche: string;
    tier?: boolean;
  },
  o: { konfig?: BedrockEu | null; client?: MessagesClient } = {},
): Promise<VorschlagErgebnis> {
  const konfig = o.konfig === undefined ? bedrockEu() : o.konfig;
  const info = vorschlagInfo({ konfig, themen: q.themen, auswahl: q.auswahl });
  if (!konfig || !info) return { ok: false, error: "Die KI ist nicht eingerichtet." };
  const grund = vorschlagGrund(info, q.wuensche);
  if (grund) return { ok: false, error: grund };
  const eingabe = vorschlagEingabe({
    auswahl: q.auswahl,
    wuensche: q.wuensche,
    strikt: info.strikt,
    tier: q.tier,
  });
  try {
    const client = o.client ?? ((await import("@/lib/ki-eu")).bedrockClient(konfig) as unknown as MessagesClient);
    const resp = await client.messages.create({
      model: konfig.model,
      max_tokens: 600,
      system: vorschlagSystem(q.an, info.strikt),
      messages: [{ role: "user", content: eingabe }],
    });
    const text = resp.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join("");
    const gelesen = vorschlagLesen(text);
    // Zeilenweise ohne Gesundheitsangaben und ohne Gedankenstriche (Punkte, die leer werden, fallen weg)
    const gruende = gelesen
      ? ohneGedankenstriche(
          gelesen
            .split("\n")
            .map((z) => ohneGesundheitsangaben(z, { tier: q.tier }).trimEnd())
            .filter((z) => z.replace(/^[\s•]+/, "").length > 3)
            .join("\n"),
        ).slice(0, 1200)
      : "";
    if (!gruende)
      return {
        ok: false,
        error: "Die KI hat nicht passend geantwortet. Bitte erneut versuchen.",
      };
    const problem = vorschlagPruefen(eingabe, gruende);
    if (problem)
      return {
        ok: false,
        error: `${problem} Bitte erneut versuchen oder selbst ergänzen.`,
      };
    return { ok: true, gruende, strikt: info.strikt };
  } catch (err) {
    console.error("[gruende-ki]", (err as { status?: number }).status ?? "", (err instanceof Error ? err.message : String(err)).slice(0, 200));
    return {
      ok: false,
      error: "Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.",
    };
  }
}
