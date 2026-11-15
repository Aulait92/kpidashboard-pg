// Infokarten der Login-Seite: Laden, Speichern, Reihenfolge, Klicks (Tabelle LoginCard).
import { prisma } from "@/lib/prisma";
import { BESTAND_MODULE_AVAILABLE } from "@/lib/bestand/sichtbar";
import { audit, type AuditActor } from "@/lib/audit";
import { checkLoginInfoImage, parseLoginInfoInput } from "@/lib/login-info";

export type LoginCardView = {
  id: string;
  /** Fester Schlüssel (z. B. „kollegen“): Text kann später aus Einstellungen kommen. */
  key: string | null;
  position: number;
  enabled: boolean;
  badge: string | null;
  title: string;
  text: string | null;
  linkText: string | null;
  linkUrl: string | null;
  /** Hochgeladenes Bild (Route) oder Datei aus /public; null = Zierde ohne Bild. */
  imageSrc: string | null;
  /** Bild ist hochgeladen (nicht nur eine Datei aus /public). */
  uploaded: boolean;
  clicks: number;
};

const SELECT = {
  id: true,
  key: true,
  position: true,
  enabled: true,
  badge: true,
  title: true,
  text: true,
  linkText: true,
  linkUrl: true,
  imageType: true,
  imagePath: true,
  clicks: true,
  updatedAt: true,
} as const;

type Row = { id: string; key: string | null; position: number; enabled: boolean; badge: string | null; title: string; text: string | null; linkText: string | null; linkUrl: string | null; imageType: string | null; imagePath: string | null; clicks: number; updatedAt: Date };

/** Nur Bilddateien aus /public (z. B. /login-karten/sparte.webp). */
function safeImagePath(p: string | null): string | null {
  return p && /^\/[\w\-/]+\.(webp|png|jpe?g)$/i.test(p) && !p.includes("..") ? p : null;
}

function toView(r: Row): LoginCardView {
  const uploaded = !!r.imageType;
  return {
    id: r.id,
    key: r.key,
    position: r.position,
    enabled: r.enabled,
    badge: r.badge,
    title: r.title,
    text: r.text,
    linkText: r.linkText,
    linkUrl: r.linkUrl,
    imageSrc: uploaded ? `/api/login-info/image?id=${encodeURIComponent(r.id)}&v=${r.updatedAt.getTime()}` : safeImagePath(r.imagePath),
    uploaded,
    clicks: r.clicks,
  };
}

const ORDER = [{ position: "asc" as const }, { createdAt: "asc" as const }];

/** Alle Karten (Admin), in Reihenfolge. */
export async function listLoginCards(): Promise<LoginCardView[]> {
  const rows = await prisma.loginCard.findMany({ select: SELECT, orderBy: ORDER });
  return rows.map(toView);
}

/** Aktive Karten für die Login-Seite (bei DB-Fehler keine: Login muss immer laden). */
/** Karten zu Modulen, die für Kunden gerade ausgeblendet sind (Ole, 15.11.2026: Bestandskunden-Modul erst testen). */
export const AUSGEBLENDETE_KARTEN: ReadonlySet<string> = new Set(BESTAND_MODULE_AVAILABLE ? [] : ["bestand"]);

export async function activeLoginCards(): Promise<LoginCardView[]> {
  const rows = await prisma.loginCard.findMany({ where: { enabled: true }, select: SELECT, orderBy: ORDER }).catch(() => []);
  return rows.filter((r) => !r.key || !AUSGEBLENDETE_KARTEN.has(r.key)).map(toView);
}

export async function loadLoginCard(id: string): Promise<LoginCardView | null> {
  const r = await prisma.loginCard.findUnique({ where: { id }, select: SELECT }).catch(() => null);
  return r ? toView(r) : null;
}

/** Hochgeladenes Bild für die öffentliche Auslieferung. */
export async function loadLoginCardImage(id: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!id || id.length > 64) return null;
  const row = await prisma.loginCard.findUnique({ where: { id }, select: { image: true, imageType: true } }).catch(() => null);
  if (!row?.image || !row.imageType) return null;
  return { bytes: new Uint8Array(row.image), type: row.imageType };
}

