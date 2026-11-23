// Eigenes Postfach je Admin für E-Mails aus der Kontaktakte (Ole, 23.11.2026: „ich möchte meine email verbinden
// können und auch emails mit templates aus dem crm versenden können“). Gesendet wird als der Admin selbst
// (Microsoft Graph /me/sendMail bzw. Gmail-API), die Mail liegt danach in seinem Gesendet-Ordner.
//
// Speicherung wie die übrigen Admin-Postfächer: AdminMailbox mit purpose „crm:<userId>“, Tokens verschlüsselt
// (lib/encryption). Anmeldung über die bestehenden Rücksprung-Adressen (MICROSOFT_REDIRECT_URI bzw.
// GOOGLE_REDIRECT_URI) mit state „crmmail:…“ (an den Admin-Login gebunden und signiert), damit keine neue Adresse in
// den App-Registrierungen nötig ist. Verbinden: Einstellungen → Anbindungen → „E-Mail-Postfach“ oder direkt im
// E-Mail-Fenster der Kontaktakte (/api/admin/crm-postfach/verbinden?anbieter=microsoft|google).
//
// Microsoft: Rechte offline_access, User.Read, Mail.Send (wie beim Postfach der Vermittler und dem PPL-Versand).
// Verlangt der Tenant eine Admin-Freigabe, hilft der Link aus lib/microsoft-admin-consent.ts.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptNullable, encryptNullable } from "@/lib/encryption";
import { microsoft, postForm, type TokenJson } from "@/lib/ppl/hvk-mail";
import { GOOGLE_MAIL_SCOPE, MICROSOFT_MAIL_SCOPE, buildMime, friendlySendError, google, googleMailAvailable, microsoftMailAvailable } from "@/lib/mail/postfach";
import { mailAllowed } from "@/lib/mail-guard";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";

export type CrmAnbieter = "microsoft" | "google";
export const CRM_ANBIETER_LABEL: Record<CrmAnbieter, string> = { microsoft: "Microsoft 365 (Outlook)", google: "Google (Gmail)" };
export const crmPurpose = (userId: string) => `crm:${userId}`;
export const crmAnbieterVerfuegbar = (): CrmAnbieter[] => [...(microsoftMailAvailable() ? (["microsoft"] as const) : []), ...(googleMailAvailable() ? (["google"] as const) : [])];
const GRAPH = "https://graph.microsoft.com/v1.0";

// ─── state: an den Admin-Login gebunden und signiert ────────────────────

