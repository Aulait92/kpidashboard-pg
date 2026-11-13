// Eigenes Postfach eines Logins (Ole, 13.11.2026): E-Mails an Leads direkt aus der App,
// gesendet über Google (Gmail-API), Microsoft (Graph) oder SMTP. Gesendete Mails liegen im
// Gesendet-Ordner des Vermittlers. Die Anmeldung nutzt die Rücksprung-Adressen der
// Kalender-Anbindung (state „mail:…“ unterscheidet), damit keine neue Adresse nötig ist.

import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptNullable, encryptNullable } from "@/lib/encryption";

export type MailProvider = "google" | "microsoft" | "smtp";
export const PROVIDER_LABEL: Record<MailProvider, string> = { google: "Google (Gmail)", microsoft: "Microsoft (Outlook)", smtp: "SMTP" };

export const GOOGLE_MAIL_SCOPE = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.send";
export const MICROSOFT_MAIL_SCOPE = "offline_access User.Read Mail.Send";

// ─── state: an den Login gebunden und signiert ──────────────────────────

const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const sig = (v: string) => crypto.createHmac("sha256", secret()).update(`mail:${v}`).digest("base64url").slice(0, 32);
export const mailState = (userId: string) => `mail:${userId}.${sig(userId)}`;
export const isMailState = (state: string | null | undefined) => !!state && state.startsWith("mail:");
/** userId aus dem state, nur wenn die Signatur stimmt. */
export function userFromMailState(state: string): string | null {
  const m = /^mail:([^.]+)\.(.+)$/.exec(state);
  if (!m) return null;
  const a = Buffer.from(sig(m[1]));
  const b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

// ─── OAuth-Konfiguration (wie Kalender) ─────────────────────────────────

function google() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google-Anmeldung ist nicht eingerichtet.");
  return { clientId, clientSecret, redirectUri };
}
function microsoft() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  const tenant = process.env.MICROSOFT_TENANT ?? "common";
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Microsoft-Anmeldung ist nicht eingerichtet.");
  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
  };
}
export const googleMailAvailable = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
export const microsoftMailAvailable = () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_REDIRECT_URI);

export function googleMailAuthUrl(userId: string, loginHint?: string | null): string {
  const g = google();
  const p = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: g.redirectUri,
    response_type: "code",
    scope: GOOGLE_MAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: mailState(userId),
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export function microsoftMailAuthUrl(userId: string, loginHint?: string | null): string {
  const m = microsoft();
  const p = new URLSearchParams({
    client_id: m.clientId,
    redirect_uri: m.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_MAIL_SCOPE,
    prompt: "select_account",
    state: mailState(userId),
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `${m.authorizeUrl}?${p}`;
}

type TokenJson = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function postForm(url: string, body: Record<string, string>): Promise<TokenJson> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const json = (await res.json().catch(() => ({}))) as TokenJson;
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || `Anmeldung fehlgeschlagen (${res.status})`);
  return json;
}

async function owner(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { customerId: true, displayName: true } });
  if (!u?.customerId) throw new Error("Login nicht gefunden.");
  return u;
}

/** Google: Code tauschen, Absender-Adresse lesen, verschlüsselt speichern. */
export async function googleMailExchange(code: string, userId: string): Promise<void> {
  const g = google();
  const t = await postForm("https://oauth2.googleapis.com/token", {
    code,
    client_id: g.clientId,
    client_secret: g.clientSecret,
    redirect_uri: g.redirectUri,
    grant_type: "authorization_code",
  });
  if (!(t.scope ?? "").includes("gmail.send")) throw new Error("Bitte beim Anmelden das Senden von E-Mails erlauben.");
  const info = (await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } })).json().catch(() => ({}))) as { email?: string };
  if (!info.email) throw new Error("E-Mail-Adresse konnte nicht gelesen werden.");
  await store(userId, "google", info.email, t);
}

