// 360dialog Cloud-API-Client (Überbrückungsphase). 360dialog leitet die
// offizielle Meta WhatsApp Cloud API durch: Wir sprechen also faktisch gegen
// das Meta-Format, authentifiziert mit einem channel-spezifischen API-Key im
// Header „D360-API-KEY". Dadurch ist ein späterer Wechsel auf Direkt-Meta ein
// kleiner Umbau (anderer Host + Auth), nicht ein Rewrite.
//
// Der API-Key gehört je Kunde zur WhatsAppAccount-Zeile (apiKeyEnc, app-seitig
// verschlüsselt) und wird NUR kurz vor dem Call entschlüsselt übergeben.

const BASE_URL =
  process.env.DIALOG360_BASE_URL ?? "https://waba-v2.360dialog.io";

export type SendResult = { messageId: string | null; raw: unknown };

/**
 * Fehler beim Verbindungsaufbau (nichts wurde gesendet): darf ohne Gefahr einer doppelten Nachricht wiederholt werden.
 * Anlass (Ole, 19.11.2026): Nach einem Neustart scheiterten Antworten des Assistenten mit „Connect Timeout“ an
 * waba-v2.360dialog.io, der Lead bekam keine Antwort.
 */
export function istVerbindungsaufbauFehler(err: unknown): boolean {
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause;
  const code = typeof cause?.code === "string" ? cause.code : "";
  return ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"].includes(code);
}

/** Wartezeiten vor dem 2. und 3. Versuch (Millisekunden). */
export const SENDE_WIEDERHOLUNG_MS = [1_000, 4_000];