export type LoginCardImageChange = { kind: "keep" } | { kind: "remove" } | { kind: "set"; bytes: Uint8Array; type: string };

/** Karte anlegen (id null) oder ändern; bei Fehlern wird nichts gespeichert. */
export async function saveLoginCard(
  id: string | null,
  raw: Record<string, unknown>,
  image: LoginCardImageChange,
  actor?: AuditActor,
): Promise<{ ok: true; card: LoginCardView } | { ok: false; errors: string[] }> {
  const parsed = parseLoginInfoInput(raw);
  if (!parsed.ok) return parsed;
  let imageData: { image: Uint8Array<ArrayBuffer> | null; imageType: string | null; imagePath?: null } | null = null;
  if (image.kind === "set") {
    const check = checkLoginInfoImage(image.bytes, image.type);
    if (!check.ok) return { ok: false, errors: [check.error] };
    imageData = { image: new Uint8Array(image.bytes), imageType: check.type };
  } else if (image.kind === "remove") {
    imageData = { image: null, imageType: null, imagePath: null };
  }
  const v = parsed.value;
  const data = { ...v, ...(imageData ?? {}) };
  let saved: Row;
  if (id) {
    const exists = await prisma.loginCard.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return { ok: false, errors: ["Diese Karte gibt es nicht mehr."] };
    saved = await prisma.loginCard.update({ where: { id }, data, select: SELECT });
  } else {
    const last = await prisma.loginCard.aggregate({ _max: { position: true } });
    saved = await prisma.loginCard.create({ data: { ...data, position: (last._max.position ?? 0) + 1 }, select: SELECT });
  }
  await audit(id ? "login_card.update" : "login_card.create", {
    entity: "LoginCard",
    entityId: saved.id,
    actor,
    details: { aktiv: v.enabled, ueberschrift: v.title, link: v.linkUrl, bild: image.kind },
  });
  return { ok: true, card: toView(saved) };
}

/** An/aus. */
export async function toggleLoginCard(id: string, actor?: AuditActor): Promise<void> {
  const c = await prisma.loginCard.findUnique({ where: { id }, select: { enabled: true, title: true } });
  if (!c) return;
  await prisma.loginCard.update({ where: { id }, data: { enabled: !c.enabled } });
  await audit("login_card.toggle", { entity: "LoginCard", entityId: id, actor, details: { aktiv: !c.enabled, ueberschrift: c.title } });
}

/** Eine Stelle nach oben (-1) oder unten (+1); danach Positionen 1..n ohne Lücken. */
export async function moveLoginCard(id: string, dir: -1 | 1, actor?: AuditActor): Promise<void> {
  const all = await prisma.loginCard.findMany({ select: { id: true }, orderBy: ORDER });
  const i = all.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((c, k) => prisma.loginCard.update({ where: { id: c.id }, data: { position: k + 1 } })));
  await audit("login_card.move", { entity: "LoginCard", entityId: id, actor, details: { richtung: dir < 0 ? "hoch" : "runter" } });
}

export async function deleteLoginCard(id: string, actor?: AuditActor): Promise<void> {
  const c = await prisma.loginCard.findUnique({ where: { id }, select: { title: true } });
  if (!c) return;
  await prisma.loginCard.delete({ where: { id } });
  await audit("login_card.delete", { entity: "LoginCard", entityId: id, actor, details: { ueberschrift: c.title } });
}

/** Klick auf den Link der Karte zählen; liefert den Link (null = Karte/Link fehlt). */
export async function countLoginCardClick(id: string): Promise<string | null> {
  if (!id || id.length > 64) return null;
  // Ohne updatedAt zu ändern (sonst wechselt der Cache-Schlüssel des Bildes bei jedem Klick)
  const rows = await prisma.$queryRaw<{ linkUrl: string | null }[]>`
    UPDATE "LoginCard" SET "clicks" = "clicks" + 1 WHERE "id" = ${id} RETURNING "linkUrl"`.catch(() => []);
  return rows[0]?.linkUrl ?? null;
}
