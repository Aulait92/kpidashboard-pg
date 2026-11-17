// Postfach für die HvK-Abrechnung (Ole, 16.11.2026): Die Mail „Neue Gutschrift“ von info@lead-production.de geht an
// ole.kannapinn@performancegrowth.de (Microsoft 365). Die App liest dieses Postfach nur (Microsoft Graph, delegiert,
// Recht Mail.Read): Mails suchen und den PDF-Anhang laden. Kein Senden, Verschieben, Löschen oder „gelesen“ setzen.
//
// Verbinden: Admin → Pay-per-Lead → HvK-Abrechnungen → „Postfach verbinden“ (/api/admin/hvk-abrechnung/verbinden).
// Rücksprung über die bestehende Microsoft-Rücksprung-Adresse (MICROSOFT_REDIRECT_URI, state „hvkmail:…“), damit in
// Azure keine neue Adresse eingetragen werden muss. Nur das erwartete Postfach (HVK_MAILBOX) wird angenommen.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptNullable, encryptNullable } from "@/lib/encryption";
import { HVK_SENDER, HVK_SUBJECT } from "@/lib/ppl/hvk-abrechnung";

export const HVK_MAILBOX_PURPOSE = "hvk-abrechnung";
export const HVK_MAIL_SCOPE = "offline_access User.Read Mail.Read";
export const hvkMailbox = () => (process.env.HVK_MAILBOX?.trim() || "ole.kannapinn@performancegrowth.de").toLowerCase();
const GRAPH = "https://graph.microsoft.com/v1.0";

// ─── state: an den Admin-Login gebunden und signiert ────────────────────

const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const sig = (v: string) => crypto.createHmac("sha256", secret()).update(`hvkmail:${v}`).digest("base64url").slice(0, 32);
export const hvkMailState = (userId: string) => `hvkmail:${userId}.${sig(userId)}`;
export const isHvkMailState = (state: string | null | undefined) => !!state && state.startsWith("hvkmail:");
export function userFromHvkMailState(state: string): string | null {
  const m = /^hvkmail:([^.]+)\.(.+)$/.exec(state);
  if (!m) return null;
  const a = Buffer.from(sig(m[1]));
  const b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

/** App-Daten der Microsoft-Anmeldung (auch für das PPL-Versand-Postfach, lib/ppl/versand-postfach.ts). */
export function microsoft() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  const tenant = process.env.MICROSOFT_TENANT ?? "common";
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Microsoft-Anmeldung ist nicht eingerichtet (MICROSOFT_CLIENT_ID/SECRET/REDIRECT_URI).");
  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
  };
}
export const hvkMailAvailable = () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_REDIRECT_URI);

export function hvkMailAuthUrl(userId: string): string {
  const m = microsoft();
  const p = new URLSearchParams({
    client_id: m.clientId,
    redirect_uri: m.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: HVK_MAIL_SCOPE,
    prompt: "select_account",
    login_hint: hvkMailbox(),
    state: hvkMailState(userId),
  });
  return `${m.authorizeUrl}?${p}`;
}

export type TokenJson = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

export async function postForm(url: string, body: Record<string, string>): Promise<TokenJson> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const json = (await res.json().catch(() => ({}))) as TokenJson;
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || `Anmeldung fehlgeschlagen (${res.status})`);
  return json;
}

/** Code tauschen, Postfach prüfen (nur HVK_MAILBOX, Recht Mail.Read), Tokens verschlüsselt speichern. */
export async function hvkMailExchange(code: string, userId: string): Promise<void> {
  const m = microsoft();
  const t = await postForm(m.tokenUrl, { code, client_id: m.clientId, client_secret: m.clientSecret, redirect_uri: m.redirectUri, grant_type: "authorization_code", scope: HVK_MAIL_SCOPE });
  if (!/\bMail\.Read\b/i.test(t.scope ?? "")) throw new Error("Bitte beim Anmelden das Lesen von E-Mails erlauben (Mail.Read).");
  const me = (await (await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json().catch(() => ({}))) as {
    mail?: string | null;
    userPrincipalName?: string;
  };
  const email = (me.mail || me.userPrincipalName || "").toLowerCase();
  if (email !== hvkMailbox()) throw new Error(`Falsches Postfach (${email || "unbekannt"}). Bitte mit ${hvkMailbox()} anmelden.`);
  const data = {
    provider: "microsoft",
    email,
    accessTokenEnc: encryptNullable(t.access_token),
    refreshTokenEnc: encryptNullable(t.refresh_token),
    expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000),
    scope: t.scope ?? HVK_MAIL_SCOPE,
    status: "ok",
    lastError: null,
    connectedById: userId,
  };
  await prisma.adminMailbox.upsert({ where: { purpose: HVK_MAILBOX_PURPOSE }, create: { purpose: HVK_MAILBOX_PURPOSE, ...data }, update: data });
}

