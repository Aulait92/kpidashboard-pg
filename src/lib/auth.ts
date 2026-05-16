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
