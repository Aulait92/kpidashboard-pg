// Beratungsdokumentation als Angebot (Paket B, Ole 18.11.2026, docs/plan-mailstrecke-dsgvo-investoren.md „Nachtrag Ole B“).
// Rein (ohne Datenbank), auch im Browser nutzbar: Abschnitte, Entwurf aus dem Termin, Prüfung vor dem Senden,
// PDF-Inhalt, Mailtext an den Kunden (beide Ansprachen). Prüfsumme und Datenbank: lib/beratungsdoku-server.ts.
//
// Der Vermittler verantwortet die Inhalte, die App berät nicht: Der Entwurf übernimmt nur, was im Termin erfasst ist
// (Terminvorbereitung, Vergleichsblatt, Angaben aus dem Chat, Notizen, Tarifauswahl). Begründung und alles Unbekannte
// bleiben als Stelle zum Ergänzen (GRUENDE_ERGAENZEN), Senden und Ablegen erst ohne diese Stellen.

import { a, type Ansprache } from "@/lib/ansprache";
import { GRUENDE_ERGAENZEN, hatLuecke, pdfDateiname, zusammenfassungEntwurf, type ZusammenfassungQuellen } from "@/lib/mail/beratung";
import type { PdfBlock } from "@/lib/mail/text-pdf";

export const BD_ABSCHNITTE = ["wuensche", "beratung", "empfehlung", "entscheidung", "hinweise"] as const;
export type BdAbschnitt = (typeof BD_ABSCHNITTE)[number];
export type BdInhalt = Record<BdAbschnitt, string>;

/** Überschriften (Vermittler-Oberfläche und PDF). */
export const BD_TITEL: Record<BdAbschnitt, string> = {
  wuensche: "Wünsche und Bedürfnisse",
  beratung: "Beratung",
  empfehlung: "Empfehlung mit Begründung",
  entscheidung: "Entscheidung des Kunden",
  hinweise: "Hinweise",
};

/** Nur „Hinweise“ darf leer bleiben. */
export const BD_PFLICHT: readonly BdAbschnitt[] = ["wuensche", "beratung", "empfehlung", "entscheidung"];

/** Ein Satz für die Oberfläche des Vermittlers (Sie-Form). */
export const BD_VERANTWORTUNG = "Die Inhalte verantworten Sie, die App berät nicht.";

/** Wie lange der Link zur Bestätigung gilt. */
export const BD_LINK_TAGE = 30;

export const BD_MAX = 6000;

/** Eingabe säubern (Längen begrenzen, nur bekannte Abschnitte). */
export function bdSauber(x: unknown): BdInhalt {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  return Object.fromEntries(BD_ABSCHNITTE.map((k) => [k, typeof o[k] === "string" ? (o[k] as string).replace(/\r\n?/g, "\n").slice(0, BD_MAX) : ""])) as BdInhalt;
}

/** Fehlt noch etwas, bevor die Dokumentation rausgeht bzw. abgelegt wird? null = in Ordnung (Sie-Form, ein Satz). */
export function bdFehlt(i: BdInhalt): string | null {
  for (const k of BD_PFLICHT) if (!i[k].trim()) return `Bitte „${BD_TITEL[k]}“ ausfüllen.`;
  if (BD_ABSCHNITTE.some((k) => hatLuecke(i[k]))) return `Bitte die Stellen mit ${GRUENDE_ERGAENZEN} ausfüllen.`;
  return null;
}

export type BdTarif = { sparte: string; gesellschaft: string | null; tarif: string | null; beitrag: number | null; gewaehlt: boolean };
export type BdVertrag = { sparte: string; versicherer: string | null; monat: number | null };

export type BdQuellen = ZusammenfassungQuellen & {
  /** Alle im Termin verglichenen Tarife (ohne Zusatzsparten) */
  tarife?: BdTarif[];
  /** Geprüfte Verträge aus dem Vergleichsblatt (ohne Gesundheitssparten) */
  vertraege?: BdVertrag[];
  /** Status des Kontakts (für den Vorschlag zur Entscheidung) */
  status?: string | null;
};

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const zeile = (t: string) => t.replace(/\s+/g, " ").trim();

