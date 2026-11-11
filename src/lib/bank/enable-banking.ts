// Enable Banking (PSD2-Kontozugriff, z. B. Commerzbank) – https://enablebanking.com/docs/api/reference/
//
// Authentifizierung: JWT (RS256) mit App-ID als „kid“, signiert mit dem privaten
// Schlüssel der App. iss/aud sind feste Werte. Ablauf:
//   POST /auth (aspsp, redirect_url, state, valid_until) → url (Bank-Login)
//   Bank leitet auf redirect_url?code=…&state=… zurück
//   POST /sessions { code } → session_id + Konten
//   GET /accounts/{uid}/transactions?date_from=…[&continuation_key=…]
// Schlüssel und Session-IDs werden nie geloggt.

import { createSign } from "node:crypto";

const API = "https://api.enablebanking.com";

export class EnableBankingError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function enableBankingConfigured(): boolean {
  return !!process.env.ENABLE_BANKING_APP_ID && !!process.env.ENABLE_BANKING_PRIVATE_KEY;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Railway-Variablen speichern Zeilenumbrüche manchmal als „\n“ – PEM wiederherstellen. */
export function normalizePem(raw: string): string {
  const s = raw.replace(/\\n/g, "\n").trim();
  return s.includes("\n") ? s : s.replace(/(-----BEGIN [^-]+-----)(.+)(-----END [^-]+-----)/, (_, a, body, b) => `${a}\n${String(body).trim().match(/.{1,64}/g)?.join("\n")}\n${b}`);
}

/** JWT für die API (gültig 1 Stunde). */
export function makeJwt(appId: string, privateKeyPem: string, now = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const body = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  const sig = b64url(signer.sign(normalizePem(privateKeyPem)));
  return `${header}.${body}.${sig}`;
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const key = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (!appId || !key) throw new EnableBankingError("Enable Banking ist nicht eingerichtet (ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY fehlen).");
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${makeJwt(appId, key)}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const j = json as { message?: string; error?: string; detail?: unknown } | null;
    const msg = j?.message ?? j?.error ?? (typeof j?.detail === "string" ? j.detail : null) ?? `HTTP ${res.status}`;
    throw new EnableBankingError(`Enable Banking: ${msg}`, res.status);
  }
  return json as T;
}

export type Aspsp = { name: string; country: string; psu_types?: string[]; maximum_consent_validity?: number; beta?: boolean };

export async function listAspsps(country = "DE"): Promise<Aspsp[]> {
  const r = await call<{ aspsps: Aspsp[] }>(`/aspsps?country=${encodeURIComponent(country)}`);
  return r.aspsps ?? [];
}

/** Bank nach Namen finden (ohne Groß-/Kleinschreibung, Teilname genügt). */
export function findAspsp(list: Aspsp[], wanted: string): Aspsp | null {
  const w = wanted.trim().toLowerCase();
  return list.find((a) => a.name.toLowerCase() === w) ?? list.find((a) => a.name.toLowerCase().includes(w)) ?? null;
}

export async function startAuth(opts: { aspsp: { name: string; country: string }; redirectUrl: string; state: string; validUntil: Date; psuType: string }): Promise<{ url: string }> {
  return call<{ url: string }>("/auth", {
    method: "POST",
    body: {
      access: { valid_until: opts.validUntil.toISOString() },
      aspsp: opts.aspsp,
      state: opts.state,
      redirect_url: opts.redirectUrl,
      psu_type: opts.psuType,
    },
  });
}

export type SessionAccount = {
  uid: string;
  name?: string | null;
  product?: string | null;
  account_id?: { iban?: string | null; other?: { identification?: string } | null } | null;
  currency?: string | null;
};
export type CreatedSession = { session_id: string; accounts: SessionAccount[]; access?: { valid_until?: string } };

export async function createSession(code: string): Promise<CreatedSession> {
  return call<CreatedSession>("/sessions", { method: "POST", body: { code } });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await call(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export type EbTransaction = {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  note?: string | null;
};

/** Alle gebuchten Umsätze ab dateFrom (YYYY-MM-DD), über alle Seiten. */
export async function fetchTransactions(accountUid: string, dateFrom: string, maxPages = 50): Promise<EbTransaction[]> {
  const out: EbTransaction[] = [];
  let key: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ date_from: dateFrom });
    if (key) q.set("continuation_key", key);
    const r = await call<{ transactions?: EbTransaction[]; continuation_key?: string | null }>(`/accounts/${encodeURIComponent(accountUid)}/transactions?${q}`);
    out.push(...(r.transactions ?? []));
    key = r.continuation_key ?? undefined;
    if (!key) break;
  }
  return out;
}
