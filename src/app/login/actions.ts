"use server";

import { redirect } from "next/navigation";
import { completeTotpLogin, login, logout, type LoginResult } from "@/lib/auth";

export type LoginActionState = {
  error?: string;
  /** Passwort war richtig, jetzt fehlt der Code aus der Authenticator-App. */
  needsTotp?: boolean;
};

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

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
  const target = result.payload.role === "BUYER" ? "/buyer" : "/";
  redirect(next && next.startsWith("/") ? next : target);
}

export async function totpAction(_prev: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const next = String(formData.get("next") ?? "");
  let result: LoginResult;
  try {
    result = await completeTotpLogin(String(formData.get("code") ?? ""));
  } catch (err) {
    return { needsTotp: true, error: err instanceof Error ? err.message : "Anmeldung fehlgeschlagen." };
  }
  if (!result.ok) {
    return result.needsTotp ? { needsTotp: true, error: "Code stimmt nicht. Bitte den aktuellen Code eingeben." } : { error: result.error };
  }
  const target = result.payload.role === "BUYER" ? "/buyer" : "/";
  redirect(next && next.startsWith("/") ? next : target);
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
