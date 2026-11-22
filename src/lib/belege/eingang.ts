// Beleg-Adresse (Ole, 22.11.2026): belege-<token>@antwort.dein-beratungstermin.de. Jede Mail an diese Adresse (z. B. per
// Weiterleitungsregel aus Gmail/Outlook) legt ihre PDF- und Bild-Anhänge als Belege ab (lib/belege/ablage.ts) und ordnet
// sie den Kontoumsätzen zu. Das Token (HMAC aus AUTH_SECRET) hält Fremde fern; die Adresse steht nur auf der Belege-Seite.
// Kleine Inline-Bilder (Logos in Signaturen) werden übersprungen. Gmail-Bestätigungsmails für eine Weiterleitung werden
// als Hinweis an die Admins gemeldet (Code steht im Betreff).

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ANTWORT_DOMAIN } from "@/lib/mail/antwort-adresse";
import type { EingangApi } from "@/lib/mail/eingang-api";

export function belegToken(secret = process.env.AUTH_SECRET ?? "dev-secret"): string {
  return crypto.createHmac("sha256", secret).update("belege-eingang").digest("hex").slice(0, 10);
}

export function belegAdresse(secret?: string): string {
  return `belege-${belegToken(secret)}@${ANTWORT_DOMAIN}`;
}

/** Ist das die Beleg-Adresse? (Groß/Kleinschreibung egal, auch „Name <adresse>“) */
export function istBelegAdresse(adresse: string | null | undefined, secret?: string): boolean {
  if (!adresse) return false;
  const m = adresse.toLowerCase().match(/[a-z0-9._+-]+@[a-z0-9.-]+/);
  return !!m && m[0] === belegAdresse(secret).toLowerCase();
}

const KLEINES_BILD = 30 * 1024;

export async function verarbeiteBelegMail(o: { eingangId: string; emailId: string; api: EingangApi }): Promise<{ ergebnis: "beleg"; neu: number; doppelt: number }> {
  const { belegAblegen } = await import("./ablage");
  const mail = await o.api.mail(o.emailId);
  const absender = mail.from || null;
  // Gmail: Bestätigung der Weiterleitung (Code im Betreff) an die Admins melden
  if (/forwarding-noreply@google\.com/i.test(mail.from) || /Gmail.*(Weiterleitung|Forwarding)/i.test(mail.subject)) {
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({ title: "Gmail-Weiterleitung bestätigen", body: mail.subject.slice(0, 160), url: "/admin/neu/zahlen/kosten/belege" }).catch(() => {});
  }
  const anhaenge = await o.api.anhaenge(o.emailId);
  let neu = 0;
  let doppelt = 0;
  for (const a of anhaenge) {
    if (a.inline && a.size < KLEINES_BILD) continue;
    if (!/pdf|zip|image\/(jpeg|png|webp)|octet-stream/i.test(a.contentType) && !/\.(pdf|zip|jpe?g|png)$/i.test(a.filename ?? "")) continue;
    const frisch = a.downloadUrl ? a : await o.api.anhang(o.emailId, a.id);
    if (!frisch?.downloadUrl) continue;
    const daten = await o.api.datei(frisch.downloadUrl, 60 * 1024 * 1024);
    const e = await belegAblegen({ daten, name: a.filename, quelle: "mail", absender });
    neu += e.filter((x) => x.ergebnis === "neu").length;
    doppelt += e.filter((x) => x.ergebnis === "doppelt").length;
  }
  await prisma.mailEingang.update({ where: { id: o.eingangId }, data: { ergebnis: "beleg", grund: `neu ${neu}, doppelt ${doppelt}`.slice(0, 80) } });
  if (neu) {
    const { belegeAbgleichen } = await import("./server");
    await belegeAbgleichen().catch(() => 0);
  }
  return { ergebnis: "beleg", neu, doppelt };
}

/**
 * Mails an die Beleg-Adresse selbst bei Resend abholen (unabhängig davon, ob das Webhook-Ereignis email.received aktiv ist).
 * Doppelte Verarbeitung verhindert der Eintrag je Resend-ID in MailEingang (lib/mail/eingang.ts). Alle 15 Minuten (Cron)
 * und per Ops-Aktion belege_postfach.
 */
export async function belegePostfachAbholen(): Promise<{ gesehen: number; verarbeitet: number }> {
  const apiKey = process.env.RESEND_EMPFANG_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { gesehen: 0, verarbeitet: 0 };
  const { Resend } = await import("resend");
  const r = new Resend(apiKey);
  const res = await r.emails.receiving.list({ limit: 100 });
  if (res.error || !res.data) throw new Error(`resend_receiving_list:${res.error?.name ?? "leer"}`);
  const fuerBelege = res.data.data.filter((m) => (m.to ?? []).some((a) => istBelegAdresse(a)));
  if (!fuerBelege.length) return { gesehen: 0, verarbeitet: 0 };
  const bekannt = new Set(
    (await prisma.mailEingang.findMany({ where: { resendEmailId: { in: fuerBelege.map((m) => m.id) }, ergebnis: { in: ["beleg", "ignoriert"] } }, select: { resendEmailId: true } })).map((x) => x.resendEmailId),
  );
  const { verarbeiteMailEingang } = await import("@/lib/mail/eingang");
  let verarbeitet = 0;
  for (const m of fuerBelege) {
    if (bekannt.has(m.id)) continue;
    const e = await verarbeiteMailEingang({ type: "email.received", data: { email_id: m.id, to: m.to ?? [], from: m.from ?? undefined } });
    if (e.ergebnis === "beleg") verarbeitet++;
  }
  return { gesehen: fuerBelege.length, verarbeitet };
}
