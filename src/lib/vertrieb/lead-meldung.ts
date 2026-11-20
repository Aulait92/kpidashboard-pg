// Meldung an Ole bei jedem neuen Vermittler-Lead aus Meta (Ole, 18.11.2026), egal ob über den Zap
// (/api/vertrieb/leads/webhook) oder direkt über den Meta-Webhook (/api/meta/leadgen → lib/lead-intake.ts):
// Push an alle Admins und, wenn eingerichtet, dieselbe Meldung über den Telegram-Bot.
// Telegram abschalten: VERTRIEB_LEAD_TELEGRAM=aus (auch 0, false, off). Fehler werden nur protokolliert.

import { sendToAdmins } from "@/lib/push";
import { escapeHtml, sendTelegramText } from "@/lib/telegram";
import { getAppUrl } from "@/lib/email";
import { reportError } from "@/lib/monitoring";

export const VERTRIEB_LEAD_TITEL = "Neuer Vermittler-Lead";

/** „Name, Agentur, Ort“ (leere Teile fallen weg). */
export function vertriebLeadText(l: { name?: string | null; company?: string | null; city?: string | null; zip?: string | null }): string {
  const name = l.name?.trim() || null;
  const company = l.company?.trim() || null;
  const ort = l.city?.trim() || l.zip?.trim() || null;
  return [name, company && company !== name ? company : null, ort].filter(Boolean).join(", ") || "ohne Namen";
}

/** Alte Adresse der Kontaktakte: sendToAdmins leitet Admins mit neuer Oberfläche auf /admin/neu/vertrieb/kontakte/<id>. */
export const kontaktAdresse = (contactId: string) => `/admin/neu/vertrieb/kontakte/${contactId}`;

export function telegramAn(): string | null {
  const schalter = (process.env.VERTRIEB_LEAD_TELEGRAM ?? "").trim().toLowerCase();
  if (["aus", "0", "false", "off", "nein"].includes(schalter)) return null;
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_ADMIN_USER_ID) return null;
  return process.env.TELEGRAM_ADMIN_USER_ID;
}

export async function meldeVertriebLead(l: { contactId: string; name?: string | null; company?: string | null; city?: string | null; zip?: string | null }) {
  const body = vertriebLeadText(l);
  const url = kontaktAdresse(l.contactId);
  await sendToAdmins({ title: VERTRIEB_LEAD_TITEL, body, url, tag: `vertrieb-lead:${l.contactId}` }).catch((err) =>
    reportError(err, "vertrieb-lead-push", { contact: l.contactId }),
  );
  const chatId = telegramAn();
  if (!chatId) return;
  let link = "";
  try {
    link = `\n<a href="${escapeHtml(`${getAppUrl()}/admin/neu/vertrieb/kontakte/${l.contactId}`)}">Kontakt öffnen</a>`;
  } catch {
    link = "";
  }
  await sendTelegramText({ chatId, text: `<b>${VERTRIEB_LEAD_TITEL}</b>\n${escapeHtml(body)}${link}` }).catch((err) =>
    reportError(err, "vertrieb-lead-telegram", { contact: l.contactId }),
  );
}