async function postMessage(apiKey: string, body: unknown): Promise<SendResult> {
  let res: Response | null = null;
  for (let versuch = 0; ; versuch++) {
    try {
      res = await fetch(`${BASE_URL}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "D360-API-KEY": apiKey,
        },
        body: JSON.stringify(body),
      });
      break;
    } catch (err) {
      const warten = SENDE_WIEDERHOLUNG_MS[versuch];
      if (warten === undefined || !istVerbindungsaufbauFehler(err)) throw err;
      console.warn(`[360dialog] Verbindung fehlgeschlagen, Versuch ${versuch + 2} in ${warten} ms`);
      await new Promise((r) => setTimeout(r, warten));
    }
  }
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    /* kein JSON — Rohtext behalten */
  }
  if (!res.ok) {
    throw new Error(`360dialog ${res.status}: ${text.slice(0, 500)}`);
  }
  const messages = (json?.messages as Array<{ id?: string }> | undefined) ?? [];
  return { messageId: messages[0]?.id ?? null, raw: json ?? text };
}

/**
 * Webhook-URL für die Nummer hinter diesem API-Key setzen (360dialog Cloud API).
 * Eingehende Nachrichten, Status und Coexistence-Echos gehen dann an `url`.
 */
export async function setWebhook(apiKey: string, url: string): Promise<void> {
  const headers = { "Content-Type": "application/json", "D360-API-KEY": apiKey };
  const res = await fetch(`${BASE_URL}/v1/configs/webhook`, { method: "POST", headers, body: JSON.stringify({ url }) });
  if (res.ok) return;
  const first = `${res.status}: ${(await res.text()).slice(0, 300)}`;
  // Ole, 15.11.2026: Bei einer frisch verbundenen Nummer kam 404 {"detail":"Not Found"}. Dann den dokumentierten
  // Webhook auf Ebene des WhatsApp-Kontos (WABA) setzen; er gilt für Nummern ohne eigenen Webhook.
  if (res.status === 404) {
    const waba = await fetch(`${BASE_URL}/waba_webhook`, { method: "POST", headers, body: JSON.stringify({ url }) });
    if (waba.ok) return;
    throw new Error(`360dialog ${first}; waba_webhook ${waba.status}: ${(await waba.text()).slice(0, 200)}`);
  }
  throw new Error(`360dialog ${first}`);
}

/** Freitext-Nachricht senden (nur innerhalb des 24-Stunden-Fensters erlaubt). */
export function sendText(
  apiKey: string,
  to: string,
  body: string,
): Promise<SendResult> {
  return postMessage(apiKey, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

/**
 * Text mit bis zu drei Antwort-Knöpfen (interaktive Nachricht, nur im 24-Stunden-Fenster). Die Antwort kommt als
 * `interactive.button_reply` mit `id` (hier: Payload) und `title` zurück (gateway.ts → inboundBody/inboundPayload).
 */
export function sendButtons(
  apiKey: string,
  to: string,
  body: string,
  buttons: { id: string; title: string }[],
  /** Fußzeile (grau, höchstens 60 Zeichen; länger: weggelassen) */
  footer?: string | null,
): Promise<SendResult> {
  const fuss = footer && footer.length <= 60 ? { footer: { text: footer } } : {};
  return postMessage(apiKey, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      ...fuss,
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
    },
  });
}

/**
 * Interaktive Flow-Nachricht (WhatsApp Flows, nur im 24-Stunden-Fenster; Policen-Strecke v2, lib/policen/flow): Text,
 * optional Fußzeile, genau ein Knopf (flow_cta), der das Formular öffnet (flow_action navigate mit Startdaten). Meta
 * erlaubt hier keine zusätzlichen Antwort-Knöpfe. Antwort kommt als interactive.nfm_reply (gateway.ts).
 */
export function sendFlow(
  apiKey: string,
  to: string,
  o: { body: string; footer?: string | null; flowId: string; token: string; cta: string; screen: string; data: Record<string, string> },
): Promise<SendResult> {
  return postMessage(apiKey, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: o.body.slice(0, 1024) },
      ...(o.footer && o.footer.length <= 60 ? { footer: { text: o.footer } } : {}),
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: o.token,
          flow_id: o.flowId,
          flow_cta: o.cta,
          flow_action: "navigate",
          flow_action_payload: { screen: o.screen, data: o.data },
        },
      },
    },
  });
}

/**
 * Dokument (z. B. PDF) senden, nur innerhalb des 24-Stunden-Fensters (wie Freitext). Cloud-API-Format
 * `type: "document"` mit öffentlicher HTTPS-Adresse (`link`); Meta lädt die Datei dort selbst.
 */
export function sendDocument(
  apiKey: string,
  to: string,
  doc: { link: string; filename: string; caption?: string },
): Promise<SendResult> {
  return postMessage(apiKey, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "document",
    document: { link: doc.link, filename: doc.filename, ...(doc.caption ? { caption: doc.caption } : {}) },
  });
}

/** Genehmigte Vorlage senden (Erstansprache / außerhalb des 24h-Fensters). */
export function sendTemplate(
  apiKey: string,
  to: string,
  name: string,
  language: string,
  components?: unknown[],
): Promise<SendResult> {
  return postMessage(apiKey, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(components ? { components } : {}),
    },
  });
}

// ─── Vorlagen (Template-Verwaltung über die WABA-API, Channel-API-Key) ───────
// Quelle: docs.360dialog.com/partner/messaging/template-messages/create-and-manage-template-messages
//   POST /v1/configs/templates  { name, category, language, components }
//   GET  /v1/configs/templates  → { waba_templates: [{ name, language, status, rejected_reason, … }] }
// Status laut Doku: submitted/PENDING → APPROVED | REJECTED, später ggf. PAUSED/DISABLED.

export type RemoteTemplate = {
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
  /** Aus den Komponenten (nur in der Liste): Kopf-Format (z. B. DOCUMENT) und Knopftexte; undefined = unbekannt. */
  headerFormat?: string | null;
  buttons?: string[];
};

/** Kopf-Format und Knopftexte aus den Komponenten einer Vorlage (GET /v1/configs/templates). */
export function shapeOfComponents(components: unknown): { headerFormat: string | null; buttons: string[] } | undefined {
  if (!Array.isArray(components)) return undefined;
  const list = components as { type?: string; format?: string; buttons?: { text?: string }[] }[];
  const header = list.find((c) => (c.type ?? "").toUpperCase() === "HEADER");
  const buttons = list.find((c) => (c.type ?? "").toUpperCase() === "BUTTONS")?.buttons ?? [];
  return { headerFormat: header?.format ? header.format.toUpperCase() : null, buttons: buttons.map((b) => b.text ?? "").filter(Boolean) };
}

export type CreateTemplateInput = {
  name: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  components: unknown[];
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function remoteOf(t: Record<string, unknown>): RemoteTemplate {
  return {
    name: str(t.name) ?? "",
    language: str(t.language) ?? "",
    status: (str(t.status) ?? "").toUpperCase(),
    category: str(t.category),
    rejectedReason: str(t.rejected_reason),
    ...(shapeOfComponents(t.components) ?? {}),
  };
}

async function templatePage(apiKey: string, query: string): Promise<{ list: Record<string, unknown>[] }> {
  const res = await fetch(`${BASE_URL}/v1/configs/templates?${query}`, {
    headers: { "D360-API-KEY": apiKey },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`360dialog ${res.status}: ${text.slice(0, 300)}`);
  let json: { waba_templates?: unknown[] } | null = null;
  try {
    json = text ? (JSON.parse(text) as { waba_templates?: unknown[] }) : null;
  } catch {
    throw new Error("360dialog: Vorlagenliste ist kein JSON");
  }
  return { list: (json?.waba_templates ?? []).map((t) => t as Record<string, unknown>) };
}

/** Seitengröße beim Abruf der Vorlagenliste (klein genug, dass eine Obergrenze des Servers nicht unbemerkt kürzt). */
export const TEMPLATE_PAGE_SIZE = 100;

/**
 * Alle Vorlagen des WhatsApp-Kontos (WABA) hinter diesem API-Key, seitenweise (limit/offset). Live-Test 17.11.2026: Mit
 * nur einem Abruf fehlten die neuesten Vorlagen (alle pg_outreach_privatschutz_v6*), der Abgleich hielt sie für fehlend,
 * reichte sie bei jedem Lauf neu ein („name … is already in use“) und übernahm ihren Status nie.
 */
export async function listTemplates(apiKey: string): Promise<RemoteTemplate[]> {
  const out: RemoteTemplate[] = [];
  const seen = new Set<string>();
  let offset = 0;
  // Weiter, bis eine Seite leer ist oder nichts Neues bringt (Server ignoriert offset). Der offset wächst um die
  // tatsächlich gelieferten Zeilen, falls der Server weniger als „limit“ je Abruf liefert. „total“ wird nicht vertraut.
  for (let page = 0; page < 100; page++) {
    const { list } = await templatePage(apiKey, `limit=${TEMPLATE_PAGE_SIZE}&offset=${offset}`);
    let neu = 0;
    for (const t of list.map(remoteOf).filter((x) => x.name)) {
      const key = `${t.name}|${t.language}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      neu++;
    }
    if (!list.length || neu === 0) break;
    offset += list.length;
  }
  return out;
}

/** Eine Vorlage gezielt nach Namen suchen (Filter laut 360dialog-Doku; geprüft wird trotzdem der Name). */
export async function findTemplateByName(apiKey: string, name: string): Promise<RemoteTemplate[]> {
  const filters = encodeURIComponent(JSON.stringify({ "business_templates.name": name }));
  const { list } = await templatePage(apiKey, `filters=${filters}&limit=${TEMPLATE_PAGE_SIZE}`);
  return list.map(remoteOf).filter((t) => t.name === name);
}

/** Meldet 360dialog bzw. Meta, dass es eine Vorlage mit diesem Namen schon gibt? */
export function isNameInUseError(err: unknown): boolean {
  return /already in use|already exists/i.test(err instanceof Error ? err.message : String(err));
}

/** Vorlage bei Meta einreichen. Antwort enthält den Anfangsstatus (meist „submitted“/PENDING). */
export async function createTemplate(apiKey: string, input: CreateTemplateInput): Promise<RemoteTemplate> {
  const res = await fetch(`${BASE_URL}/v1/configs/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "D360-API-KEY": apiKey },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`360dialog ${res.status}: ${text.slice(0, 300)}`);
  let t: Record<string, unknown> = {};
  try {
    t = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* kein JSON – Status bleibt „eingereicht“ */
  }
  return {
    name: str(t.name) ?? input.name,
    language: str(t.language) ?? input.language,
    status: (str(t.status) ?? "SUBMITTED").toUpperCase(),
    category: str(t.category) ?? input.category,
    rejectedReason: str(t.rejected_reason),
  };
}
