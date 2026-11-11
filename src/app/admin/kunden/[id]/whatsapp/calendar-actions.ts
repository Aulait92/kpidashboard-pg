"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  addBlock,
  changeAllianz,
  connectAllianz,
  deleteBlock,
  disconnectAllianz,
  updateLeadTimes,
  type SourceResult,
} from "@/lib/calendar/sources";

// Kundenakte → Verfügbarkeit: Admin stellt Allianz-Online-Kalender, Lead-Zeiten
// und Blockierungen des Agentur-Kalenders ein (customerId kommt aus dem Formular).

async function adminCustomer(fd: FormData): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return null;
  return String(fd.get("customerId") ?? "") || null;
}

const done = (customerId: string) => revalidatePath(`/admin/kunden/${customerId}/whatsapp`);

export async function adminConnectAllianzAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  const customerId = await adminCustomer(fd);
  if (!customerId) return { error: "Nicht erlaubt." };
  const res = await connectAllianz(customerId, String(fd.get("vertretung") ?? ""), fd.get("consent") === "on");
  if (res.ok) {
    await audit("calendar.allianz_connect", { customerId, entity: "AgentConfig", details: { by: "admin" } });
    done(customerId);
  }
  return res;
}

export async function adminChangeAllianzAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  const customerId = await adminCustomer(fd);
  if (!customerId) return { error: "Nicht erlaubt." };
  const res = await changeAllianz(customerId, String(fd.get("templateId") ?? ""), String(fd.get("resourceId") ?? "") || null);
  if (res.ok) {
    await audit("calendar.allianz_template", { customerId, entity: "AgentConfig" });
    done(customerId);
  }
  return res;
}

export async function adminDisconnectAllianzAction(fd: FormData): Promise<void> {
  const customerId = await adminCustomer(fd);
  if (!customerId) return;
  await disconnectAllianz(customerId);
  await audit("calendar.allianz_disconnect", { customerId, entity: "AgentConfig", details: { by: "admin" } });
  done(customerId);
}

export async function adminSaveLeadTimesAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  const customerId = await adminCustomer(fd);
  if (!customerId) return { error: "Nicht erlaubt." };
  const res = await updateLeadTimes(customerId, customerId, fd);
  if (res.ok) done(customerId);
  return res;
}

export async function adminAddBlockAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  const customerId = await adminCustomer(fd);
  if (!customerId) return { error: "Nicht erlaubt." };
  const res = await addBlock(customerId, customerId, fd);
  if (res.ok) done(customerId);
  return res;
}

export async function adminDeleteBlockAction(fd: FormData): Promise<void> {
  const customerId = await adminCustomer(fd);
  if (!customerId) return;
  await deleteBlock(customerId, String(fd.get("id") ?? ""));
  done(customerId);
}
