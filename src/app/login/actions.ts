"use server";

import { redirect } from "next/navigation";
import { completeTotpLogin, login, logout, type LoginResult } from "@/lib/auth";
import { loginTargetFor } from "@/lib/login-ziel-server";
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

  // Gewünschte Seite (nur intern und nur, wenn sichtbar), sonst Startseite der Rolle.
  return { redirectTo: await loginTargetFor(result.payload, next) };
}

export async function totpAction(_prev: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const next = String(formData.get("next") ?? "");
  if (!checkLimit("totp", await requestIp()).ok) {
    return { needsTotp: true, error: "Zu viele Versuche. Bitte in ein paar Minuten noch einmal versuchen." };
  }
  let result: LoginResult;
  try {
    result = await completeTotpLogin(String(formData.get("code") ?? ""), formData.get("remember") === "on");
  } catch (err) {
    return { needsTotp: true, error: err instanceof Error ? err.message : "Anmeldung fehlgeschlagen." };
  }
  if (!result.ok) {
    return result.needsTotp ? { needsTotp: true, error: "Code stimmt nicht. Bitte den aktuellen Code eingeben." } : { error: result.error };
  }
  return { redirectTo: await loginTargetFor(result.payload, next) };
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
