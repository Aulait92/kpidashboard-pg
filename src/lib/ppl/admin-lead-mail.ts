// Lead-Mail an Ole je Lead aus unseren eigenen Funnels (Ole, 20.11.2026: „schicke mir immer noch eine Leadmail, wenn
// unter unserem eigenen Funnel (PKV) ein Lead reinkommt“). Zusätzlich zur Slack-Meldung (lib/ppl/slack.ts), an derselben
// Stelle ausgelöst (engine.ts slack()): Eingang mit Ergebnis (geliefert an wen, geparkt, Dublette, ungültig) und allen
// Angaben des Leads. Empfänger: PPL_ADMIN_MAIL_AN, sonst Oles Adresse (Ole, 20.11.2026). Produkte: PPL_ADMIN_MAIL_PRODUKTE (Komma-Liste,
// Standard „PKV-Tarifoptimierung“; „aus“ schaltet ab). Wird ein geparkter Lead später geliefert, kommt eine zweite Mail.
// Nicht blockierend, Fehler nur loggen.

import { prisma } from "@/lib/prisma";
import { PROVIDER } from "@/lib/legal-texts";
import type { DeliveryReport } from "@/lib/ppl/delivery";

const STANDARD_PRODUKTE = ["PKV-Tarifoptimierung"];
/** Empfänger der Lead-Mail (Ole, 20.11.2026: „lead email bitte an hallo@olekannapinn.com“). */
export const adminMailAn = (env: Record<string, string | undefined> = process.env) => env.PPL_ADMIN_MAIL_AN?.trim() || "hallo@olekannapinn.com";

/** Produkte, für die eine Lead-Mail an Ole geht (leer = aus). */
export function adminMailProdukte(env: Record<string, string | undefined> = process.env): string[] {
  const roh = (env.PPL_ADMIN_MAIL_PRODUKTE ?? "").trim();
  if (/^(0|aus|off|nein|false)$/i.test(roh)) return [];
  if (!roh) return STANDARD_PRODUKTE;
  return roh.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
}

export type AdminLeadMailInfo = {
  product: string;
  status: "delivered" | "parked" | "duplicate" | "invalid";
  reason: string | null;
  customer: string | null;
  bezug: string | null;
  wasParked?: boolean;
  name: string | null;
  phone: string | null;
  email: string | null;
  plz: string | null;
  contribution: string | null;
  insurer: string | null;
  civilServant: boolean | null;
  answers: { label: string; value: string }[];
  createdAt: Date;
  adminUrl: string | null;
};

const STATUS: Record<AdminLeadMailInfo["status"], string> = {
  delivered: "geliefert",
  parked: "geparkt (kein freier Bezug)",
  duplicate: "Dublette",
  invalid: "ungültig",
};

const zeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(d);

/** Betreff und Inhalt (rein, getestet). */
export function adminLeadMail(i: AdminLeadMailInfo): { subject: string; paragraphs: string[]; list: string[] } {
  const vorname = (i.name ?? "").trim().split(/\s+/)[0] || "ohne Namen";
  const wohin = i.status === "delivered" ? ` an ${i.customer ?? "Bezug"}${i.bezug && i.bezug !== i.customer ? ` (${i.bezug})` : ""}` : "";
  const subject = `${i.wasParked ? "Nachgeliefert" : "Neuer Lead"} ${i.product}: ${vorname}${i.plz ? `, ${i.plz}` : ""}, ${STATUS[i.status]}${wohin}`;
  const list = [
    `Ergebnis: ${STATUS[i.status]}${wohin}${i.reason && i.status !== "delivered" ? ` (${i.reason})` : ""}`,
    `Eingang: ${zeit(i.createdAt)}`,
    `Name: ${i.name ?? ""}`,
    `Telefon: ${i.phone ? `+${i.phone.replace(/^\+/, "")}` : ""}`,
    `E-Mail: ${i.email ?? ""}`,
    `PLZ: ${i.plz ?? ""}`,
    ...(i.contribution ? [`Beitrag: ${i.contribution}`] : []),
    ...(i.insurer ? [`Versicherer: ${i.insurer}`] : []),
    ...(i.civilServant != null ? [`Beamter: ${i.civilServant ? "ja" : "nein"}`] : []),
    ...i.answers.filter((a) => a.value?.trim()).map((a) => `${a.label}: ${a.value}`),
  ];
  return { subject, paragraphs: [`Neuer Lead aus unserem Funnel ${i.product}.`], list };
}

