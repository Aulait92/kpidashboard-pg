import { Resend } from "resend";

export type SendResult = { ok: true } | { ok: false; error: string };

function getAppUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  // Fallback: Railway-Default-Variable. Wenn auch die fehlt, bricht das
  // Reset-Senden mit klarer Fehlermeldung ab.
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway.replace(/\/$/, "")}`;
  throw new Error(
    "APP_URL ist nicht gesetzt — wird für Reset-Links in Mails benötigt.",
  );
}

export function buildResetUrl(rawToken: string): string {
  return `${getAppUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  resetUrl: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ?? "KPI Dashboard <onboarding@resend.dev>";

  if (!apiKey) {
    // In Dev / ohne Resend-Setup: Link in die Server-Logs schreiben damit
    // er nicht verloren geht; UI zeigt "Mail unterwegs" damit Account-
    // Existenz nicht verraten wird.
    console.warn(
      `[email] RESEND_API_KEY fehlt — Reset-URL für ${opts.to}: ${opts.resetUrl}`,
    );
    return { ok: false, error: "Email-Service nicht konfiguriert." };
  }

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: "Passwort zurücksetzen · KPI Dashboard",
      text: [
        "Hallo,",
        "",
        "klicke auf den folgenden Link, um dein Passwort zurückzusetzen:",
        opts.resetUrl,
        "",
        "Der Link ist 1 Stunde gültig.",
        "",
        "Falls du diese Anfrage nicht ausgelöst hast, kannst du diese Mail ignorieren.",
      ].join("\n"),
      html: `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0b1220">
          <h1 style="margin:0 0 16px;font-size:18px;font-weight:700">Passwort zurücksetzen</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5">Klicke auf den folgenden Button, um ein neues Passwort zu setzen:</p>
          <p style="margin:24px 0">
            <a href="${opts.resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Neues Passwort festlegen</a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#6b7a96">Oder kopiere diesen Link:</p>
          <p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#2563eb">${opts.resetUrl}</p>
          <p style="margin:0;font-size:12px;color:#6b7a96">Der Link ist <strong>1 Stunde</strong> gültig. Wenn du den Reset nicht angefordert hast, kannst du diese Mail ignorieren.</p>
        </div>
      `,
    });
    if (error) {
      return { ok: false, error: error.message ?? "Resend hat abgelehnt." };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Send failed",
    };
  }
}
