"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";

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

  const result = await login(email, password);
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