export async function hvkMailboxStatus() {
  return prisma.adminMailbox.findUnique({ where: { purpose: HVK_MAILBOX_PURPOSE }, select: { email: true, status: true, lastError: true, lastCheckAt: true, updatedAt: true } });
}

async function accessToken(): Promise<string> {
  const c = await prisma.adminMailbox.findUnique({ where: { purpose: HVK_MAILBOX_PURPOSE } });
  if (!c) throw new Error("Postfach für die HvK-Abrechnung ist nicht verbunden.");
  const current = decryptNullable(c.accessTokenEnc);
  if (current && c.expiresAt && c.expiresAt.getTime() > Date.now()) return current;
  const refresh = decryptNullable(c.refreshTokenEnc);
  if (!refresh) throw new Error("Bitte das Postfach neu verbinden.");
  const m = microsoft();
  try {
    const t = await postForm(m.tokenUrl, { refresh_token: refresh, client_id: m.clientId, client_secret: m.clientSecret, grant_type: "refresh_token", scope: HVK_MAIL_SCOPE });
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
  await prisma.adminMailbox.updateMany({ where: { purpose: HVK_MAILBOX_PURPOSE }, data: { status: "error", lastError: msg.slice(0, 300) } }).catch(() => {});
}

async function graphGet<T>(url: string): Promise<T> {
  const token = await accessToken();
  const res = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = new Error(`Outlook: ${res.status} ${(await res.text()).slice(0, 200)}`);
    await markError(err);
    throw err;
  }
  return (await res.json()) as T;
}

export type GutschriftMail = { id: string; receivedAt: Date; subject: string };

/** Mails „Neue Gutschrift“ von Lead-Production seit `since` (älteste zuerst). Nur lesen. */
export async function listGutschriftMails(since: Date): Promise<GutschriftMail[]> {
  // $orderby braucht das Feld zuerst im $filter (Graph-Regel)
  const filter = `receivedDateTime ge ${since.toISOString()} and from/emailAddress/address eq '${HVK_SENDER}'`;
  let url: string | null = `/me/messages?${new URLSearchParams({ $filter: filter, $orderby: "receivedDateTime asc", $select: "id,subject,receivedDateTime,hasAttachments", $top: "50" })}`;
  const out: GutschriftMail[] = [];
  for (let page = 0; url && page < 20; page++) {
    const r: { value: { id: string; subject?: string; receivedDateTime: string; hasAttachments?: boolean }[]; "@odata.nextLink"?: string } = await graphGet(url);
    for (const m of r.value) {
      if (!m.hasAttachments || !(m.subject ?? "").toLowerCase().includes(HVK_SUBJECT.toLowerCase())) continue;
      out.push({ id: m.id, receivedAt: new Date(m.receivedDateTime), subject: m.subject ?? "" });
    }
    url = r["@odata.nextLink"] ?? null;
  }
  await prisma.adminMailbox.updateMany({ where: { purpose: HVK_MAILBOX_PURPOSE }, data: { lastCheckAt: new Date(), status: "ok", lastError: null } });
  return out;
}

/** PDF-Anhänge einer Mail (Name + Inhalt). */
export async function pdfAttachments(messageId: string): Promise<{ name: string; data: Uint8Array }[]> {
  const r = await graphGet<{ value: { "@odata.type"?: string; name?: string; contentType?: string; contentBytes?: string }[] }>(
    `/me/messages/${encodeURIComponent(messageId)}/attachments`,
  );
  return r.value
    .filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && a.contentBytes && (/pdf/i.test(a.contentType ?? "") || /\.pdf$/i.test(a.name ?? "")))
    .map((a) => ({ name: a.name ?? "Gutschrift.pdf", data: new Uint8Array(Buffer.from(a.contentBytes!, "base64")) }));
}
