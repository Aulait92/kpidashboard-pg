"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getBuyerContext } from "@/lib/buyer-context";
import { canEditProvision } from "@/lib/provision-server";
import { logoBestaetigen, logoEntfernen, logoHochladen, logoHolen, markthinweisSpeichern } from "@/lib/branding-logo-server";

type Res = { ok: true } | { ok: false; error: string };

type Ctx = NonNullable<Awaited<ReturnType<typeof getBuyerContext>>>;

async function owner(): Promise<{ ctx: Ctx } | { error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { error: "Bitte neu anmelden." };
  if (ctx.preview) return { error: "In der Vorschau nicht möglich." };
  if (!canEditProvision(ctx)) return { error: "Nur der Inhaber kann das ändern." };
  return { ctx };
}

const done = () => revalidatePath("/buyer/einstellungen/branding");

export async function logoHolenAction(website: string): Promise<Res> {
  const o = await owner();
  if ("error" in o) return { ok: false, error: o.error };
  const r = await logoHolen(o.ctx.customerId, String(website ?? "").slice(0, 300));
  if (r.ok) await audit("customer.logo", { entity: "Customer", entityId: o.ctx.customerId, customerId: o.ctx.customerId, details: { action: "website" } });
  done();
  return r;
}

export async function logoHochladenAction(form: FormData): Promise<Res> {
  const o = await owner();
  if ("error" in o) return { ok: false, error: o.error };
  const f = form.get("logo");
  if (!(f instanceof File) || !f.size) return { ok: false, error: "Bitte eine Datei auswählen." };
  const r = await logoHochladen(o.ctx.customerId, f.name.slice(0, 120), new Uint8Array(await f.arrayBuffer()));
  if (r.ok) await audit("customer.logo", { entity: "Customer", entityId: o.ctx.customerId, customerId: o.ctx.customerId, details: { action: "upload" } });
  done();
  return r;
}

export async function logoBestaetigenAction(erlaubt: boolean): Promise<Res> {
  const o = await owner();
  if ("error" in o) return { ok: false, error: o.error };
  if (!erlaubt) return { ok: false, error: "Bitte bestätigen Sie, dass Sie das Logo verwenden dürfen." };
  if (!(await logoBestaetigen(o.ctx.customerId))) return { ok: false, error: "Kein Logo vorhanden." };
  await audit("customer.logo", { entity: "Customer", entityId: o.ctx.customerId, customerId: o.ctx.customerId, details: { action: "confirm" } });
  done();
  return { ok: true };
}

export async function logoEntfernenAction(): Promise<Res> {
  const o = await owner();
  if ("error" in o) return { ok: false, error: o.error };
  await logoEntfernen(o.ctx.customerId);
  await audit("customer.logo", { entity: "Customer", entityId: o.ctx.customerId, customerId: o.ctx.customerId, details: { action: "remove" } });
  done();
  return { ok: true };
}

/** Makler: Hinweis auf die Marktauswahl in der Präsentation (leer = Standard). */
export async function markthinweisAction(text: string): Promise<Res> {
  const o = await owner();
  if ("error" in o) return { ok: false, error: o.error };
  const r = await markthinweisSpeichern(o.ctx.customerId, String(text ?? ""));
  if (r.ok) await audit("customer.markthinweis", { entity: "Customer", entityId: o.ctx.customerId, customerId: o.ctx.customerId });
  done();
  return r;
}