/** Vorschlag zur Entscheidung aus dem Status (der Vermittler prüft ihn vor dem Senden). */
export function entscheidungVorschlag(an: Ansprache, status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "abschluss") return a(an, "Du hast dich für die Empfehlung entschieden.", "Sie haben sich für die Empfehlung entschieden.");
  if (["kein interesse", "disqualifiziert", "verloren"].includes(s)) return a(an, "Du hast dich gegen einen Abschluss entschieden.", "Sie haben sich gegen einen Abschluss entschieden.");
  return a(an, "Du möchtest das Angebot in Ruhe prüfen.", "Sie möchten das Angebot in Ruhe prüfen.");
}

/**
 * Entwurf aus dem Termin. Wünsche: wie die Gesprächszusammenfassung (Formular, Angaben, bestehende Verträge, Schutz heute,
 * Notizen; ohne Gesundheitsangaben). Beratung: abgehakte Klärpunkte, Verträge aus dem Vergleichsblatt, verglichene Tarife.
 * Empfehlung: gewählte Tarife und die Begründung als Stelle zum Ergänzen. Entscheidung: Vorschlag aus dem Status.
 * Hinweise: noch offene Klärpunkte.
 */
export function beratungsdokuEntwurf(q: BdQuellen): BdInhalt {
  const an = q.an;
  const basis = zusammenfassungEntwurf({ ...q, klaeren: undefined });

  const b: string[] = [];
  const punkte = q.klaeren?.punkte ?? [];
  const erledigt = new Set((q.klaeren?.erledigt ?? []).map((x) => x.toLowerCase()));
  const besprochen = punkte.filter((p) => erledigt.has(p.toLowerCase())).slice(0, 8);
  if (besprochen.length) b.push("Besprochen:", ...besprochen.map((p) => `• ${zeile(p)}`));
  const vv = (q.vertraege ?? []).slice(0, 8);
  if (vv.length) {
    b.push(...(b.length ? [""] : []), a(an, "Deine bestehenden Verträge laut deinen Unterlagen:", "Ihre bestehenden Verträge laut Ihren Unterlagen:"));
    for (const v of vv) b.push(`• ${v.sparte}${v.versicherer ? ` bei ${zeile(v.versicherer)}` : ""}${v.monat != null ? `, ${eur(v.monat)} im Monat` : ""}`);
  }
  const tarife = (q.tarife ?? []).slice(0, 10);
  if (tarife.length > 1) {
    b.push(...(b.length ? [""] : []), "Verglichene Tarife:");
    for (const t of tarife) {
      const name = [t.gesellschaft, t.tarif].filter(Boolean).join(" ");
      b.push(`• ${t.sparte}${name ? `: ${name}` : ""}${t.beitrag != null ? `, ${eur(t.beitrag)} im Monat` : ""}`);
    }
  }
  if (!b.length) b.push(`Besprochen: ${GRUENDE_ERGAENZEN}`);

  // Empfehlung: Tarifzeilen aus dem Entwurf der Zusammenfassung, „Gründe“ heißt hier „Begründung“
  const rat = basis.rat.replace(/Gründe: \[bitte ergänzen\]$/, `Begründung: ${GRUENDE_ERGAENZEN}`);
  const empfehlung = (q.auswahl ?? []).length ? rat : `Empfohlen: ${GRUENDE_ERGAENZEN}\n${rat}`;

  const offen = punkte.filter((p) => !erledigt.has(p.toLowerCase())).slice(0, 5);
  const hinweise = offen.length ? ["Noch zu klären:", ...offen.map((p) => `• ${zeile(p)}`)].join("\n") : "";

  return {
    wuensche: basis.wuensche,
    beratung: b.join("\n").trim(),
    empfehlung: empfehlung.trim(),
    entscheidung: entscheidungVorschlag(an, q.status),
    hinweise,
  };
}

const TZ = "Europe/Berlin";
export const bdTag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
export const bdUhr = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

export type BdKopf = { kunde: string; produkt: string; berater: string; termin: Date | null };