const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const sig = (v: string) => crypto.createHmac("sha256", secret()).update(`crmmail:${v}`).digest("base64url").slice(0, 32);
export const crmState = (userId: string) => `crmmail:${userId}.${sig(userId)}`;
export const isCrmState = (state: string | null | undefined) => !!state && state.startsWith("crmmail:");
/** userId aus dem state, nur wenn die Signatur stimmt. */
export function userFromCrmState(state: string): string | null {
  const m = /^crmmail:([^.]+)\.(.+)$/.exec(state);
  if (!m) return null;
  const a = Buffer.from(sig(m[1]));
  const b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

export function crmAuthUrl(anbieter: CrmAnbieter, userId: string, loginHint?: string | null): string {
  if (anbieter === "google") {
    const g = google();
    const p = new URLSearchParams({
      client_id: g.clientId,
      redirect_uri: g.redirectUri,
      response_type: "code",
      scope: GOOGLE_MAIL_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state: crmState(userId),
      ...(loginHint ? { login_hint: loginHint } : {}),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }
  const m = microsoft();
  const p = new URLSearchParams({
    client_id: m.clientId,
    redirect_uri: m.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_MAIL_SCOPE,
    prompt: "select_account",
    state: crmState(userId),
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `${m.authorizeUrl}?${p}`;
}

/** Hat der Anbieter das Senden erlaubt? Microsoft liefert die Rechte ggf. mit „https://graph.microsoft.com/“ davor. */
export function sendenErlaubt(anbieter: CrmAnbieter, scope: string | undefined): boolean {
  const teile = (scope ?? "").split(/\s+/).map((s) => s.split("/").pop()?.toLowerCase() ?? "");
  return anbieter === "google" ? teile.includes("gmail.send") : teile.includes("mail.send");
}

/** Code tauschen, Senderecht prüfen, Absender-Adresse lesen, Tokens verschlüsselt speichern. */
export async function crmExchange(anbieter: CrmAnbieter, code: string, userId: string): Promise<string> {
  let t: TokenJson;
  let email = "";
  if (anbieter === "google") {
    const g = google();
    t = await postForm("https://oauth2.googleapis.com/token", { code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: g.redirectUri, grant_type: "authorization_code" });
    const info = (await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } })).json().catch(() => ({}))) as { email?: string };
    email = info.email ?? "";
  } else {
    const m = microsoft();
    t = await postForm(m.tokenUrl, { code, client_id: m.clientId, client_secret: m.clientSecret, redirect_uri: m.redirectUri, grant_type: "authorization_code", scope: MICROSOFT_MAIL_SCOPE });
    const me = (await (await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json().catch(() => ({}))) as {
      mail?: string | null;
      userPrincipalName?: string;
    };
    email = me.mail || me.userPrincipalName || "";
    // Microsoft nennt die Rechte nicht immer in der Antwort; dann gilt das angefragte Recht als erteilt
    if (!t.scope) t.scope = MICROSOFT_MAIL_SCOPE;
  }
  if (!sendenErlaubt(anbieter, t.scope)) throw new Error("Bitte beim Anmelden das Senden von E-Mails erlauben.");
  email = email.trim().toLowerCase();
  if (!email) throw new Error("E-Mail-Adresse konnte nicht gelesen werden.");
  const data = {
    provider: anbieter,
    email,
    accessTokenEnc: encryptNullable(t.access_token),
    refreshTokenEnc: encryptNullable(t.refresh_token),
    expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000),
    scope: t.scope ?? null,
    status: "ok",
    lastError: null,
    connectedById: userId,
  };
  const purpose = crmPurpose(userId);
  await prisma.adminMailbox.upsert({ where: { purpose }, create: { purpose, ...data }, update: data });
  return email;
}

export type CrmPostfach = { provider: CrmAnbieter; email: string; status: string; lastError: string | null; lastCheckAt: Date | null };

/** Verbundenes Postfach des Admins (ohne Tokens), null = keins. */
export async function crmPostfachVon(userId: string): Promise<CrmPostfach | null> {
  const c = await prisma.adminMailbox
    .findUnique({ where: { purpose: crmPurpose(userId) }, select: { provider: true, email: true, status: true, lastError: true, lastCheckAt: true, refreshTokenEnc: true, accessTokenEnc: true } })
    .catch(() => null);
  if (!c || !(c.refreshTokenEnc || c.accessTokenEnc)) return null;
  return { provider: c.provider === "google" ? "google" : "microsoft", email: c.email, status: c.status, lastError: c.lastError, lastCheckAt: c.lastCheckAt };
}

/** Postfach trennen: Tokens löschen (beim Anbieter bleibt die Freigabe, bis man sie dort entfernt). */
export async function crmPostfachTrennen(userId: string): Promise<void> {
  await prisma.adminMailbox.deleteMany({ where: { purpose: crmPurpose(userId) } });
}

type Zeile = NonNullable<Awaited<ReturnType<typeof prisma.adminMailbox.findUnique>>>;

/** Gültiges Zugangstoken (bei Ablauf oder `force` per Refresh-Token erneuern und verschlüsselt speichern). */
export async function crmAccessToken(c: Zeile, force = false): Promise<string> {
  const current = decryptNullable(c.accessTokenEnc);
  if (!force && current && c.expiresAt && c.expiresAt.getTime() > Date.now()) return current;
  const refresh = decryptNullable(c.refreshTokenEnc);
  if (!refresh) throw new Error("invalid_grant: Bitte das Postfach neu verbinden.");
  const t =
    c.provider === "google"
      ? await postForm("https://oauth2.googleapis.com/token", { refresh_token: refresh, client_id: google().clientId, client_secret: google().clientSecret, grant_type: "refresh_token" })
      : await postForm(microsoft().tokenUrl, { refresh_token: refresh, client_id: microsoft().clientId, client_secret: microsoft().clientSecret, grant_type: "refresh_token", scope: MICROSOFT_MAIL_SCOPE });
  await prisma.adminMailbox.update({
    where: { id: c.id },
    data: {
      accessTokenEnc: encryptNullable(t.access_token),
      ...(t.refresh_token ? { refreshTokenEnc: encryptNullable(t.refresh_token) } : {}),
      expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000),
    },
  });
  return t.access_token!;
}

