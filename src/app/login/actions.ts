"use server";

import { redirect } from "next/navigation";
import { login, logout, type LoginResult } from "@/lib/auth";

export type LoginActionState = {
  error?: string;
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
    return { error: result.error };
  }

  // Rolle bestimmt das Default-Ziel.
  const target = result.payload.role === "BUYER" ? "/buyer" : "/";
  redirect(next && next.startsWith("/") ? next : target);
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