function adminBase(): string | null {
  const explicit = process.env.APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  return railway ? `https://${railway.replace(/\/$/, "")}` : null;
}

/** Mail zum Pool-Lead an Ole (nur für die Produkte aus adminMailProdukte), nach der Antwort an den Absender. */
export async function notifyAdminLeadMail(poolLeadId: string, extra: { delivery?: DeliveryReport | null; wasParked?: boolean } = {}): Promise<void> {
  if (!adminMailProdukte().length) return;
  const safe = () => sendeAdminLeadMail(poolLeadId, extra).catch((err: unknown) => console.warn("[ppl-admin-mail]", err instanceof Error ? err.message : err));
  try {
    const { after } = await import("next/server");
    after(safe);
  } catch {
    await safe();
  }
}

async function sendeAdminLeadMail(poolLeadId: string, extra: { delivery?: DeliveryReport | null; wasParked?: boolean }): Promise<void> {
  const produkte = adminMailProdukte();
  const pl = await prisma.poolLead.findUnique({
    where: { id: poolLeadId },
    select: { productKey: true, status: true, reason: true, name: true, phone: true, email: true, plz: true, contribution: true, insurer: true, civilServant: true, answers: true, leadId: true, createdAt: true },
  });
  if (!pl || !produkte.some((p) => p.toLowerCase() === pl.productKey.toLowerCase())) return;
  const sub = pl.leadId
    ? (await prisma.lead.findUnique({ where: { id: pl.leadId }, select: { subscription: { select: { label: true, customer: { select: { name: true } } } } } }))?.subscription ?? null
    : null;
  const status = (["delivered", "parked", "duplicate", "invalid"].includes(pl.status) ? pl.status : "parked") as AdminLeadMailInfo["status"];
  const base = adminBase();
  const path = status === "delivered" && pl.leadId ? `/admin/neu/leads/ppl?ansicht=geliefert&q=${encodeURIComponent(pl.leadId)}` : status === "parked" ? "/admin/neu/leads/ppl?ansicht=geparkt" : "/admin/neu/leads/ppl?ansicht=eingang";
  const m = adminLeadMail({
    product: pl.productKey,
    status,
    reason: pl.reason,
    customer: sub?.customer.name ?? null,
    bezug: sub?.label ?? null,
    wasParked: extra.wasParked,
    name: pl.name,
    phone: pl.phone,
    email: pl.email,
    plz: pl.plz,
    contribution: pl.contribution != null ? `${pl.contribution} € im Monat` : null,
    insurer: pl.insurer,
    civilServant: pl.civilServant,
    answers: (Array.isArray(pl.answers) ? (pl.answers as { label: string; value: string }[]) : []).filter((a) => a?.label),
    createdAt: pl.createdAt,
    adminUrl: base ? `${base}${path}` : null,
  });
  const { sendCustomerMail } = await import("@/lib/email");
  const res = await sendCustomerMail({
    to: adminMailAn(),
    subject: m.subject,
    greeting: "Hallo,",
    paragraphs: m.paragraphs,
    list: m.list,
    ...(base ? { button: { label: "Im Admin ansehen", url: `${base}${path}` } } : {}),
    signature: PROVIDER.brand,
    replyTo: pl.email ?? null,
  });
  if (!res.ok) console.warn(`[ppl-admin-mail] ${poolLeadId}: ${res.error}`);
}