/** Fehler der Anbieter in einen Satz für den Admin übersetzen (Rohtext bleibt in lastError). */
export function crmSendFehler(msg: string): string {
  if (/invalid_grant|401|unauthenticated|InvalidAuthenticationToken|neu verbinden/i.test(msg)) return "Die Anmeldung beim Postfach ist abgelaufen. Bitte das Postfach neu verbinden.";
  if (/AADSTS65001|consent/i.test(msg)) return "Microsoft verlangt eine Freigabe durch die IT. Bitte unter Einstellungen → Anbindungen die Microsoft-Freigabe öffnen.";
  return friendlySendError(msg);
}

export type CrmSendErgebnis = { ok: true; from: string } | { ok: false; error: string; keinPostfach?: boolean };

/**
 * Text-Mail über das Postfach des Admins senden. Beachtet MAIL_NUR_AN (Testumgebung) und entfernt Gedankenstriche.
 * Wirft nicht. Microsoft: bei 401 einmal mit frischem Token wiederholen.
 */
export async function sendViaCrmPostfach(userId: string, m: { to: string; subject: string; text: string }): Promise<CrmSendErgebnis> {
  const c = await prisma.adminMailbox.findUnique({ where: { purpose: crmPurpose(userId) } });
  if (!c || !(c.refreshTokenEnc || c.accessTokenEnc)) return { ok: false, error: "Noch kein Postfach verbunden.", keinPostfach: true };
  if (!mailAllowed(m.to)) return { ok: false, error: "Testumgebung: An diese Adresse wird nicht gesendet (MAIL_NUR_AN)." };
  const mail = { to: m.to, subject: ohneGedankenstriche(m.subject), text: ohneGedankenstriche(m.text) };
  try {
    let res: Response | null = null;
    for (const force of [false, true]) {
      const token = await crmAccessToken(c, force);
      if (c.provider === "google") {
        const raw = Buffer.from(buildMime({ email: c.email, name: null }, mail)).toString("base64url");
        res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(20_000),
        });
      } else {
        res = await fetch(`${GRAPH}/me/sendMail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: { subject: mail.subject, body: { contentType: "Text", content: mail.text }, toRecipients: [{ emailAddress: { address: mail.to } }] },
            saveToSentItems: true,
          }),
          signal: AbortSignal.timeout(20_000),
        });
      }
      if (res.status !== 401) break;
    }
    if (!res!.ok) throw new Error(`${c.provider === "google" ? "Gmail" : "Outlook"} ${res!.status}: ${(await res!.text().catch(() => "")).slice(0, 200)}`);
    await prisma.adminMailbox.update({ where: { id: c.id }, data: { status: "ok", lastError: null, lastCheckAt: new Date() } }).catch(() => {});
    return { ok: true, from: c.email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.adminMailbox.update({ where: { id: c.id }, data: { status: "error", lastError: msg.slice(0, 300) } }).catch(() => {});
    return { ok: false, error: `Senden hat nicht geklappt: ${crmSendFehler(msg)}` };
  }
}
