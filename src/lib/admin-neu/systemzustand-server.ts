// Systemzustand laden (Admin v2, Paket A5): jede Prüfung einzeln abgesichert, ein Fehler beim Prüfen wird selbst zur
// Warnung („konnte nicht geprüft werden“), die Seite lädt immer. Nur lesend, keine Aufrufe, die etwas ändern.

import { HEARTBEAT_MAX_AGE_MIN } from "@/lib/heartbeat";
import { metaDiagnostics } from "@/lib/meta-leads";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { loadAccountCheck } from "@/lib/rechnungsangaben";
import { STATUS_COMPONENTS } from "@/lib/status";
import { activeIncidents, currentStatus } from "@/lib/status-server";
import { placesDailyLimit, placesKey, placesUsedToday } from "@/lib/vertrieb/contact-enrich";
import { NEU } from "./navigation";
import { herzschlag, kontingent, mailEingang, sortiere, werbekosten, zugang, zustellung, type Ampel, type Pruefung } from "./systemzustand";

const BANK_WARN_TAGE = 7;
const LINKEDIN_WARN_TAGE = 14;

async function sicher(key: string, titel: string, href: string, knopf: string, f: () => Promise<{ ampel: Ampel; text: string }>): Promise<Pruefung> {
  try {
    return { key, titel, href, knopf, ...(await f()) };
  } catch (err) {
    reportError(err, `systemzustand-${key}`);
    return { key, titel, href, knopf, ampel: "warnung", text: "Konnte gerade nicht geprüft werden." };
  }
}

export async function ladeSystemzustand(now = new Date()): Promise<Pruefung[]> {
  const STATUS = `${NEU}/einstellungen/status`;
  const ANBINDUNGEN = `${NEU}/einstellungen/anbindungen`;
  const beats = prisma.systemHeartbeat.findMany().catch(() => [] as { key: string; at: Date; ok: boolean; note: string | null }[]);
  const liste = await Promise.all([
    sicher("status", "Statusseite für Kunden", STATUS, "Status", async () => {
      const [s, meldungen] = await Promise.all([currentStatus(now), activeIncidents(now)]);
      const gestoert = STATUS_COMPONENTS.filter((c) => s[c.key] !== "ok");
      if (gestoert.some((c) => s[c.key] === "down")) return { ampel: "fehler", text: `Ausfall: ${gestoert.map((c) => c.label).join(", ")}.` };
      if (gestoert.length) return { ampel: "warnung", text: `Eingeschränkt: ${gestoert.map((c) => c.label).join(", ")}.` };
      return { ampel: "ok", text: meldungen.length ? `Alles in Ordnung, ${meldungen.length} Meldung aktiv.` : "Alle Bereiche in Ordnung." };
    }),
    sicher("jobs", "Hintergrund-Jobs", STATUS, "Status", async () => herzschlag((await beats).find((b) => b.key === "cron"), HEARTBEAT_MAX_AGE_MIN.cron, now)),
    sicher("sync", "Abgleich Werbedaten", STATUS, "Status", async () => herzschlag((await beats).find((b) => b.key === "sync"), HEARTBEAT_MAX_AGE_MIN.sync, now)),
    sicher("mail-eingang", "Mail-Eingang (Resend)", ANBINDUNGEN, "Anbindungen", async () => {
      const { EMPFANG_HEARTBEAT, empfangsSchluesselName } = await import("@/lib/mail/resend-empfang");
      return mailEingang((await beats).find((b) => b.key === EMPFANG_HEARTBEAT), empfangsSchluesselName());
    }),
    sicher("werbekosten", "Werbekosten je Anzeige", `${NEU}/leads/werbekonten`, "Werbekonten", async () => {
      const z = await prisma.adSpendDaily.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
      return werbekosten(z?.date ?? null, now);
    }),
    sicher("meta", "Meta-Verbindung", ANBINDUNGEN, "Anbindungen", async () => {
      const d = await metaDiagnostics();
      if (!d.tokenSet) return { ampel: "fehler", text: "System-User-Token fehlt (META_ACCESS_TOKEN)." };
      if (d.error) return { ampel: "fehler", text: `Meta meldet: ${d.error.slice(0, 120)}` };
      const fehlt = [!d.appSecretSet && "App-Geheimschlüssel", !d.verifyTokenSet && "Webhook-Token", ...d.missing].filter(Boolean);
      return fehlt.length ? { ampel: "warnung", text: `Fehlt: ${fehlt.join(", ")}.` } : { ampel: "ok", text: "Token, Rechte und Webhook in Ordnung." };
    }),
    sicher("stripe", "Stripe-Konto", `${NEU}/einstellungen/rechnungsangaben`, "Rechnungsangaben", async () => {
      const r = await loadAccountCheck();
      if ("error" in r) return { ampel: "fehler", text: r.error };
      const offen = r.checks.filter((c) => !c.ok);
      if (r.livemode === false) return { ampel: "warnung", text: "Testmodus: Rechnungen gehen nicht wirklich raus." };
      return offen.length ? { ampel: "warnung", text: `Pflichtangaben prüfen: ${offen.map((c) => c.label).join(", ")}.` } : { ampel: "ok", text: "Pflichtangaben vollständig." };
    }),
    sicher("whatsapp", "WhatsApp-Zustellung", `${NEU}/zahlen/qualitaet`, "Ansehen", async () =>
      zustellung(await prisma.message.count({ where: { direction: "outbound", status: "failed", createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } } })),
    ),
    sicher("bank", "Bankverbindung", `${NEU}/zahlen/kosten/konten`, "Konten & Regeln", async () => {
      const k = await prisma.bankConnection.findMany({ where: { status: { not: "pending" } }, select: { aspspName: true, status: true, validUntil: true, lastError: true } });
      if (!k.length) return zugang(null, BANK_WARN_TAGE, now);
      const bewertet = k.map((c) => ({ c, b: zugang({ status: c.status, bis: c.validUntil, fehler: c.lastError }, BANK_WARN_TAGE, now) }));
      const schlimm = sortiere(bewertet.map((x) => ({ key: x.c.aspspName, titel: x.c.aspspName, ampel: x.b.ampel, text: x.b.text, href: "", knopf: "" })))[0];
      return { ampel: schlimm.ampel, text: k.length > 1 ? `${schlimm.titel}: ${schlimm.text}` : schlimm.text };
    }),
    sicher("linkedin", "LinkedIn-Zugang", ANBINDUNGEN, "Anbindungen", async () => {
      const li = await prisma.linkedInConnection.findFirst({ orderBy: { updatedAt: "desc" }, select: { status: true, expiresAt: true, lastError: true } });
      return zugang(li ? { status: li.status, bis: li.expiresAt, fehler: li.lastError } : null, LINKEDIN_WARN_TAGE, now);
    }),
    sicher("google", "Google-Kontingent (Kontakte anreichern)", ANBINDUNGEN, "Anbindungen", async () => kontingent(await placesUsedToday(), placesDailyLimit(), !!placesKey())),
  ]);
  return sortiere(liste);
}
