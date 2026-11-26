// Pflichtvariablen der Produktion prüfen (Ole, 15.11.2026, Go-live-Härtung): Fehlt beim Start etwas, das Käufe,
// Logins oder WhatsApp braucht, gibt es einen Admin-Alarm (Push und Aufgabe), statt dass es erst beim ersten
// Kunden auffällt. Werte werden nie ausgegeben, nur „gesetzt“, „fehlt“ bzw. „test statt live“.

type Check = { name: string; zweck: string; ok: (v: string) => boolean; hinweis?: string };

const gesetzt = (v: string) => v.trim().length > 0;

export const PFLICHT_VARIABLEN: Check[] = [
  { name: "DATABASE_URL", zweck: "Datenbank", ok: gesetzt },
  { name: "AUTH_SECRET", zweck: "Login", ok: (v) => v.trim().length >= 32 },
  { name: "APP_URL", zweck: "Links in E-Mails und Stripe", ok: (v) => /^https:\/\//.test(v.trim()) },
  { name: "STRIPE_SECRET_KEY", zweck: "Zahlungen", ok: (v) => /^(sk|rk)_live_/.test(v.trim()), hinweis: "muss ein Live-Schlüssel sein" },
  { name: "STRIPE_WEBHOOK_SECRET", zweck: "Zahlungseingang (Onboarding startet danach)", ok: (v) => /^whsec_/.test(v.trim()) },
  { name: "RESEND_API_KEY", zweck: "E-Mails (Zugangsdaten, Terminbestätigungen)", ok: gesetzt },
  { name: "ENCRYPTION_KEY", zweck: "Verschlüsselte Zugangsdaten (WhatsApp, Postfächer)", ok: gesetzt },
  { name: "DIALOG360_PARTNER_ID", zweck: "WhatsApp verbinden", ok: gesetzt },
  { name: "DIALOG360_PARTNER_API_KEY", zweck: "WhatsApp verbinden", ok: gesetzt },
  { name: "GOOGLE_MAIL_VERIFIED", zweck: "Gmail-Postfach verbinden", ok: (v) => /^(1|true|yes|ja|on)$/i.test(v.trim()), hinweis: "1 setzen" },
  { name: "SUPPORT_EMAIL", zweck: "Support-Kontakt im Hilfe-Chat", ok: (v) => /@/.test(v) },
];

export type VariablenStatus = { name: string; zweck: string; status: "ok" | "fehlt" | "ungültig"; hinweis?: string };

/** Status je Pflichtvariable, ohne Werte (rein, getestet). */
export function pruefeVariablen(env: Record<string, string | undefined> = process.env): VariablenStatus[] {
  return PFLICHT_VARIABLEN.map((c) => {
    const v = env[c.name];
    if (v == null || !v.trim()) return { name: c.name, zweck: c.zweck, status: "fehlt" as const };
    return c.ok(v) ? { name: c.name, zweck: c.zweck, status: "ok" as const } : { name: c.name, zweck: c.zweck, status: "ungültig" as const, ...(c.hinweis ? { hinweis: c.hinweis } : {}) };
  });
}

/** Beim Start der Produktion einmal prüfen und bei Lücken Admins benachrichtigen (Push + Aufgabe, je Tag einmal). */
export async function variablenBeimStart(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || process.env.CI || process.env.SKIP_ENV_CHECK) return;
  // Nur auf der Produktion (App-Adresse), nicht auf Staging oder lokal
  if (!/app\.performancegrowth\.de/.test(process.env.APP_URL ?? "")) return;
  const fehlend = pruefeVariablen().filter((s) => s.status !== "ok");
  if (!fehlend.length) return;
  const text = fehlend.map((s) => `${s.name} ${s.status === "fehlt" ? "fehlt" : `ungültig${s.hinweis ? ` (${s.hinweis})` : ""}`}: ${s.zweck}`).join("; ");
  console.error("[env-check]", text);
  try {
    const { prisma } = await import("@/lib/prisma");
    const title = `Railway-Variablen prüfen: ${fehlend.map((s) => s.name).join(", ")}`;
    const since = new Date(Date.now() - 24 * 3600_000);
    const schon = await prisma.salesTask.count({ where: { title, createdAt: { gte: since } } });
    if (schon) return;
    await prisma.salesTask.create({ data: { contactId: null, type: "SONSTIGES", title, note: text, dueAt: new Date() } });
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({ title: "Variable fehlt in der Produktion", body: text.slice(0, 180), url: "/admin/neu/einstellungen/status" });
  } catch (err) {
    console.error("[env-check] Alarm fehlgeschlagen", err instanceof Error ? err.message : err);
  }
}
