import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "kpi_session";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 Tage

export type SessionPayload = {
  userId: string;
  email: string;
  role: "ADMIN" | "BUYER";
  customerId?: string;
};

function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "AUTH_SECRET muss gesetzt sein (mindestens 32 Zeichen, z.B. via `openssl rand -hex 32`).",
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE_SEC}s`)
    .sign(getSecret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SEC,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Bootstrap: wenn noch kein Admin-Account existiert und die eingegebenen
// Credentials zu ADMIN_EMAIL/ADMIN_PASSWORD passen, wird der Admin-User
// transparent angelegt. So braucht der Owner keinen Setup-Schritt.
async function bootstrapAdminIfNeeded(email: string, password: string) {
  const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envEmail || !envPassword) return null;
  if (email.toLowerCase() !== envEmail) return null;
  if (password !== envPassword) return null;

  const adminExists = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (adminExists) return null;

  return prisma.user.create({
    data: {
      email: envEmail,
      passwordHash: await hashPassword(envPassword),
      role: "ADMIN",
    },
  });
}

export type LoginResult =
  | { ok: true; payload: SessionPayload }
  | { ok: false; error: string; needsTotp?: false }
  | { ok: false; needsTotp: true; error?: undefined };

// ─── Zwei-Faktor-Login ──────────────────────────────────────────────────
// Nach korrektem Passwort und aktivem 2FA gibt es noch KEINE Sitzung, nur ein
// kurzlebiges Zwischen-Cookie (10 Min., max. 5 Versuche). Die Sitzung entsteht
// erst nach gültigem Code (oder Notfall-Code).
const TOTP_COOKIE = "kpi_2fa";
const TOTP_MAX_ATTEMPTS = 5;

async function setPendingTotp(userId: string, attempts: number) {
  const token = await new SignJWT({ userId, purpose: "2fa", attempts })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret());
  (await cookies()).set(TOTP_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
}

async function readPendingTotp(): Promise<{ userId: string; attempts: number } | null> {
  const token = (await cookies()).get(TOTP_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== "2fa" || typeof payload.userId !== "string") return null;
    return { userId: payload.userId, attempts: Number(payload.attempts ?? 0) };
  } catch {
    return null;
  }
}

/** Zweiter Schritt der Anmeldung: Code aus der Authenticator-App oder Notfall-Code. */
export async function completeTotpLogin(codeRaw: string): Promise<LoginResult> {
  const pending = await readPendingTotp();
  if (!pending) return { ok: false, error: "Bitte erneut mit E-Mail und Passwort anmelden." };
  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user?.totpEnabledAt || !user.totpSecretEnc) return { ok: false, error: "Bitte erneut anmelden." };
  const { decryptSecret } = await import("@/lib/encryption");
  const { hashBackupCode, verifyTotp } = await import("@/lib/totp");
  const code = codeRaw.trim();
  let ok = verifyTotp(decryptSecret(user.totpSecretEnc), code);
  if (!ok && code.replace(/[\s-]/g, "").length === 10) {
    const h = hashBackupCode(code);
    if (user.totpBackupCodes.includes(h)) {
      ok = true;
      // Notfall-Code ist danach verbraucht.
      await prisma.user.update({ where: { id: user.id }, data: { totpBackupCodes: user.totpBackupCodes.filter((x) => x !== h) } });
    }
  }
  if (!ok) {
    const attempts = pending.attempts + 1;
    if (attempts >= TOTP_MAX_ATTEMPTS) {
      (await cookies()).delete(TOTP_COOKIE);
      return { ok: false, error: "Zu viele falsche Codes. Bitte erneut anmelden." };
    }
    await setPendingTotp(user.id, attempts);
    return { ok: false, needsTotp: true };
  }
  (await cookies()).delete(TOTP_COOKIE);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const { audit } = await import("@/lib/audit");
  await audit("login.2fa", { entity: "User", entityId: user.id, customerId: user.customerId, actor: { id: user.id, email: user.email, role: user.role } });
  const payload: SessionPayload = { userId: user.id, email: user.email, role: user.role, customerId: user.customerId ?? undefined };
  await setSessionCookie(payload);
  return { ok: true, payload };
}

const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MIN = 15;

export async function login(
  emailRaw: string,
  password: string,
): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, error: "Email und Passwort erforderlich." };
  }

  // Erst Bootstrap-Pfad — legt ggf. den Admin an, falls noch keiner da ist.
  await bootstrapAdminIfNeeded(email, password);

  // Schutz gegen Durchprobieren: max. LOGIN_MAX_FAILS Fehlversuche je E-Mail
  // in LOGIN_WINDOW_MIN Minuten (gezählt im Änderungsprotokoll).
  const { audit } = await import("@/lib/audit");
  const recentFails = await prisma.auditLog.count({
    where: { action: "login.failed", actorEmail: email, at: { gt: new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000) } },
  });
  if (recentFails >= LOGIN_MAX_FAILS) {
    return { ok: false, error: `Zu viele Versuche. Bitte in ${LOGIN_WINDOW_MIN} Minuten erneut versuchen oder „Passwort vergessen“ nutzen.` };
  }
  const failed = async (): Promise<LoginResult> => {
    await audit("login.failed", { actor: { email, role: null } });
    return { ok: false, error: "Email oder Passwort falsch." };
  };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return failed();
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return failed();
  if (user.totpEnabledAt && user.totpSecretEnc) {
    await setPendingTotp(user.id, 0);
    return { ok: false, needsTotp: true };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await audit("login", { entity: "User", entityId: user.id, customerId: user.customerId, actor: { id: user.id, email: user.email, role: user.role } });

  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    customerId: user.customerId ?? undefined,
  };
  await setSessionCookie(payload);
  return { ok: true, payload };
}

export async function logout() {
  await clearSessionCookie();
}

// ─── Passwort-Reset ──────────────────────────────────────────────────

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 Stunde

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Erzeugt ein Reset-Token für den User (falls vorhanden). Schreibt nur den
// SHA-256-Hash in die DB; gibt den Klartext-Token nur einmal zurück, der
// dann in die Email kommt. Existiert der User nicht, gibt es kein Token —
// die UI muss trotzdem generisch antworten (Existenz nicht verraten).
export async function issuePasswordResetToken(
  emailRaw: string,
  ttlMs: number = RESET_TOKEN_TTL_MS,
): Promise<{ rawToken: string; userId: string } | null> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return null;

  // Alte, ungenutzte Tokens dieses Users entwerten, um Token-Sammelei
  // zu verhindern.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const rawToken = crypto.randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return { rawToken, userId: user.id };
}

export type ResetResult =
  | { ok: true }
  | { ok: false; error: string };

export async function consumePasswordResetToken(
  rawToken: string,
  newPassword: string,
): Promise<ResetResult> {
  if (!rawToken) return { ok: false, error: "Token fehlt." };
  if (newPassword.length < 8) {
    return {
      ok: false,
      error: "Passwort muss mindestens 8 Zeichen lang sein.",
    };
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record) {
    return { ok: false, error: "Reset-Link ist ungültig." };
  }
  if (record.usedAt) {
    return { ok: false, error: "Reset-Link wurde bereits verwendet." };
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Reset-Link ist abgelaufen." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
  return { ok: true };
}
