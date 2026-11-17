// Versand-Postfach für Pay-per-Lead-Mails an Pivacom (HvK), Ole, 17.11.2026: Pivacom lehnt UTF-8 ab, und Resend
// (API wie SMTP) schreibt den Zeichensatz unserer ISO-8859-1-Mail auf utf-8 um. Der alte Zapier-Zap hat erfolgreich
// über Microsoft 365 aus leads@performancegrowth.de gesendet. Deshalb gehen Mails an PPL_LATIN1_DOMAINS über dieses
// Postfach: Microsoft Graph, delegiert (Mail.Send, Mail.Send.Shared), POST /users/{postfach}/sendMail mit der
// kompletten MIME-Mail aus latin1Mail (base64, Content-Type text/plain). So übernimmt Exchange den Zeichensatz.
//
// Anmelden kann sich das Postfach selbst (leads@…) oder ein Konto mit „Senden als“-Recht darauf (Mail.Send.Shared).
// Verbinden: Admin → Pay-per-Lead → HvK-Abrechnungen → „Versand-Postfach verbinden“ (/api/admin/ppl-versand/verbinden).
// Rücksprung über die bestehende MICROSOFT_REDIRECT_URI (state „pplversand:…“), Callback api/microsoft/callback.
// Speicherung wie das HvK-Abrechnungs-Postfach (AdminMailbox, purpose „ppl-versand“, Tokens verschlüsselt);
// lastCheckAt = zuletzt erfolgreich gesendet.
//
// PPL_VERSAND_FORMAT=json schickt statt der MIME-Mail eine normale Graph-Nachricht (wie der Zap; Exchange wählt
// dann den Zeichensatz). Nur als Ausweg, falls Exchange die MIME-Mail doch umschreibt.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptNullable, encryptNullable } from "@/lib/encryption";
import { microsoft, postForm } from "@/lib/ppl/hvk-mail";
import { latin1Mail, zuLatin1 } from "@/lib/mail/latin1";
import { mailAllowed } from "@/lib/mail-guard";

export const PPL_VERSAND_PURPOSE = "ppl-versand";
export const PPL_VERSAND_SCOPE = "offline_access User.Read Mail.Send Mail.Send.Shared";
export const versandPostfach = () => (process.env.PPL_VERSAND_POSTFACH?.trim() || "leads@performancegrowth.de").toLowerCase();
export const versandFormat = (): "mime" | "json" => (process.env.PPL_VERSAND_FORMAT?.trim().toLowerCase() === "json" ? "json" : "mime");
const GRAPH = "https://graph.microsoft.com/v1.0";

// ─── state: an den Admin-Login gebunden und signiert ────────────────────

const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const sig = (v: string) => crypto.createHmac("sha256", secret()).update(`pplversand:${v}`).digest("base64url").slice(0, 32);
export const versandState = (userId: string) => `pplversand:${userId}.${sig(userId)}`;
export const isVersandState = (state: string | null | undefined) => !!state && state.startsWith("pplversand:");
export function userFromVersandState(state: string): string | null {
  const m = /^pplversand:([^.]+)\.(.+)$/.exec(state);
  if (!m) return null;
  const a = Buffer.from(sig(m[1]));
  const b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

export function versandAuthUrl(userId: string): string {
  const m = microsoft();
  const p = new URLSearchParams({
    client_id: m.clientId,
    redirect_uri: m.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: PPL_VERSAND_SCOPE,
    prompt: "select_account",
    login_hint: versandPostfach(),
    state: versandState(userId),
  });
  return `${m.authorizeUrl}?${p}`;
}

/** Code tauschen, Recht prüfen (Mail.Send, bei fremdem Konto Mail.Send.Shared), Tokens verschlüsselt speichern. */
export async function versandExchange(code: string, userId: string): Promise<void> {
  const m = microsoft();
  const t = await postForm(m.tokenUrl, { code, client_id: m.clientId, client_secret: m.clientSecret, redirect_uri: m.redirectUri, grant_type: "authorization_code", scope: PPL_VERSAND_SCOPE });
  const me = (await (await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json().catch(() => ({}))) as {
    mail?: string | null;
    userPrincipalName?: string;
  };
  const email = (me.mail || me.userPrincipalName || "").toLowerCase();
  if (!email) throw new Error("Konto unbekannt (Microsoft hat keine Adresse geliefert).");
  const granted = t.scope ?? "";
  // Microsoft liefert die Rechte als Liste, ggf. mit „https://graph.microsoft.com/“ davor
  const hat = (recht: string) => granted.split(/\s+/).some((s) => s.split("/").pop()?.toLowerCase() === recht.toLowerCase());
  if (!hat("Mail.Send")) throw new Error("Bitte beim Anmelden das Senden von E-Mails erlauben (Mail.Send).");
  if (email !== versandPostfach() && !hat("Mail.Send.Shared")) throw new Error("Bitte beim Anmelden das Senden als anderes Postfach erlauben (Mail.Send.Shared).");
  const data = {
    provider: "microsoft",
    email,
    accessTokenEnc: encryptNullable(t.access_token),
    refreshTokenEnc: encryptNullable(t.refresh_token),
    expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000),
    scope: granted || PPL_VERSAND_SCOPE,
    status: "ok",
    lastError: null,
    connectedById: userId,
  };
  await prisma.adminMailbox.upsert({ where: { purpose: PPL_VERSAND_PURPOSE }, create: { purpose: PPL_VERSAND_PURPOSE, ...data }, update: data });
}

/** Stand für den Admin: angemeldetes Konto (email), Fehler, zuletzt gesendet (lastCheckAt). */
export async function versandPostfachStatus() {
  return prisma.adminMailbox.findUnique({ where: { purpose: PPL_VERSAND_PURPOSE }, select: { email: true, status: true, lastError: true, lastCheckAt: true, updatedAt: true } });
}

/** Ist das Versand-Postfach verbunden (Tokens vorhanden)? Fehler beim Lesen gelten als „nicht verbunden“. */
export async function versandPostfachVerbunden(): Promise<boolean> {
  const c = await prisma.adminMailbox.findUnique({ where: { purpose: PPL_VERSAND_PURPOSE }, select: { refreshTokenEnc: true, accessTokenEnc: true } }).catch(() => null);
  return !!(c?.refreshTokenEnc || c?.accessTokenEnc);
}

async function accessToken(force = false): Promise<string> {
  const c = await prisma.adminMailbox.findUnique({ where: { purpose: PPL_VERSAND_PURPOSE } });
  if (!c) throw new Error("Versand-Postfach nicht verbunden.");
  const current = decryptNullable(c.accessTokenEnc);
  if (!force && current && c.expiresAt && c.expiresAt.getTime() > Date.now()) return current;
  const refresh = decryptNullable(c.refreshTokenEnc);
  if (!refresh) throw new Error("Versand-Postfach bitte neu verbinden.");
  const m = microsoft();
  try {
    const t = await postForm(m.tokenUrl, { refresh_token: refresh, client_id: m.clientId, client_secret: m.clientSecret, grant_type: "refresh_token", scope: PPL_VERSAND_SCOPE });
    await prisma.adminMailbox.update({
      where: { id: c.id },
      data: {
        accessTokenEnc: encryptNullable(t.access_token),
        ...(t.refresh_token ? { refreshTokenEnc: encryptNullable(t.refresh_token) } : {}),
        expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000),
      },
    });
    return t.access_token!;
  } catch (err) {
    await markError(err);
    throw err;
  }
}

