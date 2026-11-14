"use server";

// LinkedIn (Admin → Marketing → LinkedIn): Entwürfe freigeben, Einstellungen, Fotos, Statistik-Import.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { audit } from "@/lib/audit";
import { approveNow, approvePost, getSettings, icpTerms, imageFields, MAX_POSTS_PER_DAY, parseSlots, postingDays } from "@/lib/linkedin/posts";
import { generateDrafts } from "@/lib/linkedin/drafts";
import { addPhoto } from "@/lib/linkedin/photos";
import { importFile } from "@/lib/linkedin/import";

const PATH = "/admin/marketing/linkedin";
export type LiResult = { ok?: boolean; error?: string; info?: string };
const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const msg = (e: unknown) => (e instanceof Error ? e.message : "Nicht möglich.");

/** image: "keins" | "grafik" | Foto-ID */
export async function approveAction(id: string, text: string, image: string, now = false): Promise<LiResult> {
  await requireAuth();
  try {
    const res = now ? await approveNow(id, text, new Date(), image) : await approvePost(id, text, new Date(), image);
    revalidatePath(PATH);
    if (!res.ok) return { error: res.error };
    return { ok: true, info: now ? "Veröffentlicht." : `Freigegeben für ${fmt(res.scheduledAt)}.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

/** Text/Bild eines Entwurfs speichern, ohne freizugeben. image: "keins" | "grafik" | Foto-ID */
export async function saveDraftAction(id: string, text: string, image: string, graphic?: string): Promise<LiResult> {
  await requireAuth();
  const post = await prisma.linkedInPost.findFirst({ where: { id, status: { in: ["entwurf", "fehler"] } }, select: { graphic: true } });
  if (!post) return { error: "Entwurf nicht gefunden." };
  const g = graphic !== undefined ? graphic.trim().slice(0, 120) || null : post.graphic;
  await prisma.linkedInPost.update({ where: { id }, data: { text: text.trim().slice(0, 3000), graphic: g, ...(await imageFields(image, g)) } });
  revalidatePath(PATH);
  return { ok: true, info: "Gespeichert." };
}

export async function discardAction(id: string): Promise<LiResult> {
  await requireAuth();
  await prisma.linkedInPost.updateMany({ where: { id, status: { in: ["entwurf", "fehler", "freigegeben"] } }, data: { status: "verworfen" } });
  revalidatePath(PATH);
  return { ok: true };
}

/** Freigabe zurücknehmen (wieder Entwurf). */
export async function unapproveAction(id: string): Promise<LiResult> {
  await requireAuth();
  await prisma.linkedInPost.updateMany({ where: { id, status: "freigegeben" }, data: { status: "entwurf" } });
  revalidatePath(PATH);
  return { ok: true };
}

/** Entwürfe für die nächsten `days` Posting-Tage schreiben (nur Tage mit freien Uhrzeiten). */
export async function generateNowAction(days = 1): Promise<LiResult> {
  await requireAuth();
  const settings = await getSettings();
  if (!settings.about.trim()) return { error: "Bitte zuerst „Über mich“ in den Einstellungen ausfüllen." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "KI ist auf diesem Server nicht eingerichtet (ANTHROPIC_API_KEY)." };
  const n = Math.max(1, Math.min(14, Math.round(days) || 1));
  let made = 0;
  try {
    for (const day of postingDays(settings, new Date(), n, { includeToday: true })) made += await generateDrafts(day, { push: false });
    revalidatePath(PATH);
    return made
      ? { ok: true, info: `${made} neue Entwürfe für die nächsten ${n === 1 ? "Posting-Tag" : `${n} Posting-Tage`}.` }
      : { ok: true, info: n === 1 ? "Für den nächsten Posting-Tag sind schon alle Uhrzeiten belegt." : `Die nächsten ${n} Posting-Tage sind schon voll geplant.` };
  } catch (e) {
    revalidatePath(PATH);
    return { error: `${made ? `${made} Entwürfe geschrieben, dann: ` : ""}${msg(e)}` };
  }
}

export async function saveSettingsAction(_prev: LiResult, fd: FormData): Promise<LiResult> {
  await requireAuth();
  const postsPerDay = Math.max(1, Math.min(MAX_POSTS_PER_DAY, Number(fd.get("postsPerDay") ?? 5) || 5));
  const slots = parseSlots(String(fd.get("slots") ?? ""));
  if (slots.length < postsPerDay) return { error: `Bitte mindestens ${postsPerDay} Uhrzeiten angeben (z. B. 07:30, 12:00, 18:00).` };
  const draftHour = Math.max(0, Math.min(23, Number(fd.get("draftHour") ?? 17) || 17));
  const planDays = Math.max(1, Math.min(14, Number(fd.get("planDays") ?? 1) || 1));
  const icpKeywords = String(fd.get("icpKeywords") ?? "").slice(0, 2000);
  if (!icpTerms(icpKeywords).length) return { error: "Bitte mindestens einen Begriff für die Zielgruppe angeben." };
  await getSettings();
  await prisma.linkedInSettings.update({
    where: { id: "default" },
    data: {
      postsPerDay,
      slots: slots.join(", "),
      weekdays: fd.get("weekdays") === "on",
      autoDrafts: fd.get("autoDrafts") === "on",
      draftHour,
      planDays,
      about: String(fd.get("about") ?? "").slice(0, 4000),
      icp: String(fd.get("icp") ?? "").slice(0, 4000),
      focus: String(fd.get("focus") ?? "").slice(0, 2000),
      icpKeywords,
      trustNotes: String(fd.get("trustNotes") ?? "").slice(0, 6000),
    },
  });
  revalidatePath(PATH);
  return { ok: true, info: "Gespeichert." };
}

export async function uploadPhotosAction(_prev: LiResult, fd: FormData): Promise<LiResult> {
  await requireAuth();
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Bitte Fotos auswählen." };
  const errors: string[] = [];
  let added = 0;
  for (const f of files.slice(0, 20)) {
    const res = await addPhoto({ name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) });
    if (res.ok) added++;
    else errors.push(res.error);
  }
  revalidatePath(PATH);
  return errors.length ? { error: `${added} hochgeladen. ${errors.join(" ")}` } : { ok: true, info: `${added} Foto${added === 1 ? "" : "s"} hochgeladen.` };
}

export async function updatePhotoAction(id: string, description: string): Promise<LiResult> {
  await requireAuth();
  await prisma.linkedInPhoto.update({ where: { id }, data: { description: description.trim().slice(0, 300) } });
  revalidatePath(PATH);
  return { ok: true, info: "Gespeichert." };
}

export async function deletePhotoAction(id: string): Promise<LiResult> {
  await requireAuth();
  await prisma.linkedInPhoto.deleteMany({ where: { id } });
  revalidatePath(PATH);
  return { ok: true };
}

export async function importAction(_prev: LiResult, fd: FormData): Promise<LiResult> {
  await requireAuth();
  const f = fd.get("file");
  if (!(f instanceof File) || !f.size) return { error: "Bitte die Export-Datei auswählen." };
  if (f.size > 10 * 1024 * 1024) return { error: "Datei zu groß (höchstens 10 MB)." };
  if (!/\.(xlsx|csv)$/i.test(f.name)) return { error: "Bitte die Excel-Datei (.xlsx) oder CSV aus LinkedIn hochladen." };
  try {
    const settings = await getSettings();
    const res = await importFile(f.name, Buffer.from(await f.arrayBuffer()), icpTerms(settings.icpKeywords));
    revalidatePath(PATH);
    if (res.kind === "leer") return { error: "In der Datei wurden keine Posts oder Zuschauerdaten erkannt. Bitte den Export aus LinkedIn (Statistiken → Exportieren) nehmen." };
    const icp = res.icpShare != null ? ` Zielgruppe: ${Math.round(res.icpShare * 100)} %${res.kind === "profil" ? " (ganzes Profil)" : " (dieser Post)"}.` : "";
    const open = res.unmatched ? ` ${res.unmatched} Post(s) nicht eindeutig zuzuordnen (mehrere am selben Tag) – bitte den Export je Post hochladen.` : "";
    return { ok: true, info: `${res.rows} Post(s) gelesen, ${res.matched} zugeordnet, ${res.created} ältere neu angelegt.${icp}${open}` };
  } catch (e) {
    return { error: `Datei nicht lesbar: ${msg(e)}` };
  }
}

/** Text eines importierten (älteren) Posts ergänzen – damit die KI daraus lernen kann. */
export async function setImportedTextAction(id: string, text: string): Promise<LiResult> {
  await requireAuth();
  await prisma.linkedInPost.updateMany({ where: { id, status: "importiert" }, data: { text: text.trim().slice(0, 3000) } });
  revalidatePath(PATH);
  return { ok: true, info: "Gespeichert." };
}

/** Zahlen von Hand (z. B. aus der LinkedIn-App abgelesen). */
export async function setMetricsAction(id: string, impressions: number | null, icpPercent: number | null): Promise<LiResult> {
  await requireAuth();
  if (impressions != null && (!Number.isFinite(impressions) || impressions < 0)) return { error: "Ungültige Impressionen." };
  if (icpPercent != null && (!Number.isFinite(icpPercent) || icpPercent < 0 || icpPercent > 100)) return { error: "Zielgruppe in Prozent (0–100)." };
  await prisma.linkedInPost.update({
    where: { id },
    data: {
      ...(impressions != null ? { impressions: Math.round(impressions), metricsSource: "hand", metricsAt: new Date() } : {}),
      ...(icpPercent != null ? { icpShare: icpPercent / 100 } : {}),
    },
  });
  revalidatePath(PATH);
  return { ok: true, info: "Gespeichert." };
}

export async function disconnectAction(): Promise<LiResult> {
  const session = await requireAuth();
  await prisma.linkedInConnection.deleteMany({});
  await audit("linkedin.disconnect", { entity: "LinkedInConnection", entityId: session.userId });
  revalidatePath(PATH);
  return { ok: true };
}
