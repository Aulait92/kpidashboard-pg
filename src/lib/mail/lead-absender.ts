// Absender und Signatur für E-Mails an Leads und Endkunden (Ole, 17.11.2026, Paket P0 „Lead-Mail-Baustein“).
// Rein, ohne Datenbank, getestet (tests/unit/lead-mail-baustein.test.ts). Versand: lib/mail/lead-versand.ts.
//
//   Von (Resend):  "Ole Kannapinn | Kannapinn Versicherungen" <termine@dein-beratungstermin.de>
//                  Adresse nur aus BOOKING_EMAIL_FROM bzw. LEAD_EMAIL_FROM (unsere Versanddomain), nie eine fremde.
//   Signatur:      Gruß, Name, Agentur, Anschrift, Telefon und Link zur Erstinformation (Anbieterangaben).

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** Angaben für Anzeigename und Signatur: der zuständige Berater mit den Anbieterangaben der Agentur. */
export type LeadAbsenderDaten = {
  /** Vor- und Nachname des zuständigen Beraters („Ole Kannapinn“), sonst der Agenturname */
  name: string;
  /** Agentur bzw. Firma laut Erstinformation; null, wenn gleich dem Namen oder unbekannt */
  agentur: string | null;
  anschrift: string | null;
  telefon: string | null;
  /** Öffentliche Erstinformation (/erstinformation/<token>) */
  erstinfoUrl: string | null;
};

/** Anzeigename im Absender: „Ole Kannapinn | Kannapinn Versicherungen“, ohne Agentur nur der Name. */
export function leadAnzeigename(name: string, agentur: string | null | undefined): string {
  const strip = (s: string) => clean(s).replace(/["<>|\\]/g, "").trim();
  const n = strip(name);
  const ag = strip(agentur ?? "");
  if (!ag || ag.toLowerCase() === n.toLowerCase()) return n || ag;
  return n ? `${n} | ${ag}` : ag;
}

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/**
 * Absender-Adresse auf unserer Versanddomain (BOOKING_EMAIL_FROM, sonst LEAD_EMAIL_FROM). Steht ein Name davor
 * („performancegrowth <termine@…>“), zählt nur die Adresse. null, wenn keine gültige Adresse gesetzt ist: dann wird
 * bewusst nicht über Resend gesendet (kein Rückfall auf eine andere Domain).
 */
export function leadMailAdresse(env: Record<string, string | undefined> = process.env): string | null {
  for (const raw of [env.BOOKING_EMAIL_FROM, env.LEAD_EMAIL_FROM]) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    const m = /<([^>]+)>/.exec(v);
    const address = (m ? m[1] : v).trim();
    if (EMAIL.test(address)) return address;
  }
  return null;
}

/** Kopfzeile „Von“ für Resend. */
export function leadFromKopf(name: string, agentur: string | null | undefined, adresse: string): string {
  return `"${leadAnzeigename(name, agentur)}" <${adresse}>`;
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Anschrift einzeilig („Hauptstraße 1, 80331 München“). */
function einzeilig(v: string | null | undefined): string {
  return (v ?? "")
    .split(/\r?\n/)
    .map((s) => clean(s).replace(/,$/, ""))
    .filter(Boolean)
    .join(", ");
}

export type LeadSignatur = { text: string; html: string };

/**
 * Signatur aus den Anbieterangaben: „Viele Grüße“, Name, Agentur, Anschrift, Telefon, Erstinformation (Link).
 * Für Du und Sie gleich. Fehlende Angaben entfallen.
 */
export function leadSignatur(d: LeadAbsenderDaten): LeadSignatur {
  const name = clean(d.name);
  const agentur = clean(d.agentur);
  const zeilen = [
    name,
    agentur && agentur.toLowerCase() !== name.toLowerCase() ? agentur : "",
    einzeilig(d.anschrift),
    clean(d.telefon) ? `Telefon: ${clean(d.telefon)}` : "",
  ].filter(Boolean);
  const url = clean(d.erstinfoUrl);
  const text = ["Viele Grüße", ...zeilen, ...(url ? [`Erstinformation: ${url}`] : [])].join("\n");
  const html = [
    "Viele Grüße",
    ...zeilen.map((z, i) => (i === 0 ? `<strong>${esc(z)}</strong>` : esc(z))),
    ...(url ? [`<a href="${esc(url)}" style="color:#2563eb">Erstinformation</a>`] : []),
  ].join("<br>");
  return { text, html: `<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#0b1220">${html}</p>` };
}

/** Eigene Signatur des Postfachs (User.mailSignature) als Text und HTML; null, wenn leer. */
export function postfachSignatur(sig: string | null | undefined): LeadSignatur | null {
  const text = (sig ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return null;
  return { text, html: `<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#0b1220">${esc(text).replace(/\n/g, "<br>")}</p>` };
}
