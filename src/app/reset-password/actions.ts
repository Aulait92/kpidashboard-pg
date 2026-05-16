"use server";

import { consumePasswordResetToken } from "@/lib/auth";

export type ResetPasswordState = {
  ok?: boolean;
  error?: string;
};

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) {
    return { error: "Die beiden Passwörter sind nicht identisch." };
  }
  if (password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
  }

  const result = await consumePasswordResetToken(token, password);
  if (!result.ok) {
    return { error: result.error };
  }
  return { ok: true };
}
