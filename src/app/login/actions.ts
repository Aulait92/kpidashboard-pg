"use server";

import { redirect } from "next/navigation";
import { completeTotpLogin, login, logout, type LoginResult, type SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkLimit, requestIp } from "@/lib/rate-limit";

export type LoginActionState = {
  error?: string;
  /** Passwort war richtig, jetzt fehlt der Code aus der Authenticator-App. */
  needsTotp?: boolean;
  /**
   * Erfolgreich angemeldet: Ziel für eine volle Seitennavigation. Kein redirect()
   * aus der Server Action, sonst bleibt das Root-Layout im Login-Zustand
   * (ohne Kopfzeile/Menü) stehen, bis neu geladen wird.
   */
  redirectTo?: string;
};

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  // Zusätzlich zur Sperre je E-Mail (lib/auth.ts): Drossel je IP
  if (!checkLimit("login", await requestIp()).ok) {
    return { error: "Zu viele Anmeldeversuche. Bitte in ein paar Minuten noch einmal versuchen." };
  }

  let result: LoginResult;
  try {
    result = await login(email, password);
  } catch (err) {
    // Liefert die echte Ursache (fehlendes AUTH_SECRET, kaputte DB,
    // fehlende User-Tabelle …) statt einer leeren 500-Seite ins UI.
    return {
      error: err instanceof Error ? err.message : "Login fehlgeschlagen.",
    };
  }

  if (!result.ok) {
    return result.needsTotp ? { needsTotp: true } : { error: result.error };
  }

  // Rolle bestimmt das Default-Ziel.
  return { redirectTo: safeNext(next) ?? (await homeFor(result.payload)) };
}

export async function totpAction(_prev: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const next = String(formData.get("next") ?? "");
  if (!checkLimit("totp", await requestIp()).ok) {
    return { needsTotp: true, error: "Zu viele Versuche. Bitte in ein paar Minuten noch einmal versuchen." };
  }
  let result: LoginResult;
  try {
    result = await completeTotpLogin(String(formData.get("code") ?? ""));
  } catch (err) {
    return { needsTotp: true, error: err instanceof Error ? err.message : "Anmeldung fehlgeschlagen." };
  }
  if (!result.ok) {
    return result.needsTotp ? { needsTotp: true, error: "Code stimmt nicht. Bitte den aktuellen Code eingeben." } : { error: result.error };
  }
  return { redirectTo: safeNext(next) ?? (await homeFor(result.payload)) };
}

/** Nur interne Pfade („/…“, nicht „//host“) als Ziel zulassen. */
function safeNext(next: string): string | null {
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** Startseite nach dem Login: Kundenbereich bzw. Admin (neue Oberfläche startet bei „Heute“). */
async function homeFor(p: SessionPayload): Promise<string> {
  if (p.role === "BUYER") return "/buyer";
  const u = await prisma.user.findUnique({ where: { id: p.userId }, select: { adminNewUi: true } }).catch(() => null);
  return u?.adminNewUi ? "/admin/heute" : "/";
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
