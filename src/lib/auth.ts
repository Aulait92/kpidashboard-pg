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
  | { ok: false; error: string };

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

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: false, error: "Email oder Passwort falsch." };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { ok: false, error: "Email oder Passwort falsch." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

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
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
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