/** Inhalt des PDFs (auch die Ansicht im Blatt und die Seite für den Kunden). */
export function bdPdfInhalt(f: BdKopf & { an: Ansprache; inhalt: BdInhalt; now: Date; bestaetigtAt?: Date | null }) {
  const bloecke: PdfBlock[] = BD_ABSCHNITTE.filter((k) => f.inhalt[k].trim()).map((k) => ({ ueberschrift: BD_TITEL[k], text: f.inhalt[k].trim() }));
  const berater = f.berater.trim() || a(f.an, "deinem Berater", "Ihrem Berater");
  const fuss = [
    a(
      f.an,
      `Bitte prüfe die Angaben und gib mir Bescheid, wenn etwas fehlt oder nicht stimmt. Die Inhalte verantwortet ${berater}.`,
      `Bitte prüfen Sie die Angaben und geben Sie mir Bescheid, wenn etwas fehlt oder nicht stimmt. Die Inhalte verantwortet ${berater}.`,
    ),
    ...(f.bestaetigtAt ? [`Erhalt bestätigt am ${bdTag(f.bestaetigtAt)} um ${bdUhr(f.bestaetigtAt)} Uhr per Klick.`] : []),
  ].join("\n");
  return {
    titel: "Beratungsdokumentation",
    kopf: [
      `Kunde: ${f.kunde.trim() || "ohne Namen"}`,
      `Thema: ${f.produkt}`,
      `Beraten durch: ${f.berater.trim() || "ohne Namen"}`,
      ...(f.termin ? [`Gespräch am: ${bdTag(f.termin)}`] : []),
      `Erstellt am: ${bdTag(f.now)}`,
    ],
    bloecke,
    fuss,
  };
}

export const bdDateiname = (kunde: string, now: Date, bestaetigt = false) =>
  bestaetigt ? pdfDateiname("Beratungsdokumentation", kunde, now).replace(/\.pdf$/, "_bestaetigt.pdf") : pdfDateiname("Beratungsdokumentation", kunde, now);

/** Betreff und Text der Mail an den Kunden (Platzhalter {anrede} und {signatur} wie in den Vorlagen). */
export function bdMail(an: Ansprache, o: { produkt: string; termin: Date | null }): { subject: string; body: string; knopf: string } {
  const am = o.termin ? ` am ${bdTag(o.termin)}` : "";
  return {
    subject: a(an, `Deine Beratungsdokumentation zu ${o.produkt}`, `Ihre Beratungsdokumentation zu ${o.produkt}`),
    body: a(
      an,
      `{anrede},\n\nvielen Dank für das Gespräch${am}. Anbei bekommst du die Dokumentation unserer Beratung als PDF.\n\nBitte lies sie in Ruhe durch und bestätige den Erhalt mit einem Klick auf den Knopf unten. Wenn etwas fehlt oder nicht stimmt, antworte einfach auf diese E-Mail.\n\n{signatur}`,
      `{anrede},\n\nvielen Dank für das Gespräch${am}. Anbei erhalten Sie die Dokumentation unserer Beratung als PDF.\n\nBitte lesen Sie sie in Ruhe durch und bestätigen Sie den Erhalt mit einem Klick auf den Knopf unten. Wenn etwas fehlt oder nicht stimmt, antworten Sie einfach auf diese E-Mail.\n\n{signatur}`,
    ),
    knopf: "Ansehen und Erhalt bestätigen",
  };
}

/** Texte der Seite für den Kunden (beide Ansprachen, ohne Gedankenstriche). */
export function bdSeitenText(an: Ansprache) {
  return {
    titel: a(an, "Deine Beratungsdokumentation", "Ihre Beratungsdokumentation"),
    bitte: a(an, "Mit dem Klick bestätigst du, dass du die Dokumentation erhalten hast.", "Mit dem Klick bestätigen Sie, dass Sie die Dokumentation erhalten haben."),
    knopf: "Erhalt bestätigen",
    danke: "Danke, der Erhalt ist bestätigt",
    fehler: a(an, "Fehlt etwas oder stimmt etwas nicht? Antworte einfach auf die E-Mail.", "Fehlt etwas oder stimmt etwas nicht? Antworten Sie einfach auf die E-Mail."),
    ersetzt: a(an, "Es gibt eine neuere Fassung. Bitte nutze den Link aus der neuesten E-Mail.", "Es gibt eine neuere Fassung. Bitte nutzen Sie den Link aus der neuesten E-Mail."),
    abgelaufen: a(an, "Dieser Link ist abgelaufen. Bitte melde dich bei deinem Berater.", "Dieser Link ist abgelaufen. Bitte melden Sie sich bei Ihrem Berater."),
    pdf: "Als PDF speichern",
    busy: a(an, "Gerade ist viel los. Bitte versuch es gleich noch einmal.", "Gerade ist viel los. Bitte versuchen Sie es gleich noch einmal."),
  };
}
