// E-Mail-Fassung der Bestandskampagnen (Ole, 14.11.2026): Betreff und Text je Anlass, Anrede wie im
// Du/Sie-Auftrag (Bestandskunden werden gesiezt, Texte liegen trotzdem in beiden Fassungen vor), ohne
// Gedankenstriche. Unter jeder Mail automatisch: Abmeldelink (ein Klick, ohne Login) und Pflichtangaben
// bzw. Impressum des Vermittlers. Text plus schlichtes HTML, ohne Tracking-Pixel und ohne Bilder.
// Rein, ohne Datenbank (auch für die Vorschau im Browser).

import { a, anredeZeile, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import type { Occasion } from "@/lib/bestand/campaigns";

/** Platzhalter im eigenen Text des Vermittlers. */
export const MAIL_PLATZHALTER = ["{anrede}", "{thema}", "{empfehlungslink}", "{meinname}"] as const;

/** Standardtext je Anlass ({anrede} = „Guten Tag Frau Muster,“). */
export function defaultCampaignMail(o: Occasion, an: Ansprache = "sie"): { subject: string; body: string } {
  switch (o) {
    case "cross_sell":
      return {
        subject: a(an, "Kurze Frage zu deiner Absicherung: {thema}", "Kurze Frage zu Ihrer Absicherung: {thema}"),
        body: a(
          an,
          "{anrede}\n\neine kurze Frage: Bist du beim Thema {thema} schon gut versorgt? Wenn du möchtest, schaue ich mir das gern einmal mit dir an. Antworte einfach auf diese E-Mail, dann melde ich mich.\n\nViele Grüße\n{meinname}",
          "{anrede}\n\neine kurze Frage: Sind Sie beim Thema {thema} schon gut versorgt? Wenn Sie möchten, schaue ich mir das gern einmal mit Ihnen an. Antworten Sie einfach auf diese E-Mail, dann melde ich mich.\n\nViele Grüße\n{meinname}",
        ),
      };
    case "review":
      return {
        subject: a(an, "Dein Vertragscheck: Passt noch alles?", "Ihr Vertragscheck: Passt noch alles?"),
        body: a(
          an,
          "{anrede}\n\nes ist Zeit für einen kurzen Check deiner Verträge: Passen Beitrag und Leistung noch zu deiner aktuellen Situation? Antworte einfach auf diese E-Mail, dann finden wir einen Termin.\n\nViele Grüße\n{meinname}",
          "{anrede}\n\nes ist Zeit für einen kurzen Check Ihrer Verträge: Passen Beitrag und Leistung noch zu Ihrer aktuellen Situation? Antworten Sie einfach auf diese E-Mail, dann finden wir einen Termin.\n\nViele Grüße\n{meinname}",
        ),
      };
    case "birthday":
      return {
        subject: "Herzlichen Glückwunsch zum Geburtstag",
        body: a(
          an,
          "{anrede}\n\nherzlichen Glückwunsch zum Geburtstag! Ich wünsche dir alles Gute für das neue Lebensjahr.\n\nViele Grüße\n{meinname}",
          "{anrede}\n\nherzlichen Glückwunsch zum Geburtstag! Ich wünsche Ihnen alles Gute für das neue Lebensjahr.\n\nViele Grüße\n{meinname}",
        ),
      };
    case "renewal":
      return {
        subject: a(an, "Dein Vertrag {thema}: bald steht ein Termin an", "Ihr Vertrag {thema}: bald steht ein Termin an"),
        body: a(
          an,
          "{anrede}\n\nbei deinem Vertrag {thema} steht bald ein Termin an, zu dem man gut prüfen kann, ob Beitrag und Leistung noch passen. Soll ich mir das kurz für dich anschauen? Antworte einfach auf diese E-Mail.\n\nViele Grüße\n{meinname}",
          "{anrede}\n\nbei Ihrem Vertrag {thema} steht bald ein Termin an, zu dem man gut prüfen kann, ob Beitrag und Leistung noch passen. Soll ich mir das kurz für Sie anschauen? Antworten Sie einfach auf diese E-Mail.\n\nViele Grüße\n{meinname}",
        ),
      };
    case "empfehlung":
      return {
        subject: "Eine kleine Bitte",
        body: a(
          an,
          "{anrede}\n\nkennst du jemanden, dem ich genauso weiterhelfen kann? Über deinen persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {empfehlungslink}\n\nVielen Dank und viele Grüße\n{meinname}",
          "{anrede}\n\nkennen Sie jemanden, dem ich genauso weiterhelfen kann? Über Ihren persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {empfehlungslink}\n\nVielen Dank und viele Grüße\n{meinname}",
        ),
      };
  }
}

export type MailWerte = {
  ansprache?: Ansprache;
  kontakt: AnredeKontakt | null;
  thema?: string | null;
  empfehlungslink?: string | null;
  meinname: string;
};

/** Platzhalter füllen. Ohne Thema wird „{thema}“ neutral ersetzt. */
export function fillCampaignMail(tpl: { subject: string; body: string }, w: MailWerte): { subject: string; body: string } {
  const an = w.ansprache ?? "sie";
  const thema = w.thema?.trim() || a(an, "deine Absicherung", "Ihre Absicherung");
  const map: Record<string, string> = {
    "{anrede}": anredeZeile(an, w.kontakt),
    "{thema}": thema,
    "{empfehlungslink}": w.empfehlungslink ?? "",
    "{meinname}": w.meinname,
  };
  // Ohne Thema: „Ihr Vertrag {thema}“ → „Ihr Vertrag“ (statt „Ihr Vertrag Ihre Absicherung“)
  const noTopic = (s: string) => (w.thema?.trim() ? s : s.replace(/(Vertrag) \{thema\}/g, "$1"));
  const fill = (s: string) => noTopic(s).replace(/\{(anrede|thema|empfehlungslink|meinname)\}/g, (m) => map[m] ?? m);
  // „Ihr Vertrag : bald …“ vermeiden, falls der Betreff ohne Thema endet
  return { subject: fill(tpl.subject).replace(/\s+:/g, ":").trim(), body: fill(tpl.body).trim() };
}

/**
 * Fußzeile jeder Kampagnen-Mail: Absender, Widerspruchshinweis nach § 7 Abs. 3 Nr. 4 UWG mit Ein-Klick-Abmeldung
 * (P0-2, 19.11.2026: Hinweis in jeder Mail, auch bei Einwilligung), Pflichtangaben. Zwei Absätze plus Impressum.
 */
export function campaignMailFooter(o: { firm: string; unsubscribeUrl: string; imprint: string | null; ansprache?: Ansprache }): string {
  const an = o.ansprache ?? "sie";
  return [
    a(an, `Du bekommst diese E-Mail als Kundin bzw. Kunde von ${o.firm}.`, `Sie erhalten diese E-Mail als Kundin bzw. Kunde von ${o.firm}.`),
    "",
    a(
      an,
      `Du kannst der Nutzung deiner E-Mail-Adresse für Werbung jederzeit widersprechen, es entstehen dir dabei nur die üblichen Übermittlungskosten. Mit einem Klick abmelden: ${o.unsubscribeUrl}`,
      `Sie können der Nutzung Ihrer E-Mail-Adresse für Werbung jederzeit widersprechen, es entstehen Ihnen dabei nur die üblichen Übermittlungskosten. Mit einem Klick abmelden: ${o.unsubscribeUrl}`,
    ),
    ...(o.imprint?.trim() ? ["", o.imprint.trim()] : []),
  ].join("\n");
}

/** Liegen Pflichtangaben (Impressum) vor? Ohne sie geht keine Kampagnen-Mail raus (Start und Versand). */
export function hasImprint(imprint: string | null | undefined): boolean {
  return !!imprint?.trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s: string) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);

