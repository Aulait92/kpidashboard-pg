// Kontaktformular der empfohlenen Person (/empfehlung/[token]/kontakt): Eingaben bei Fehlern behalten.
// Das Formular prüft serverseitig und leitet bei Fehlern um (?err=…). Damit die Person nicht alles neu
// eintippen muss, merken wir die Eingaben kurz in einem Cookie (nicht in der URL, damit nichts in Logs landet).

export const REFERRAL_DRAFT_COOKIE = "empf_entwurf";
export const REFERRAL_DRAFT_MAX_AGE = 10 * 60;

export type ReferralDraft = { name: string; phone: string; email: string; topic: string; message: string; consent: boolean; statusConsent: boolean };

const cut = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : "");

function clean(o: Partial<Record<keyof ReferralDraft, unknown>>): ReferralDraft {
  return {
    name: cut(o.name, 80),
    phone: cut(o.phone, 30).replace(/[^\d+ ()/-]/g, ""),
    email: cut(o.email, 120),
    topic: cut(o.topic, 80),
    message: cut(o.message, 500),
    consent: o.consent === true,
    statusConsent: o.statusConsent === true,
  };
}

export function encodeReferralDraft(d: ReferralDraft): string {
  return Buffer.from(JSON.stringify(clean(d)), "utf8").toString("base64url");
}

export function decodeReferralDraft(raw: string | null | undefined): ReferralDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return o && typeof o === "object" ? clean(o) : null;
  } catch {
    return null;
  }
}
