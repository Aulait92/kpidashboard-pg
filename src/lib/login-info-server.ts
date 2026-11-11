// Infokarte der Login-Seite: Laden und Speichern (eine Zeile „default“).
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { DEFAULT_LOGIN_INFO, checkLoginInfoImage, parseLoginInfoInput, type LoginInfo } from "@/lib/login-info";

/** Gepflegte Karte oder der Standard-Inhalt (auch bei DB-Fehler: Login muss immer laden). */
export async function loadLoginInfo(): Promise<LoginInfo> {
  const row = await prisma.loginInfo
    .findUnique({
      where: { id: "default" },
      select: { enabled: true, badge: true, title: true, text: true, linkText: true, linkUrl: true, imageType: true, updatedAt: true },
    })
    .catch(() => null);
  if (!row) return DEFAULT_LOGIN_INFO;
  return {
    enabled: row.enabled,
    badge: row.badge,
    title: row.title,
    text: row.text,
    linkText: row.linkText,
    linkUrl: row.linkUrl,
    hasImage: !!row.imageType,
    version: row.updatedAt.getTime(),
  };
}

/** Bild für die öffentliche Auslieferung. */
export async function loadLoginInfoImage(): Promise<{ bytes: Uint8Array; type: string } | null> {
  const row = await prisma.loginInfo.findUnique({ where: { id: "default" }, select: { image: true, imageType: true } }).catch(() => null);
  if (!row?.image || !row.imageType) return null;
  return { bytes: new Uint8Array(row.image), type: row.imageType };
}

export type LoginInfoImageChange = { kind: "keep" } | { kind: "remove" } | { kind: "set"; bytes: Uint8Array; type: string };

/** Prüfen und speichern; bei Fehlern wird nichts gespeichert. */
export async function saveLoginInfo(
  raw: Record<string, unknown>,
  image: LoginInfoImageChange,
  actor?: AuditActor,
): Promise<{ ok: true; info: LoginInfo } | { ok: false; errors: string[] }> {
  const parsed = parseLoginInfoInput(raw);
  if (!parsed.ok) return parsed;
  let imageData: { image: Uint8Array<ArrayBuffer> | null; imageType: string | null } | null = null;
  if (image.kind === "set") {
    const check = checkLoginInfoImage(image.bytes, image.type);
    if (!check.ok) return { ok: false, errors: [check.error] };
    imageData = { image: new Uint8Array(image.bytes), imageType: check.type };
  } else if (image.kind === "remove") {
    imageData = { image: null, imageType: null };
  }
  const v = parsed.value;
  const data = { ...v, ...(imageData ?? {}) };
  await prisma.loginInfo.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  await audit("login_info.update", {
    entity: "LoginInfo",
    entityId: "default",
    actor,
    details: { aktiv: v.enabled, ueberschrift: v.title, link: v.linkUrl, bild: image.kind },
  });
  return { ok: true, info: await loadLoginInfo() };
}
