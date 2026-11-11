"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isComponentKey } from "@/lib/status";
import { requireAuth } from "@/lib/vertrieb/auth";

export type IncidentFormState = { ok?: boolean; error?: string; savedAt?: number };

const LEVELS = ["info", "degraded", "down"] as const;

function refresh() {
  revalidatePath("/status");
  revalidatePath("/admin/einstellungen/status");
}

/** Neue Meldung für die öffentliche Statusseite (nur Admin, mit Änderungsprotokoll). */
export async function createIncidentAction(_prev: IncidentFormState, fd: FormData): Promise<IncidentFormState> {
  await requireAuth();
  const title = String(fd.get("title") ?? "").trim().slice(0, 120);
  const message = String(fd.get("message") ?? "").trim().slice(0, 1000) || null;
  const level = String(fd.get("level") ?? "degraded");
  const component = String(fd.get("component") ?? "");
  if (title.length < 3) return { error: "Bitte eine Überschrift eingeben." };
  if (!(LEVELS as readonly string[]).includes(level)) return { error: "Bitte eine Art wählen." };
  const inc = await prisma.statusIncident.create({
    data: { title, message, level, component: isComponentKey(component) ? component : null },
  });
  await audit("status.incident", { entity: "StatusIncident", entityId: inc.id, details: { action: "create", level, component: inc.component } });
  refresh();
  return { ok: true, savedAt: Date.now() };
}

export async function resolveIncidentAction(fd: FormData): Promise<void> {
  await requireAuth();
  const id = String(fd.get("id") ?? "");
  await prisma.statusIncident.update({ where: { id }, data: { resolvedAt: new Date() } });
  await audit("status.incident", { entity: "StatusIncident", entityId: id, details: { action: "resolve" } });
  refresh();
}

export async function deleteIncidentAction(fd: FormData): Promise<void> {
  await requireAuth();
  const id = String(fd.get("id") ?? "");
  await prisma.statusIncident.delete({ where: { id } }).catch(() => null);
  await audit("status.incident", { entity: "StatusIncident", entityId: id, details: { action: "delete" } });
  refresh();
}
