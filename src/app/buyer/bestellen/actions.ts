"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/email";
import { placeOrder } from "@/lib/ppl/orders";

export type OrderFormState = { ok?: boolean; error?: string; message?: string };

async function ownerCtx() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) throw new Error("In der Vorschau nicht möglich.");
  if (ctx.teamRole !== "owner") throw new Error("Bestellen kann nur der Inhaber.");
  return ctx;
}

export async function orderAction(_prev: OrderFormState, fd: FormData): Promise<OrderFormState> {
  try {
    const ctx = await ownerCtx();
    const subscriptionId = String(fd.get("subscriptionId") ?? "");
    const sub = await prisma.leadSubscription.findFirst({ where: { id: subscriptionId, customerId: ctx.customerId }, select: { id: true } });
    if (!sub) return { error: "Bezug nicht gefunden." };
    const res = await placeOrder({
      subscriptionId: sub.id,
      weekOffset: fd.get("week") === "0" ? 0 : 1,
      quantity: Number(fd.get("quantity")),
      autoRenew: fd.get("autoRenew") === "on",
      actor: { id: ctx.userId, email: ctx.email, role: "BUYER" },
    });
    revalidatePath("/buyer/bestellen");
    return res.ok ? { ok: true, message: res.message } : { error: res.error };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Das hat nicht geklappt." };
  }
}

export async function toggleAutoRenewAction(fd: FormData): Promise<void> {
  const ctx = await ownerCtx();
  const order = await prisma.leadOrder.findFirst({
    where: { id: String(fd.get("orderId") ?? ""), subscription: { customerId: ctx.customerId } },
    select: { id: true, autoRenew: true },
  });
  if (!order) return;
  await prisma.leadOrder.update({ where: { id: order.id }, data: { autoRenew: !order.autoRenew } });
  revalidatePath("/buyer/bestellen");
}

export async function paymentSetupAction(): Promise<void> {
  const ctx = await ownerCtx();
  const { createPaymentSetupUrl } = await import("@/lib/billing");
  const url = await createPaymentSetupUrl(ctx.customerId, `${getAppUrl()}/buyer/bestellen`);
  redirect(url);
}
