"use server";

// Einstellungen → Assistent → E-Mails in Ihrem Namen (Ole, 17.11.2026, Pakete M9 und M1): Erklärschritt bestätigen,
// Stufe je Vorlage, BCC-Kopie, Signaturangaben, Live-Vorschau. Nur der Inhaber ändert, nie in der Vorschau.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { ABLAUF_VORLAGEN, istMailAdresse, leseMailAblauf, mailAblaufJson, mitStufe, voreinstellungen, type MailStufe } from "@/lib/mail/ablauf";
import { serviceMailVorschau, type ServiceMailVorschau, type SignaturAngaben } from "@/lib/mail/service-mails";
import type { VorlageKey } from "@/lib/mail/vorlagen";

type Ergebnis = { ok: true } | { ok: false; error: string };

async function inhaber() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) throw new Error("In der Vorschau nicht möglich.");
  if (ctx.teamRole !== "owner") throw new Error("Nur der Inhaber kann das ändern.");
  return ctx;
}

const istVorlage = (k: string): k is VorlageKey => (ABLAUF_VORLAGEN as readonly string[]).includes(k);
const istStufe = (s: string): s is MailStufe => s === "auto" || s === "tipp" || s === "aus";
const feld = (v: unknown, n: number) => ohneGedankenstriche(String(v ?? "").trim()).slice(0, n);

/** Signaturangaben in die Erstinformation (nur ausgefüllte Felder; leere bleiben, wie sie sind). */
async function speichereAngaben(customerId: string, a: Partial<SignaturAngaben>): Promise<void> {
  const data = {
    ...(feld(a.name, 160) ? { name: feld(a.name, 160) } : {}),
    ...(feld(a.firma, 160) ? { firma: feld(a.firma, 160) } : {}),
    ...(feld(a.telefon, 60) ? { telefon: feld(a.telefon, 60) } : {}),
    ...(String(a.anschrift ?? "").trim() ? { anschrift: ohneGedankenstriche(String(a.anschrift).trim()).slice(0, 300) } : {}),
  };
  if (!Object.keys(data).length) return;
  const { getOrCreateErstinfo } = await import("@/lib/erstinformation");
  const { id } = await getOrCreateErstinfo(customerId);
  await prisma.erstinformation.update({ where: { id }, data });
}

async function speichereAblauf(customerId: string, fn: (a: ReturnType<typeof leseMailAblauf>) => ReturnType<typeof leseMailAblauf>): Promise<void> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { mailAblauf: true } });
  const neu = fn(leseMailAblauf(c?.mailAblauf));
  await prisma.customer.update({ where: { id: customerId }, data: { mailAblauf: mailAblaufJson(neu) } });
}

/**
 * „Ja, Mails in meinem Namen senden“: Voreinstellungen (bzw. die in der Liste gewählten Stufen), Kopie an die eigene
 * Adresse, fehlende Signaturangaben speichern.
 */
export async function serviceMailsBestaetigenAction(input: { stufen?: Record<string, string>; angaben?: Partial<SignaturAngaben>; anrede?: string }): Promise<Ergebnis> {
  try {
    const ctx = await inhaber();
    // Anrede des Vermittlers (Pflicht, Einrichtung P8/M9): nur setzen, wenn sie gefragt war
    if (input.anrede !== undefined) {
      if (!["Herr", "Frau", "keine"].includes(input.anrede)) return { ok: false, error: "Bitte die Anrede wählen." };
      const { getOrCreateErstinfo } = await import("@/lib/erstinformation");
      const { id } = await getOrCreateErstinfo(ctx.customerId);
      await prisma.erstinformation.update({ where: { id }, data: { anrede: input.anrede } });
    }
    await speichereAngaben(ctx.customerId, input.angaben ?? {});
    await speichereAblauf(ctx.customerId, () => {
      let a = voreinstellungen();
      for (const [k, s] of Object.entries(input.stufen ?? {})) if (istVorlage(k) && istStufe(s)) a = mitStufe(a, k, s);
      return a;
    });
    revalidatePath("/buyer/einstellungen/assistent");
    revalidatePath("/buyer", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

/** Stufe einer Vorlage (automatisch / ein Tipp / aus). */
export async function setMailStufeAction(key: string, stufe: string): Promise<Ergebnis> {
  try {
    const ctx = await inhaber();
    if (!istVorlage(key) || !istStufe(stufe)) return { ok: false, error: "Unbekannte Auswahl." };
    await speichereAblauf(ctx.customerId, (a) => mitStufe(a, key, stufe));
    revalidatePath("/buyer/einstellungen/assistent");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

/** Kopie jeder Mail (nur ohne Postfach): an/aus und Adresse (leer = eigene). */
export async function setMailKopieAction(input: { an: boolean; adresse?: string | null }): Promise<Ergebnis> {
  try {
    const ctx = await inhaber();
    const adresse = (input.adresse ?? "").trim().toLowerCase();
    if (adresse && !istMailAdresse(adresse)) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
    await speichereAblauf(ctx.customerId, (a) => ({ ...a, bcc: { an: !!input.an, adresse: adresse || null } }));
    revalidatePath("/buyer/einstellungen/assistent");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

/** Signaturangaben ändern (nach dem Erklärschritt). */
export async function signaturAngabenAction(angaben: Partial<SignaturAngaben>): Promise<Ergebnis> {
  try {
    const ctx = await inhaber();
    await speichereAngaben(ctx.customerId, angaben);
    revalidatePath("/buyer/einstellungen/assistent");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

/** Live-Vorschau mit den eingetippten Angaben (aus denselben Funktionen wie der Versand). */
export async function serviceMailVorschauAction(angaben: Partial<SignaturAngaben>): Promise<{ ok: true; vorschau: ServiceMailVorschau } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  const a = { name: feld(angaben.name, 160), firma: feld(angaben.firma, 160), telefon: feld(angaben.telefon, 60), anschrift: String(angaben.anschrift ?? "").slice(0, 300) };
  return { ok: true, vorschau: await serviceMailVorschau(ctx.customerId, { userId: ctx.userId, angaben: a }) };
}

/**
 * Terminarten (Ole, 18.11.2026): Telefon bzw. Termin vor Ort als Ausnahme auf ausdrücklichen Wunsch des Kunden
 * freigeben (Video immer). Gleiche Einstellung wie in der Einrichtung.
 */
export async function terminFormateSpeichernAction(f: { telefon?: unknown; vorOrt?: unknown }): Promise<Ergebnis> {
  let ctx;
  try {
    ctx = await inhaber();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  const { asTerminFormate } = await import("@/lib/termin-formate");
  const { saveTerminFormate } = await import("@/lib/termin-formate-server");
  const formate = asTerminFormate(f);
  await saveTerminFormate(ctx.customerId, formate);
  const { audit } = await import("@/lib/audit");
  await audit("kunde.terminarten", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: formate });
  revalidatePath("/buyer/einstellungen/assistent");
  return { ok: true };
}
