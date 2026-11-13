// Mail-Sperre für die Testumgebung: Ist MAIL_NUR_AN gesetzt, gehen Mails nur an
// passende Empfänger (z. B. "@performancegrowth.de,ole.kannapinn*@gmail.com").
// Alle anderen werden still verworfen und protokolliert – so bekommen echte
// Kunden und Leads aus staging nichts. In der Produktion bleibt die Variable leer.
import { Resend } from "resend";

type SendArgs = Parameters<Resend["emails"]["send"]>[0];

function patterns(): string[] | null {
  const raw = process.env.MAIL_NUR_AN?.trim();
  if (!raw) return null;
  return raw.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
}

/** Darf an diese Adresse gesendet werden? (ohne MAIL_NUR_AN: immer) */
export function mailAllowed(address: string, list = patterns()): boolean {
  if (!list) return true;
  const a = address.trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, "$1");
  return list.some((p) => {
    if (p.startsWith("@")) return a.endsWith(p);
    if (p.includes("*")) return new RegExp(`^${p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(a);
    return a === p;
  });
}

const filter = (v: string | string[] | undefined, list: string[] | null) => {
  if (v === undefined) return undefined;
  const kept = [v].flat().filter((x) => mailAllowed(x, list));
  return kept;
};

/** Resend-Client, der MAIL_NUR_AN beachtet. */
export function mailClient(apiKey: string) {
  const resend = new Resend(apiKey);
  return {
    emails: {
      async send(args: SendArgs) {
        const list = patterns();
        if (!list) return resend.emails.send(args);
        const to = filter(args.to as string | string[], list) ?? [];
        const blocked = [args.to].flat().filter((x) => !mailAllowed(String(x), list));
        if (blocked.length) console.warn(`[mail-sperre] nicht gesendet an ${blocked.length} Empfänger: „${args.subject}“`);
        // blocked: true – interaktive Versande (z. B. Angebotsmail) melden das statt „gesendet“
        if (!to.length) return { data: { id: "gesperrt" }, error: null, headers: null, blocked: true } as unknown as Awaited<ReturnType<Resend["emails"]["send"]>>;
        return resend.emails.send({
          ...args,
          to,
          ...(args.cc ? { cc: filter(args.cc as string | string[], list) } : {}),
          ...(args.bcc ? { bcc: filter(args.bcc as string | string[], list) } : {}),
        } as SendArgs);
      },
    },
  };
}

/** Hinweis, wenn die Testumgebung eine Mail komplett gesperrt hat (MAIL_NUR_AN). */
export const MAIL_BLOCKED_TEXT =
  "Testumgebung: Mails gehen nur an freigegebene Adressen (MAIL_NUR_AN), diese Adresse ist nicht freigegeben – nichts verschickt.";
export const wasBlocked = (res: unknown) => !!(res && typeof res === "object" && (res as { blocked?: boolean }).blocked);
