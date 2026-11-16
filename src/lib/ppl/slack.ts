// Slack-Nachricht je Pay-per-Lead (ersetzt die Slack-Meldung des alten Verteil-Zaps):
// Ergebnis des Eingangs (geliefert, geparkt, Dublette, ungültig) mit Produkt, Bezieher,
// PLZ/Ort, Lieferweg und Zustellstatus, Link in den Admin. Bei einem Auslieferungsfehler
// zusätzlich eine eigene Warnung.
//
// Datenschutz: keine vollen Kontaktdaten, nur Vorname und PLZ (Ort ergibt sich aus der PLZ).
// Lieferadressen nur als Domain (die Make-Hook-Adresse ist ein Zugang).
// Incoming Webhook aus SLACK_PPL_WEBHOOK_URL (Railway). Fehlt die Variable: nichts senden.
// Versand nicht blockierend (after()), Fehler nur loggen. Schalter je Bezug: slackNotify.

import { prisma } from "@/lib/prisma";
import type { DeliveryReport } from "@/lib/ppl/delivery";

export type SlackLeadInfo = {
  product: string;
  status: "delivered" | "parked" | "duplicate" | "invalid";
  reason?: string | null;
  firstName?: string | null;
  plz?: string | null;
  ort?: string | null;
  customer?: string | null;
  bezug?: string | null;
  /** war vorher geparkt (Nachlieferung) */
  wasParked?: boolean;
  delivery?: Pick<DeliveryReport, "label" | "targets" | "ok" | "error"> | null;
  adminUrl?: string | null;
};

/** Slack-mrkdwn: Steuerzeichen maskieren. */
const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Nur die Domain einer Lieferadresse (E-Mail oder Host). */
export function targetDomain(target: string): string {
  const at = target.lastIndexOf("@");
  return at >= 0 ? target.slice(at + 1).toLowerCase() : target.toLowerCase();
}