async function markError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  await prisma.adminMailbox.updateMany({ where: { purpose: PPL_VERSAND_PURPOSE }, data: { status: "error", lastError: msg.slice(0, 300) } }).catch(() => {});
}

export type VersandMail = { to: string; subject: string; text: string; replyTo?: string | null };

/** Anfrage an Graph (rein, getestet): MIME (base64, text/plain) oder JSON-Nachricht. */
export function sendMailRequest(mail: VersandMail, opts: { postfach?: string; format?: "mime" | "json"; date?: Date; messageId?: string } = {}): { url: string; contentType: string; body: string } {
  const postfach = opts.postfach ?? versandPostfach();
  const url = `${GRAPH}/users/${encodeURIComponent(postfach)}/sendMail`;
  if ((opts.format ?? versandFormat()) === "json") {
    const message = {
      subject: zuLatin1(mail.subject),
      body: { contentType: "Text", content: zuLatin1(mail.text) },
      from: { emailAddress: { address: postfach } },
      toRecipients: [{ emailAddress: { address: mail.to } }],
      ...(mail.replyTo ? { replyTo: [{ emailAddress: { address: mail.replyTo } }] } : {}),
    };
    return { url, contentType: "application/json", body: JSON.stringify({ message, saveToSentItems: true }) };
  }
  const raw = latin1Mail({ from: `performancegrowth <${postfach}>`, to: mail.to, subject: mail.subject, text: mail.text, replyTo: mail.replyTo, date: opts.date, messageId: opts.messageId });
  return { url, contentType: "text/plain", body: raw.toString("base64") };
}

/**
 * Latin-1-Mail über das Versand-Postfach senden. Beachtet MAIL_NUR_AN (Testumgebung). Wirft nicht.
 * Bei 401 einmal mit frischem Token wiederholen.
 */
export async function sendViaVersandPostfach(mail: VersandMail): Promise<{ ok: boolean; error?: string; blocked?: boolean }> {
  if (!mailAllowed(mail.to)) {
    console.warn(`[mail-sperre] nicht gesendet (Versand-Postfach): „${mail.subject}“`);
    return { ok: true, blocked: true };
  }
  try {
    const req = sendMailRequest(mail);
    let res: Response | null = null;
    for (const force of [false, true]) {
      const token = await accessToken(force);
      res = await fetch(req.url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": req.contentType }, body: req.body, signal: AbortSignal.timeout(20_000) });
      if (res.status !== 401) break;
    }
    if (!res!.ok) {
      const err = new Error(`Versand-Postfach ${versandPostfach()}: ${res!.status} ${(await res!.text().catch(() => "")).slice(0, 200)}`);
      await markError(err);
      return { ok: false, error: err.message };
    }
    await prisma.adminMailbox.updateMany({ where: { purpose: PPL_VERSAND_PURPOSE }, data: { lastCheckAt: new Date(), status: "ok", lastError: null } }).catch(() => {});
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.startsWith("Versand-Postfach") ? msg : `Versand-Postfach: ${msg}` };
  }
}

/** Testmail mit Umlauten (Ole prüft in Outlook „Quelle anzeigen“: charset=ISO-8859-1). */
export function testMail(to: string): VersandMail {
  return {
    to,
    subject: "Testmail Zeichensatz: Geprüft, Größe, Straße",
    text: [
      "Testmail aus dem Versand-Postfach für Pay-per-Lead (Pivacom).",
      "",
      "Geprüft: ja",
      "Größe: 5",
      "Straße: Müllerstraße 1",
      "Umlaute: ä ö ü Ä Ö Ü ß",
      "",
      `Erwartet in der Quelle: Content-Type: text/plain; charset=ISO-8859-1 (Versandart: ${versandFormat() === "json" ? "Graph-Nachricht" : "MIME"}).`,
    ].join("\n"),
  };
}
