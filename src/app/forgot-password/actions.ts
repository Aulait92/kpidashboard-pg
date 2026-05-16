"use server";

import { issuePasswordResetToken } from "@/lib/auth";
import { buildResetUrl, sendPasswordResetEmail } from "@/lib/email";

export type ForgotPasswordState = {
  ok?: boolean;
  error?: string;
};

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "");

  try {
    const issued = await issuePasswordResetToken(email);
    if (issued) {
      const resetUrl = buildResetUrl(issued.rawToken);
      const sent = await sendPasswordResetEmail({ to: email, resetUrl });
      if (!sent.ok) {
        // Logging in lib/email.ts gibt den Link in den Server-Logs aus,
        // sodass der Admin manuell helfen kann. Für den User trotzdem
        // generische Antwort.
        console.warn(`[forgot-password] send failed: ${sent.error}`);
      }
    }
  } catch (err) {
    // Schlechtes Setup (kein APP_URL, DB-Probleme) wird nicht durchgereicht,
    // damit niemand über Fehlermeldungen Accounts probieren kann. Log only.
    console.error("[forgot-password] error:", err);
  }

  // Generische Antwort — egal ob Email existiert oder nicht. Verhindert
  // User-Enumeration.
  return { ok: true };
}
