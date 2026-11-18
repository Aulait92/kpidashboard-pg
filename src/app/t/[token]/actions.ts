"use server";

// Antwortseite der Mail-Strecke (E3/E4): alles Speichernde nur per POST (Server-Aktion nach Klick im Browser). Abruf der
// Seite per Link (auch durch Link-Scanner der Mailprogramme) speichert nichts. Öffentlich, ohne Login: Token prüfen,
// Drosselung je IP.

import { redirect } from "next/navigation";
import { checkLimit, requestIp } from "@/lib/rate-limit";
import { pruefeStreckenToken } from "@/lib/mail-strecke/token";
import {
  adresseSetzen,
  angabenSpeichern,
  antwortSpeichern,
  komplettcheckSetzen,
  seiteGeoeffnet,
  streckeAbmelden,
  terminFestmachen,
} from "@/lib/mail-strecke/server";

async function pruefen(token: string): Promise<string> {
  const id = pruefeStreckenToken(token);
  if (!id) redirect(`/t/${encodeURIComponent(token)}`);
  if (!checkLimit("publicBooking", `strecke:${await requestIp()}`).ok) redirect(`/t/${token}?f=busy`);
  return id!;
}

/** Seite im Browser geöffnet (Aufruf aus dem Browser nach dem Laden): stoppt das Nachfassen. */
export async function gesehenAction(token: string): Promise<void> {
  const id = pruefeStreckenToken(token);
  if (id) await seiteGeoeffnet(id).catch(() => null);
}

export async function antwortAction(token: string, formData: FormData): Promise<void> {
  const id = await pruefen(token);
  const i = Number(formData.get("antwort"));
  const r = Number.isInteger(i) ? await antwortSpeichern(id, i) : { ok: false };
  redirect(`/t/${token}${r.ok ? "?danke=1" : "?f=antwort"}`);
}

export async function terminAction(token: string, formData: FormData): Promise<void> {
  const id = await pruefen(token);
  const start = String(formData.get("start") ?? "");
  const mode = formData.get("mode") === "phone" ? "phone" : "video";
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const r = await terminFestmachen(id, { start, mode, phone });
  if (r.ok) redirect(`/t/${token}`);
  redirect(`/t/${token}?f=${r.grund}`);
}

export async function komplettcheckAction(token: string, formData: FormData): Promise<void> {
  const id = await pruefen(token);
  await komplettcheckSetzen(id, formData.get("ja") === "1");
  redirect(`/t/${token}`);
}

export async function angabenAction(token: string, formData: FormData): Promise<void> {
  const id = await pruefen(token);
  const werte: Record<string, string> = {};
  if (formData.get("ueberspringen") !== "1") for (const [k, v] of formData.entries()) if (k.startsWith("f_") && typeof v === "string") werte[k.slice(2)] = v;
  await angabenSpeichern(id, werte);
  redirect(`/t/${token}`);
}

export async function adresseAction(token: string, formData: FormData): Promise<void> {
  const id = await pruefen(token);
  const r = await adresseSetzen(id, { email: String(formData.get("email") ?? "") || null });
  redirect(`/t/${token}${r.ok ? "" : "?f=email"}`);
}

export async function abmeldenAction(token: string): Promise<void> {
  const id = await pruefen(token);
  await streckeAbmelden(id);
  redirect(`/t/${token}?ab=fertig`);
}