/** E-Mail-Adressen in Fehlertexten auf die Domain kürzen. */
export const maskEmails = (s: string) => s.replace(/[^\s@<>"',;:()]+@([^\s@<>"',;:()]+)/g, "…@$1");

const STATUS = {
  delivered: { icon: "✅", text: "geliefert" },
  parked: { icon: "⏸️", text: "geparkt" },
  duplicate: { icon: "🔁", text: "Dublette" },
  invalid: { icon: "⛔", text: "ungültig" },
} as const;

/** Ziel „Kundenbereich“ (Lieferweg app bzw. app_pdf) ist keine Adresse: nicht als Domain zählen. */
const APP_TARGET = "Kundenbereich";
const targetName = (t: string) => (t === APP_TARGET ? APP_TARGET : targetDomain(t));

function deliveryLine(d: NonNullable<SlackLeadInfo["delivery"]>): string {
  // Adressen ohne den Kundenbereich (steckt schon im Lieferweg, z. B. „Kundenbereich + PDF per Mail“)
  const addresses = d.targets.filter((t) => t.target !== APP_TARGET);
  const domains = [...new Set(addresses.map((t) => targetDomain(t.target)))];
  const where = addresses.length > 1 ? ` an ${addresses.length} Adressen (${domains.join(", ")})` : domains.length ? ` an ${domains[0]}` : "";
  const blocked = d.targets.some((t) => t.blocked) ? ", Testumgebung: teilweise gesperrt" : "";
  const failed = d.targets.filter((t) => !t.ok);
  const why = failed.length ? failed.map((t) => `${targetName(t.target)}: ${t.error ?? "Fehler"}`).join("; ") : (d.error ?? "unbekannt");
  const state = d.ok ? `zugestellt${blocked}` : `FEHLER: ${maskEmails(why)}`;
  return `Lieferweg: ${esc(d.label)}${esc(where)}: ${esc(state)}`;
}

const link = (url: string | null | undefined) => (url ? `<${url}|Im Admin öffnen>` : null);

/** Text der Nachricht je Lead (rein, getestet). */
export function pplSlackText(i: SlackLeadInfo): string {
  const s = STATUS[i.status];
  const lead = [i.firstName?.trim(), [i.plz, i.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [
    `${s.icon} *PPL-Lead ${s.text}${i.wasParked ? " (war geparkt)" : ""}: ${esc(i.product)}*`,
    i.status === "delivered" ? `Bezieher: ${esc(i.customer ?? "unbekannt")}${i.bezug ? ` (Bezug: ${esc(i.bezug)})` : ""}` : null,
    `Lead: ${esc(lead || "ohne Angaben")}`,
    i.status !== "delivered" ? `Status: ${s.text}${i.reason ? `, ${esc(i.reason)}` : ""}` : null,
    i.delivery ? deliveryLine(i.delivery) : null,
    link(i.adminUrl),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Eigene Warnung bei einem Auslieferungsfehler (rein, getestet). */
export function pplSlackFailureText(i: SlackLeadInfo): string {
  return [
    `⚠️ *Lead nicht zugestellt: ${esc(i.product)}*`,
    `Bezieher: ${esc(i.customer ?? "unbekannt")}${i.bezug ? ` (Bezug: ${esc(i.bezug)})` : ""}`,
    i.delivery ? deliveryLine(i.delivery) : null,
    "Der Lead ist gespeichert, bitte von Hand nachliefern.",
    link(i.adminUrl),
  ]
    .filter(Boolean)
    .join("\n");
}

export function slackWebhookUrl(): string | null {
  return process.env.SLACK_PPL_WEBHOOK_URL?.trim() || null;
}

let hinted = false;

/** Nachricht an den Incoming Webhook senden. Wirft nicht. */
export async function postSlack(text: string, url = slackWebhookUrl()): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) console.warn(`[ppl-slack] HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.warn("[ppl-slack] nicht gesendet:", err instanceof Error ? err.message : err);
    return false;
  }
}

export type SlackTestResult = { state: "gesendet" | "nicht eingerichtet" | "fehler"; status?: number; error?: string };

/** Admin → Pay-per-Lead → „Slack testen“: feste Testnachricht an den Webhook. */
export async function sendSlackTest(url = slackWebhookUrl()): Promise<SlackTestResult> {
  if (!url) return { state: "nicht eingerichtet" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Test: PPL-Benachrichtigung aktiv" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { state: "gesendet", status: res.status };
    const body = (await res.text().catch(() => "")).slice(0, 120);
    return { state: "fehler", status: res.status, ...(body ? { error: body } : {}) };
  } catch (err) {
    return { state: "fehler", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Nach der Antwort ausführen (after()), außerhalb einer Anfrage direkt im Hintergrund. */
async function inBackground(run: () => Promise<void>) {
  const safe = () => run().catch((err: unknown) => console.warn("[ppl-slack] Fehler:", err instanceof Error ? err.message : err));
  try {
    const { after } = await import("next/server");
    after(safe);
  } catch {
    void safe();
  }
}

function adminBase(): string | null {
  const explicit = process.env.APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  return railway ? `https://${railway.replace(/\/$/, "")}` : null;
}

/** Infos zum Pool-Lead für Slack (ohne Kontaktdaten außer Vorname und PLZ). */
export async function slackInfoFor(poolLeadId: string, extra: { delivery?: DeliveryReport | null; wasParked?: boolean } = {}): Promise<{ info: SlackLeadInfo; muted: boolean } | null> {
  const pl = await prisma.poolLead.findUnique({ where: { id: poolLeadId }, select: { id: true, productKey: true, status: true, reason: true, name: true, plz: true, answers: true, leadId: true } });
  if (!pl) return null;
  const lead = pl.leadId
    ? await prisma.lead.findUnique({ where: { id: pl.leadId }, select: { subscription: { select: { label: true, slackNotify: true, customer: { select: { name: true } } } } } })
    : null;
  const sub = lead?.subscription ?? null;
  // Ohne Bezug (geparkt, Dublette, ungültig): stumm nur, wenn alle Bezüge des Produkts stumm sind
  const muted = sub
    ? !sub.slackNotify
    : await prisma.leadSubscription
        .findMany({ where: { productKey: pl.productKey }, select: { slackNotify: true } })
        .then((subs) => subs.length > 0 && subs.every((s) => !s.slackNotify));
  const answers = (Array.isArray(pl.answers) ? (pl.answers as { label: string; value: string }[]) : []).filter((a) => a?.label);
  const ort = answers.find((a) => /^(ort|stadt|city|wohnort)$/i.test(a.label.trim()))?.value ?? null;
  const base = adminBase();
  const status = (["delivered", "parked", "duplicate", "invalid"].includes(pl.status) ? pl.status : "parked") as SlackLeadInfo["status"];
  const path =
    status === "delivered" && pl.leadId ? `/admin/ppl?ansicht=geliefert&q=${encodeURIComponent(pl.leadId)}` : status === "parked" ? "/admin/ppl?ansicht=geparkt" : "/admin/ppl?ansicht=eingang";
  return {
    muted,
    info: {
      product: pl.productKey,
      status,
      reason: pl.reason,
      firstName: (pl.name ?? "").trim().split(/\s+/)[0] || null,
      plz: pl.plz,
      ort,
      customer: sub?.customer.name ?? null,
      bezug: sub?.label ?? null,
      wasParked: extra.wasParked,
      delivery: extra.delivery ?? null,
      adminUrl: base ? `${base}${path}` : null,
    },
  };
}

/**
 * Slack je Lead-Eingang bzw. Lieferung (nicht blockierend). Bei Auslieferungsfehler
 * zusätzlich die Warnung. Ohne SLACK_PPL_WEBHOOK_URL nur ein Hinweis im Log (einmal).
 */
export async function notifyPplSlack(poolLeadId: string, extra: { delivery?: DeliveryReport | null; wasParked?: boolean } = {}): Promise<void> {
  const url = slackWebhookUrl();
  if (!url) {
    if (!hinted && process.env.NODE_ENV !== "test") console.info("[ppl-slack] SLACK_PPL_WEBHOOK_URL fehlt, keine Slack-Nachricht.");
    hinted = true;
    return;
  }
  await inBackground(async () => {
    const r = await slackInfoFor(poolLeadId, extra);
    if (!r || r.muted) return;
    await postSlack(pplSlackText(r.info), url);
    if (r.info.delivery && !r.info.delivery.ok) await postSlack(pplSlackFailureText(r.info), url);
  });
}