/** Microsoft: Code tauschen, Absender-Adresse lesen, verschlüsselt speichern. */
export async function microsoftMailExchange(code: string, userId: string): Promise<void> {
  const m = microsoft();
  const t = await postForm(m.tokenUrl, {
    code,
    client_id: m.clientId,
    client_secret: m.clientSecret,
    redirect_uri: m.redirectUri,
    grant_type: "authorization_code",
    scope: MICROSOFT_MAIL_SCOPE,
  });
  const me = (await (await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${t.access_token}` } })).json().catch(() => ({}))) as {
    mail?: string | null;
    userPrincipalName?: string;
  };
  const email = me.mail || me.userPrincipalName;
  if (!email) throw new Error("E-Mail-Adresse konnte nicht gelesen werden.");
  await store(userId, "microsoft", email, t);
}

async function store(userId: string, provider: "google" | "microsoft", email: string, t: TokenJson) {
  const u = await owner(userId);
  const data = {
    customerId: u.customerId!,
    provider,
    email: email.toLowerCase(),
    fromName: u.displayName ?? null,
    accessTokenEnc: encryptNullable(t.access_token),
    refreshTokenEnc: encryptNullable(t.refresh_token),
    expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000),
    smtpHost: null,
    smtpPort: null,
    smtpUser: null,
    smtpPassEnc: null,
    status: "ok",
    lastError: null,
  };
  await prisma.mailConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

// ─── SMTP ───────────────────────────────────────────────────────────────

export type SmtpInput = { email: string; fromName?: string | null; host: string; port: number; user: string; password: string };

function smtpTransport(c: { host: string; port: number; user: string; password: string }) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** SMTP prüfen (Anmeldung beim Server) und speichern. */
export async function saveSmtp(userId: string, input: SmtpInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Bitte eine gültige Absender-Adresse angeben." };
  const host = input.host.trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return { ok: false, error: "Bitte den SMTP-Server angeben (z. B. smtp.ionos.de)." };
  if (![25, 465, 587, 2525].includes(input.port)) return { ok: false, error: "Port bitte 465 oder 587." };
  if (!input.user.trim() || !input.password) return { ok: false, error: "Benutzername und Passwort angeben." };
  try {
    await smtpTransport({ host, port: input.port, user: input.user.trim(), password: input.password }).verify();
  } catch (err) {
    return { ok: false, error: `Anmeldung beim Mailserver fehlgeschlagen: ${err instanceof Error ? err.message.slice(0, 160) : "unbekannter Fehler"}` };
  }
  const u = await owner(userId);
  const data = {
    customerId: u.customerId!,
    provider: "smtp",
    email,
    fromName: input.fromName?.trim() || u.displayName || null,
    accessTokenEnc: null,
    refreshTokenEnc: null,
    expiresAt: null,
    smtpHost: host,
    smtpPort: input.port,
    smtpUser: input.user.trim(),
    smtpPassEnc: encryptNullable(input.password),
    status: "ok",
    lastError: null,
  };
  await prisma.mailConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return { ok: true };
}

// ─── Senden ─────────────────────────────────────────────────────────────

export type MailAttachment = { fileName: string; contentType: string; data: Buffer };
export type OutgoingMail = { to: string; subject: string; text: string; attachments?: MailAttachment[] };

type Conn = NonNullable<Awaited<ReturnType<typeof prisma.mailConnection.findUnique>>>;

async function accessToken(c: Conn): Promise<string> {
  const current = decryptNullable(c.accessTokenEnc);
  if (current && c.expiresAt && c.expiresAt.getTime() > Date.now()) return current;
  const refresh = decryptNullable(c.refreshTokenEnc);
  if (!refresh) throw new Error("Bitte das Postfach neu verbinden.");
  const t =
    c.provider === "google"
      ? await postForm("https://oauth2.googleapis.com/token", { refresh_token: refresh, client_id: google().clientId, client_secret: google().clientSecret, grant_type: "refresh_token" })
      : await postForm(microsoft().tokenUrl, {
          refresh_token: refresh,
          client_id: microsoft().clientId,
          client_secret: microsoft().clientSecret,
          grant_type: "refresh_token",
          scope: MICROSOFT_MAIL_SCOPE,
        });
  await prisma.mailConnection.update({
    where: { id: c.id },
    data: {
      accessTokenEnc: encryptNullable(t.access_token),
      ...(t.refresh_token ? { refreshTokenEnc: encryptNullable(t.refresh_token) } : {}),
      expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000),
    },
  });
  return t.access_token!;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");
const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap = (s: string) => s.replace(/.{1,76}/g, "$&\r\n").trimEnd();

/** RFC-822-Nachricht (für Gmail): Text als UTF-8, Anhänge als multipart/mixed. */
export function buildMime(from: { email: string; name: string | null }, m: OutgoingMail): string {
  const fromHeader = from.name ? `${encWord(from.name.replace(/"/g, ""))} <${from.email}>` : from.email;
  const head = [`From: ${fromHeader}`, `To: ${m.to}`, `Subject: ${encWord(m.subject)}`, "MIME-Version: 1.0"];
  const textPart = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(b64(m.text))];
  if (!m.attachments?.length) return [...head, ...textPart].join("\r\n");
  const boundary = `pg_${crypto.randomBytes(12).toString("hex")}`;
  const parts = [
    `--${boundary}`,
    ...textPart,
    ...m.attachments.flatMap((a) => [
      `--${boundary}`,
      `Content-Type: ${a.contentType}; name="${encWord(a.fileName)}"`,
      `Content-Disposition: attachment; filename="${encWord(a.fileName)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap(b64(a.data)),
    ]),
    `--${boundary}--`,
  ];
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
}

/** Über das Postfach des Logins senden. Fehler werden am Postfach vermerkt. */
export async function sendViaPostfach(userId: string, m: OutgoingMail): Promise<{ ok: true; from: string } | { ok: false; error: string }> {
  const c = await prisma.mailConnection.findUnique({ where: { userId } });
  if (!c) return { ok: false, error: "Noch kein Postfach verbunden." };
  try {
    if (c.provider === "smtp") {
      await smtpTransport({ host: c.smtpHost!, port: c.smtpPort!, user: c.smtpUser!, password: decryptNullable(c.smtpPassEnc) ?? "" }).sendMail({
        from: c.fromName ? { name: c.fromName, address: c.email } : c.email,
        to: m.to,
        subject: m.subject,
        text: m.text,
        attachments: m.attachments?.map((a) => ({ filename: a.fileName, content: a.data, contentType: a.contentType })),
      });
    } else if (c.provider === "google") {
      const token = await accessToken(c);
      const raw = Buffer.from(buildMime({ email: c.email, name: c.fromName }, m)).toString("base64url");
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) throw new Error(`Gmail: ${(await res.text()).slice(0, 200)}`);
    } else {
      const token = await accessToken(c);
      const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: m.subject,
            body: { contentType: "Text", content: m.text },
            toRecipients: [{ emailAddress: { address: m.to } }],
            attachments: (m.attachments ?? []).map((a) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: a.fileName,
              contentType: a.contentType,
              contentBytes: b64(a.data),
            })),
          },
          saveToSentItems: true,
        }),
      });
      if (!res.ok) throw new Error(`Outlook: ${(await res.text()).slice(0, 200)}`);
    }
    if (c.status !== "ok") await prisma.mailConnection.update({ where: { id: c.id }, data: { status: "ok", lastError: null } });
    return { ok: true, from: c.email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Senden fehlgeschlagen.";
    await prisma.mailConnection.update({ where: { id: c.id }, data: { status: "error", lastError: msg.slice(0, 300) } }).catch(() => {});
    return { ok: false, error: `Senden hat nicht geklappt: ${msg.slice(0, 200)}` };
  }
}

export async function postfachOf(userId: string | null | undefined) {
  if (!userId) return null;
  const c = await prisma.mailConnection.findUnique({ where: { userId }, select: { provider: true, email: true, fromName: true, status: true, lastError: true } });
  return c ? { ...c, provider: c.provider as MailProvider } : null;
}
