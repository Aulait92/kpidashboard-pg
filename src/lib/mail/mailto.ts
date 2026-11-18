// „Im eigenen Mailprogramm öffnen“ (Ole, 17.11.2026, Paket M1): mailto-Link mit Betreff und Text. Rein, auch im
// Browser (tests/unit/mailto.test.ts).
//
//   - Kodierung mit encodeURIComponent, Zeilenumbrüche als %0D%0A (RFC 6068).
//   - Höchstens ca. 1.800 Zeichen für den ganzen Link (Outlook und manche Handys schneiden längere ab). Ist der Text
//     länger, steht im Link nur ein Hinweis; der Text kommt in die Zwischenablage (macht die Komponente).
//   - Die Signatur entfällt: Das eigene Mailprogramm setzt seine eigene darunter.

export const MAILTO_MAX = 1800;

/** Hinweis im Mailtext, wenn der Text zu lang für den Link ist (liest nur der Vermittler, vor dem Einfügen). */
export const MAILTO_HINWEIS = "Der Text ist in Ihrer Zwischenablage. Bitte hier einfügen.";

const enc = (v: string) => encodeURIComponent(v.replace(/\r\n|\r|\n/g, "\r\n"));

/** mailto-Link ohne Längenprüfung. Die Adresse bleibt lesbar (@ nicht kodiert). */
export function mailtoHref(o: { to: string; subject: string; body: string }): string {
  const to = encodeURIComponent(o.to.trim()).replace(/%40/g, "@");
  const q = [o.subject.trim() ? `subject=${enc(o.subject.trim())}` : "", o.body ? `body=${enc(o.body)}` : ""].filter(Boolean).join("&");
  return `mailto:${to}${q ? `?${q}` : ""}`;
}

/** mailto-Link; zu lang → Text durch MAILTO_HINWEIS ersetzt und `gekuerzt` (Text in die Zwischenablage). */
export function mailtoLink(o: { to: string; subject: string; body: string }, max = MAILTO_MAX): { href: string; gekuerzt: boolean } {
  const voll = mailtoHref(o);
  if (voll.length <= max) return { href: voll, gekuerzt: false };
  return { href: mailtoHref({ ...o, body: MAILTO_HINWEIS }), gekuerzt: true };
}

/** Signatur am Ende des Texts entfernen (für mailto und „Text kopieren“ ins eigene Mailprogramm). */
export function ohneSignatur(text: string, signatur: string | null | undefined): string {
  const sig = (signatur ?? "").replace(/\r\n/g, "\n").trim();
  const t = text.replace(/\r\n/g, "\n");
  if (!sig) return t.trimEnd();
  const i = t.lastIndexOf(sig);
  if (i < 0) return t.trimEnd();
  // Gruß („Viele Grüße“) bleibt stehen, nur Name, Agentur, Anschrift usw. entfallen
  const gruss = /^(viele|beste|freundliche|herzliche|liebe) grüße[^\n]*|^mit freundlichen grüßen[^\n]*/i.exec(sig)?.[0] ?? "";
  return `${t.slice(0, i)}${gruss}${t.slice(i + sig.length)}`.replace(/\n{3,}/g, "\n\n").trimEnd();
}
