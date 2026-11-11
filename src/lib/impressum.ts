// Pflichtangaben einer Agentur aus dem Impressum ihrer Website lesen
// (für Leadformular, Datenschutzhinweis und Anzeigen): Website laden,
// Impressum-Seite finden, Text per Claude strukturiert auslesen.
// Ergebnis landet in Onboarding.websiteInfo – geprüft wird von Hand.

import Anthropic from "@anthropic-ai/sdk";
import { reportError } from "@/lib/monitoring";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
const UA = "Mozilla/5.0 (compatible; performancegrowth-onboarding/1.0)";

export type ImpressumInfo = {
  sourceUrl: string | null;
  impressumUrl: string | null;
  privacyUrl: string | null;
  companyName: string | null;
  representative: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  registerNumber: string | null;
  registerType: string | null;
  chamber: string | null;
  missing: string[];
  error?: string;
  checkedAt: string;
};

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/i;
const PRIVATE_V6 = /^(::1?$|f[cd]|fe[89ab]|::ffff:)/i;

/** Website-Angabe → URL (nur http/https, keine internen Ziele). */
export function normalizeUrl(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    // Keine internen Ziele (Schutz vor Anfragen ins eigene Netz).
    if (PRIVATE_HOST.test(u.hostname) || u.hostname.startsWith("[") || u.hostname.endsWith(".internal") || u.hostname.endsWith(".local") || !u.hostname.includes(".")) {
      return null;
    }
    return u;
  } catch {
    return null;
  }
}

/** Löst der Name auf eine interne Adresse auf? (Schutz gegen DNS-Tricks) */
async function resolvesPrivate(hostname: string): Promise<boolean> {
  try {
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(hostname, { all: true });
    return addrs.some((a) => (a.family === 6 ? PRIVATE_V6.test(a.address) : PRIVATE_HOST.test(a.address)));
  } catch {
    return true; // nicht auflösbar → nicht abrufen
  }
}

const MAX_BYTES = 1_500_000;

async function fetchHtml(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const u = normalizeUrl(url);
    if (!u || (await resolvesPrivate(u.hostname))) return null;
    const res = await fetch(u.toString(), { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    // Nach Weiterleitungen nochmals prüfen, dass das Ziel öffentlich ist.
    if (res.url && res.url !== u.toString()) {
      const final = normalizeUrl(res.url);
      if (!final || (await resolvesPrivate(final.hostname))) return null;
    }
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  }
}

function links(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      out.push({ href: new URL(m[1], base).toString(), text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
    } catch {
      /* ungültiger Link */
    }
  }
  return out;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const FIELDS = {
  companyName: "Name der Agentur/Firma laut Impressum",
  representative: "Inhaber bzw. vertretungsberechtigte Person",
  address: "Postanschrift (Straße, PLZ Ort)",
  phone: "Telefonnummer",
  email: "E-Mail-Adresse",
  registerNumber: "Vermittlerregister-Nummer (z. B. D-XXXX-XXXXX-XX)",
  registerType: "Status laut Impressum, z. B. „gebundener Versicherungsvertreter nach § 34d Abs. 7 GewO“",
  chamber: "Zuständige Registerstelle/IHK",
} as const;

/**
 * Impressum einer Website laden: Startseite → Link „Impressum“ (bevorzugt auf
 * derselben Seite/demselben Pfad, z. B. vertretung.allianz.de/<name>/…),
 * sonst …/impressum. Liefert den Text (ohne KI).
 */
export async function fetchImpressumText(
  website: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ impressumUrl: string; privacyUrl: string | null; text: string } | { error: string; privacyUrl?: string | null }> {
  const base = normalizeUrl(website);
  if (!base) return { error: "Keine (gültige) Website hinterlegt." };
  const home = await fetchHtml(base.toString(), opts.timeoutMs);
  if (!home) return { error: "Website nicht erreichbar." };
  const all = links(home, base.toString());
  const basePath = base.pathname.replace(/\/+$/, "");
  const isImpressum = (l: { href: string; text: string }) => /impressum|imprint/i.test(l.href) || /impressum/i.test(l.text);
  const sameSite = (l: { href: string }) => {
    try {
      const u = new URL(l.href);
      return u.hostname === base.hostname && (!basePath || u.pathname.startsWith(basePath));
    } catch {
      return false;
    }
  };
  const fallback = basePath ? new URL("impressum/", `${base.origin}${basePath}/`).toString() : new URL("/impressum", base).toString();
  const impressumUrl = all.find((l) => isImpressum(l) && sameSite(l))?.href ?? all.find(isImpressum)?.href ?? fallback;
  const privacyUrl = all.find((l) => /datenschutz|privacy/i.test(l.href) || /datenschutz/i.test(l.text))?.href ?? null;
  const impressumHtml = await fetchHtml(impressumUrl, opts.timeoutMs);
  if (!impressumHtml) return { error: "Impressum nicht gefunden.", privacyUrl };
  return { impressumUrl, privacyUrl, text: htmlToText(impressumHtml).slice(0, 20000) };
}

export async function readImpressum(website: string | null | undefined): Promise<ImpressumInfo> {
  const empty: ImpressumInfo = {
    sourceUrl: website ?? null,
    impressumUrl: null,
    privacyUrl: null,
    companyName: null,
    representative: null,
    address: null,
    phone: null,
    email: null,
    registerNumber: null,
    registerType: null,
    chamber: null,
    missing: [],
    checkedAt: new Date().toISOString(),
  };
  if (!website) return { ...empty, error: "Keine (gültige) Website hinterlegt." };
  const page = await fetchImpressumText(website);
  if ("error" in page) return { ...empty, privacyUrl: page.privacyUrl ?? null, error: page.error };
  const { impressumUrl, privacyUrl, text } = page;

  if (!process.env.ANTHROPIC_API_KEY) return { ...empty, impressumUrl, privacyUrl, error: "ANTHROPIC_API_KEY fehlt. Bitte von Hand prüfen." };
  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "Du liest Pflichtangaben aus dem Impressum einer deutschen Versicherungsagentur. Übernimm Werte wörtlich aus dem Text. Erfinde nichts: Fehlt eine Angabe, setze null.",
      tools: [
        {
          name: "save_impressum",
          description: "Speichert die aus dem Impressum gelesenen Angaben.",
          input_schema: {
            type: "object",
            properties: Object.fromEntries(
              Object.entries(FIELDS).map(([k, d]) => [k, { type: ["string", "null"], description: d }]),
            ),
            required: Object.keys(FIELDS),
          },
        },
      ],
      tool_choice: { type: "tool", name: "save_impressum" },
      messages: [{ role: "user", content: `Impressum (${impressumUrl}):\n\n${text}` }],
    });
    const tool = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const data = (tool?.input ?? {}) as Partial<Record<keyof typeof FIELDS, string | null>>;
    const info: ImpressumInfo = { ...empty, impressumUrl, privacyUrl };
    for (const k of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) {
      const v = data[k];
      info[k] = typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null;
    }
    info.missing = [
      ...(!info.registerNumber ? ["Vermittlerregister-Nr."] : []),
      ...(!info.address ? ["Anschrift"] : []),
      ...(!privacyUrl ? ["Datenschutzerklärung"] : []),
    ];
    return info;
  } catch (err) {
    reportError(err, "impressum-extract", { url: impressumUrl });
    return { ...empty, impressumUrl, privacyUrl, error: "Auslesen fehlgeschlagen. Bitte von Hand prüfen." };
  }
}
