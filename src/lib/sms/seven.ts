// SMS über seven.io (Ole, 17.11.2026). Bisher nur als Ersatz, wenn eine WhatsApp-Terminnachricht nicht ankommt
// (lib/sms/ersatz.ts). Zugang: SEVEN_API_KEY (REST-API-Schlüssel, Header X-Api-Key), Absender SMS_ABSENDER
// (höchstens 11 Zeichen, Standard „PerfGrowth“). Ohne Schlüssel wird nichts gesendet.
// Testumgebung: Ist MAIL_NUR_AN gesetzt (staging), gehen SMS nur an Nummern aus SMS_NUR_AN.
// API: https://docs.seven.io/de/rest-api/endpoints/sms (POST /api/sms, JSON, Antwort mit success und messages[]).

import { ohneGedankenstriche } from "@/lib/gedankenstriche";

const URL = "https://gateway.seven.io/api/sms";

export function smsAktiv(): boolean {
  return !!process.env.SEVEN_API_KEY?.trim();
}

function nurDigits(n: string): string {
  return n.replace(/\D/g, "").replace(/^00/, "");
}

/** Darf an diese Nummer gesendet werden? In der Testumgebung (MAIL_NUR_AN gesetzt) nur an SMS_NUR_AN. */
export function smsErlaubt(to: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.MAIL_NUR_AN?.trim()) return true;
  const liste = (env.SMS_NUR_AN ?? "").split(",").map(nurDigits).filter(Boolean);
  return liste.includes(nurDigits(to));
}

/** Absender: alphanumerisch, höchstens 11 Zeichen. */
export function smsAbsender(env: NodeJS.ProcessEnv = process.env): string {
  const s = (env.SMS_ABSENDER ?? "").replace(/[^A-Za-z0-9 .-]/g, "").trim().slice(0, 11);
  return s || "PerfGrowth";
}

export type SmsErgebnis = { status: "sent" | "blocked" | "no_key" | "failed"; id?: string | null; error?: string | null };

/** Eine SMS senden. Wirft nie. */
export async function sendSms(to: string, text: string, opts: { fetchImpl?: typeof fetch; /** eigener Absender (höchstens 11 Zeichen, sonst SMS_ABSENDER) */ from?: string | null } = {}): Promise<SmsErgebnis> {
  const key = process.env.SEVEN_API_KEY?.trim();
  if (!key) return { status: "no_key" };
  const nummer = nurDigits(to);
  if (!nummer) return { status: "failed", error: "keine Nummer" };
  if (!smsErlaubt(nummer)) return { status: "blocked" };
  try {
    const res = await (opts.fetchImpl ?? fetch)(URL, {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: `+${nummer}`, text: ohneGedankenstriche(text), from: (opts.from ?? "").replace(/[^A-Za-z0-9 .-]/g, "").trim().slice(0, 11) || smsAbsender() }),
      signal: AbortSignal.timeout(15000),
    });
    const raw = await res.text();
    let j: { success?: string | number; messages?: { id?: string | null; success?: boolean; error?: string | null; error_text?: string | null }[] } | null = null;
    try {
      j = JSON.parse(raw);
    } catch {
      j = null;
    }
    const m = j?.messages?.[0];
    if (res.ok && String(j?.success) === "100" && m?.success !== false) return { status: "sent", id: m?.id ?? null };
    return { status: "failed", error: (m?.error_text || m?.error || `HTTP ${res.status} ${String(j?.success ?? raw).slice(0, 80)}`).slice(0, 200) };
  } catch (err) {
    return { status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }
}
