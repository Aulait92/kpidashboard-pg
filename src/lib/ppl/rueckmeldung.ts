// Rückmeldung des Pay-per-Lead-Käufers mit einem Tipp (Ole, 25.11.2026, Usability-Check: nur 6 % der Leads mit nächstem
// Schritt, zwei Käufer bekommen Leads nur per E-Mail und melden sich nie an).
//
// Wer: der Käufer (Vermittler), meist am Handy, direkt nach dem Anruf. Aufgabe: sagen, wie es lief.
// Wege: drei Knöpfe je Lead in der Liefer-E-Mail (ohne Login) und dieselben drei Aktionen in der Leadliste.
//
// Link: /rueckmeldung/<token>?a=<art>. Der Token enthält nur die Lead-ID (intern, keine Personendaten), den Ablauf und eine
// HMAC-SHA256-Signatur (AUTH_SECRET) über Lead, Käufer (customerId, steht nicht in der URL) und Ablauf. Gehört der Lead
// nicht mehr diesem Käufer, ist der Link ungültig. Der Klick in der Mail öffnet nur die Seite; gespeichert wird erst per
// Knopf auf der Seite (POST), damit Mail-Vorschauen und Virenscanner nichts auslösen.
// Reine Funktionen (ohne Datenbank, auch im Browser), getestet in tests/unit/ppl-rueckmeldung.test.ts.
// Token: rueckmeldung-token.ts (node:crypto). Speichern: rueckmeldung-server.ts.

export const RUECKMELDUNG_ARTEN = ["erreicht", "nicht_erreicht", "termin"] as const;
export type RueckmeldungArt = (typeof RUECKMELDUNG_ARTEN)[number];
export const istRueckmeldungArt = (v: unknown): v is RueckmeldungArt => typeof v === "string" && (RUECKMELDUNG_ARTEN as readonly string[]).includes(v);

/** Beschriftung der Knöpfe (Mail, Seite, Leadliste), überall gleich. */
export const RUECKMELDUNG_LABEL: Record<RueckmeldungArt, string> = {
  erreicht: "Erreicht",
  nicht_erreicht: "Nicht erreicht",
  termin: "Termin vereinbart",
};

/** Phase, auf die die Rückmeldung den Lead setzt (nur aus frühen Phasen, siehe rueckmeldung-server.ts). */
export const RUECKMELDUNG_STATUS: Record<RueckmeldungArt, string> = {
  erreicht: "Erreicht",
  nicht_erreicht: "Nicht erreicht",
  termin: "Termin vereinbart",
};

/** Notiz der automatischen Wiedervorlage nach „Nicht erreicht“. */
export const RUECKMELDUNG_WIEDERVORLAGE = "Erneut anrufen";

/** Gültigkeit der Links in der Liefer-E-Mail. */
export const RUECKMELDUNG_TAGE = 30;
export const RUECKMELDUNG_PFAD = "/rueckmeldung";

export const rueckmeldungPfad = (token: string, art?: RueckmeldungArt) => `${RUECKMELDUNG_PFAD}/${token}${art ? `?a=${art}` : ""}`;

const TZ = "Europe/Berlin";
const ymdBerlin = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/** Uhrzeit in Berlin an einem Tag (YYYY-MM-DD) als Zeitpunkt. */
export function berlinUhr(ymd: string, stunde: number, minute = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, stunde, minute);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(guess)));
  const versatz = (((h - stunde) % 24) + 24) % 24;
  return new Date(guess - versatz * 3_600_000);
}

/** Nächster Werktag (Mo bis Fr) nach heute, 9 Uhr Berliner Zeit. */
export function naechsterWerktag9(now = new Date()): Date {
  const [y, m, d] = ymdBerlin(now).split("-").map(Number);
  const tag = new Date(Date.UTC(y, m - 1, d, 12));
  do tag.setUTCDate(tag.getUTCDate() + 1);
  while (tag.getUTCDay() === 0 || tag.getUTCDay() === 6);
  return berlinUhr(tag.toISOString().slice(0, 10), 9);
}

/** „Do., 26.11., 9 Uhr“ */
export function wiedervorlageText(at: Date): string {
  const tag = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).format(at);
  const uhr = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(at).replace(":00", "");
  return `${tag}, ${uhr} Uhr`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Block für die Liefer-E-Mail: eine Zeile Frage, drei Knöpfe (HTML) bzw. drei Links (Textfassung).
 * base = App-Adresse ohne Schrägstrich am Ende.
 */
export function rueckmeldungMailBlock(base: string, token: string): { html: string; text: string[] } {
  const frage = "Wie lief Ihr Anruf? Ein Klick genügt:";
  const knopf = (art: RueckmeldungArt, haupt: boolean) =>
    `<a href="${esc(`${base}${rueckmeldungPfad(token, art)}`)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;${
      haupt ? "background:#2563eb;color:#ffffff;border:1px solid #2563eb" : "background:#ffffff;color:#0b1220;border:1px solid #d6dee9"
    }">${esc(RUECKMELDUNG_LABEL[art])}</a>`;
  return {
    html: `<p style="margin:8px 0 10px;font-size:15px;line-height:1.6;font-weight:600">${esc(frage)}</p><p style="margin:0 0 20px">${knopf("erreicht", true)}${knopf("nicht_erreicht", false)}${knopf("termin", false)}</p>`,
    text: [frage, ...RUECKMELDUNG_ARTEN.map((a) => `${RUECKMELDUNG_LABEL[a]}: ${base}${rueckmeldungPfad(token, a)}`)],
  };
}

/** Name für die Bestätigungsseite: Vorname und Initiale („Max M.“), keine vollen Daten auf einer Seite ohne Login. */
export function kurzName(name: string | null | undefined): string {
  const teile = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!teile.length) return "Ihr Lead";
  return teile.length === 1 ? teile[0] : `${teile[0]} ${teile[teile.length - 1].charAt(0)}.`;
}
