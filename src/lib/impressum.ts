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

function normalizeUrl(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    // Keine internen Ziele (Schutz vor Anfragen ins eigene Netz).
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i.test(u.hostname) || u.hostname.endsWith(".internal")) {
      return null;
    }
    return u;
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(10000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
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

function htmlToText(html: string): string {
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
  const base = website ? normalizeUrl(website) : null;
  if (!base) return { ...empty, error: "Keine (gültige) Website hinterlegt." };

  const home = await fetchHtml(base.toString());
  if (!home) return { ...empty, error: "Website nicht erreichbar." };
  const all = links(home, base.toString());
  const impressumUrl =
    all.find((l) => /impressum|imprint/i.test(l.href) || /impressum/i.test(l.text))?.href ?? new URL("/impressum", base).toString();
  const privacyUrl = all.find((l) => /datenschutz|privacy/i.test(l.href) || /datenschutz/i.test(l.text))?.href ?? null;
  const impressumHtml = await fetchHtml(impressumUrl);
  if (!impressumHtml) return { ...empty, privacyUrl, error: "Impressum nicht gefunden." };
  const text = htmlToText(impressumHtml).slice(0, 20000);

  if (!process.env.ANTHROPIC_API_KEY) return { ...empty, impressumUrl, privacyUrl, error: "ANTHROPIC_API_KEY fehlt – bitte von Hand prüfen." };
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
    return { ...empty, impressumUrl, privacyUrl, error: "Auslesen fehlgeschlagen – bitte von Hand prüfen." };
  }
}