/** Fertige Mail: Text und schlichtes HTML (ohne Bilder, ohne Tracking-Pixel). */
export function buildCampaignMail(body: string, footer: string): { text: string; html: string } {
  const text = `${body}\n\n\n${footer}`;
  const para = (block: string, style: string) => `<p style="${style}">${linkify(block).replace(/\n/g, "<br>")}</p>`;
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    ...body.split(/\n{2,}/).map((b) => para(b, "margin:0 0 14px")),
    '<div style="margin-top:28px;border-top:1px solid #ddd;padding-top:12px;font-size:12px;color:#666">',
    ...footer.split(/\n{2,}/).map((b) => para(b, "margin:0 0 8px")),
    "</div></div>",
  ].join("");
  return { text, html };
}

/** Pflichtangaben aus dem gelesenen Impressum der Website (Onboarding.websiteInfo), sonst null. */
export function imprintFromWebsiteInfo(info: unknown): string | null {
  if (!info || typeof info !== "object") return null;
  const i = info as Record<string, unknown>;
  const s = (k: string) => (typeof i[k] === "string" && (i[k] as string).trim() ? (i[k] as string).trim() : null);
  const lines = [
    s("companyName"),
    s("representative") ? `Vertreten durch: ${s("representative")}` : null,
    s("address"),
    [s("phone") ? `Telefon: ${s("phone")}` : null, s("email") ? `E-Mail: ${s("email")}` : null].filter(Boolean).join(", ") || null,
    s("registerNumber") ? `${s("registerType") ?? "Vermittlerregister"}: ${s("registerNumber")}` : null,
    s("chamber") ? `Zuständige Kammer: ${s("chamber")}` : null,
    s("impressumUrl") ? `Impressum: ${s("impressumUrl")}` : null,
  ].filter((x): x is string => !!x);
  return lines.length ? lines.join("\n") : null;
}

/** Gedankenstriche (– und —) in Texten an Kunden vermeiden: durch Komma ersetzen (Bis-Striche zwischen Zahlen bleiben). */
export { ohneGedankenstriche } from "@/lib/gedankenstriche";
