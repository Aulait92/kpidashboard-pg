"use server";

import { redirect } from "next/navigation";
import { checkLimit, requestIp } from "@/lib/rate-limit";
import type { TerminFormState } from "@/components/termin/termin-form";
import {
  bookSalesMeeting,
  cancelSalesMeeting,
  loadBookingType,
  parseBookingInput,
  recordPreparation,
  rescheduleSalesMeeting,
  verifyContactToken,
  type InputError,
} from "@/lib/vertrieb/buchung";

// Öffentliche Vertriebs-Buchung (/termin), ohne Login: alles serverseitig prüfen.

const INPUT_ERRORS: Record<InputError, string> = {
  name: "Bitte geben Sie Ihren Vor- und Nachnamen an.",
  email: "Bitte geben Sie eine gültige E-Mail-Adresse an.",
  phone: "Bitte geben Sie eine gültige Telefonnummer an.",
  company: "Bitte geben Sie Ihre Agentur oder Firma an.",
  role: "Bitte wählen Sie, ob Sie Vertreter oder Makler sind.",
  interest: "Bitte wählen Sie Ihr Interesse.",
  consent: "Bitte bestätigen Sie die Einwilligung.",
};

const BOOK_ERRORS = {
  unavailable: "Die Online-Buchung ist gerade nicht verfügbar. Bitte schreiben Sie uns an ole.kannapinn@performancegrowth.de.",
  slot: "Diese Uhrzeit ist nicht mehr buchbar. Bitte wählen Sie eine andere.",
  taken: "Diese Uhrzeit ist gerade vergeben worden. Bitte wählen Sie eine andere.",
  error: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
  not_found: "Dieser Link ist ungültig.",
  closed: "Dieser Termin kann nicht mehr geändert werden.",
} as const;

const embedQ = (fd: FormData) => (fd.get("einbetten") === "1" ? "einbetten=1&" : "");

function valuesOf(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["start", "name", "email", "phone", "company", "role", "interest", "message", "consent"]) {
    const v = fd.get(k);
    if (typeof v === "string") out[k] = v.slice(0, 1000);
  }
  return out;
}

export async function bookTerminAction(_prev: TerminFormState, fd: FormData): Promise<TerminFormState> {
  const values = valuesOf(fd);
  if (!checkLimit("publicBooking", await requestIp()).ok) return { error: "Gerade gehen sehr viele Buchungen ein. Bitte versuchen Sie es in ein paar Minuten erneut.", values };
  // Bot-Falle: unsichtbares Feld ausgefüllt UND blitzschnell abgeschickt
  const renderedAt = Number(fd.get("rendered_at") ?? 0);
  if (String(fd.get("zq_hp_field") ?? "").trim() && (!renderedAt || Date.now() - renderedAt < 3000)) return { error: BOOK_ERRORS.error, values };

  const type = await loadBookingType(String(fd.get("art") ?? ""));
  if (!type?.active) return { error: BOOK_ERRORS.unavailable, values };
  const start = new Date(String(fd.get("start") ?? ""));
  if (Number.isNaN(start.getTime())) return { error: "Bitte wählen Sie eine Uhrzeit.", values };
  const parsed = parseBookingInput(fd);
  if (!parsed.ok) return { error: INPUT_ERRORS[parsed.error], values };

  const res = await bookSalesMeeting({ type, start, input: parsed.input, knownContactId: verifyContactToken(String(fd.get("k") ?? "")) });
  if (!res.ok) return { error: BOOK_ERRORS[res.error], values: { ...values, start: res.error === "taken" || res.error === "slot" ? "" : values.start } };
  const q = `${embedQ(fd)}gebucht=1`;
  redirect(type.thanksPage ? `/termin/danke/${res.manageToken}?${q}` : `/termin/verwalten/${res.manageToken}?${q}`);
}

export async function rescheduleTerminAction(_prev: TerminFormState, fd: FormData): Promise<TerminFormState> {
  if (!checkLimit("publicBooking", await requestIp()).ok) return { error: "Bitte versuchen Sie es in ein paar Minuten erneut." };
  const token = String(fd.get("token") ?? "");
  const start = new Date(String(fd.get("start") ?? ""));
  if (Number.isNaN(start.getTime())) return { error: "Bitte wählen Sie eine Uhrzeit." };
  const res = await rescheduleSalesMeeting(token, start);
  if (!res.ok) return { error: BOOK_ERRORS[res.error] };
  redirect(`/termin/verwalten/${res.token}?${embedQ(fd)}verschoben=1`);
}

export async function cancelTerminAction(fd: FormData): Promise<void> {
  const token = String(fd.get("token") ?? "");
  if (!checkLimit("publicBooking", await requestIp()).ok) redirect(`/termin/verwalten/${token}?${embedQ(fd)}fehler=1`);
  const res = await cancelSalesMeeting(token, { reason: String(fd.get("reason") ?? ""), by: "invitee" });
  redirect(`/termin/verwalten/${token}?${embedQ(fd)}${res.ok ? "abgesagt=1" : "fehler=1"}`);
}

/** Danke-Seite: „Video angesehen“ bzw. „Demo geöffnet“ am Kontakt vermerken (nur mit Buchungs-Token). */
export async function recordPreparationAction(token: string, what: "video" | "demo"): Promise<void> {
  if (what !== "video" && what !== "demo") return;
  if (!checkLimit("publicBooking", await requestIp()).ok) return;
  await recordPreparation(String(token), what).catch(() => {});
}
