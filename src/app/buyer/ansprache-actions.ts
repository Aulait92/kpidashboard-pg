"use server";

// Ansprache von Leads und Kunden (Sie/Du) je Kunde ändern (Ole, 14.11.2026). Nur Inhaber.
// Unveränderte Standard-E-Mail-Vorlagen ziehen mit; die passenden WhatsApp-Vorlagen werden bei Meta eingereicht.

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { asAnsprache } from "@/lib/ansprache";
import { vorlagenAufAnsprache } from "@/lib/mail/vorlagen";

export type AnspracheState = { ok?: boolean; error?: string; message?: string };

export async function setAnspracheAction(_prev: AnspracheState, fd: FormData): Promise<AnspracheState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { error: "Nur der Inhaber kann die Ansprache ändern." };
  const neu = asAnsprache(String(fd.get("ansprache") ?? ""));
  const before = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { leadAddress: true, whatsAppAccount: { select: { status: true } } } });
  if (asAnsprache(before?.leadAddress) === neu) return { ok: true, message: "Gespeichert." };
  await prisma.customer.update({ where: { id: ctx.customerId }, data: { leadAddress: neu } });
  const moved = await vorlagenAufAnsprache(ctx.customerId, neu);
  await audit("kunde.ansprache", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { ansprache: neu, mailVorlagen: moved } });
  const wa = before?.whatsAppAccount?.status === "connected";
  if (wa) {
    // Passende WhatsApp-Vorlagen einreichen (im Hintergrund; bis zur Freigabe gilt die bisherige Fassung)
    after(async () => {
      const { submitTemplatesForCustomer } = await import("@/lib/whatsapp/template-submit");
      await submitTemplatesForCustomer(ctx.customerId).catch(() => {});
    });
  }
  revalidatePath("/buyer", "layout");
  return {
    ok: true,
    message: wa
      ? "Gespeichert. Fehlende WhatsApp-Vorlagen in dieser Ansprache reichen wir jetzt bei Meta ein; bis zur Freigabe gehen die bisherigen raus."
      : "Gespeichert.",
  };
}
