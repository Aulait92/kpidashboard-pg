"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { logOfferActivity } from "@/lib/offer-links";
import { bookHelpCall } from "@/lib/help-call";
import { checkMetaAccess, requestMetaAccess, type MetaCheck } from "@/lib/selbst-einrichtung";

export type SetupState = { ok?: boolean; error?: string };

async function requireCustomer() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) throw new Error("In der Vorschau nicht möglich.");
  if (ctx.teamRole === "advisor") throw new Error("Nur der Inhaber kann das ändern.");
  const ob = await prisma.onboarding.findUnique({ where: { customerId: ctx.customerId }, include: { customer: { select: { name: true } } } });
  if (!ob) throw new Error("Kein Onboarding gefunden.");
  return { ctx, ob };
}

const str = (fd: FormData, k: string, max = 500) => String(fd.get(k) ?? "").trim().slice(0, max);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function saveQuestionnaireAction(_prev: SetupState, fd: FormData): Promise<SetupState> {
  let ob;
  try {
    ({ ob } = await requireCustomer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  const software = ob.package !== "service";
  const callbackBy = str(fd, "callbackBy", 120);
  const special = str(fd, "special", 1500);
  const data: Record<string, unknown> = { callbackBy, special };
  if (!callbackBy) return { error: "Bitte angeben, wer die Leads zurückruft." };

  if (software) {
    const formats = ["telefon", "video", "vorOrt"].filter((k) => fd.get(`format_${k}`) === "on");
    const advisorEmail = str(fd, "advisorEmail", 200).toLowerCase();
    if (formats.length === 0) return { error: "Bitte mindestens eine Terminart wählen." };
    if (advisorEmail && !isEmail(advisorEmail)) return { error: "Die E-Mail-Adresse für Termineinladungen sieht nicht gültig aus." };
    Object.assign(data, { formats, advisorEmail });
    if (advisorEmail) {
      await prisma.agentConfig
        .upsert({ where: { customerId: ob.customerId }, create: { customerId: ob.customerId, advisorEmail }, update: { advisorEmail } })
        .catch((err) => reportError(err, "onboarding-agent-config"));
    }
  } else {
    const leadEmails = str(fd, "leadEmails", 500)
      .split(/[,;\s]+/)
      .map((s) => s.toLowerCase())
      .filter(Boolean);
    if (leadEmails.length === 0 || !leadEmails.every(isEmail)) return { error: "Bitte mindestens eine gültige E-Mail-Adresse für neue Leads angeben." };
    data.leadEmails = leadEmails;
  }

  const first = !ob.questionnaireAt;
  await prisma.onboarding.update({ where: { id: ob.id }, data: { questionnaire: data as object, questionnaireAt: new Date() } });
  if (first) {
    await logOfferActivity({ dealId: null, salesContactId: ob.salesContactId }, "Onboarding: Fragebogen ausgefüllt");
    await sendToAdmins({ title: `📝 Fragebogen ausgefüllt: ${ob.customer.name}`, body: "Onboarding", url: ob.salesContactId ? `/admin/vertrieb/kontakte/${ob.salesContactId}` : "/admin/vertrieb/kunden" }).catch(() => {});
  }
  revalidatePath("/buyer", "layout");
  return { ok: true };
}

export async function confirmMetaAccessAction(_prev: SetupState, _fd: FormData): Promise<SetupState> {
  let ob;
  try {
    ({ ob } = await requireCustomer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  if (!ob.metaAccessAt) {
    await prisma.onboarding.update({ where: { id: ob.id }, data: { metaAccessAt: new Date() } });
    await logOfferActivity({ dealId: null, salesContactId: ob.salesContactId }, "Onboarding: Kunde hat Meta-Zugriff erteilt (bitte prüfen)");
    await sendToAdmins({ title: `🔑 Meta-Zugriff erteilt: ${ob.customer.name}`, body: "Bitte im Business Manager prüfen.", url: ob.salesContactId ? `/admin/vertrieb/kontakte/${ob.salesContactId}` : "/admin/vertrieb/kunden" }).catch(() => {});
  }
  revalidatePath("/buyer", "layout");
  return { ok: true };
}

export async function bookHelpCallAction(_prev: SetupState, fd: FormData): Promise<SetupState> {
  try {
    const { ctx } = await requireCustomer();
    const res = await bookHelpCall(ctx.customerId, String(fd.get("start") ?? ""), String(fd.get("topic") ?? "").trim().slice(0, 200) || null);
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer", "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

// ─── Selbst-Einrichtung: Meta-Zugriff prüfen bzw. anfragen, Einwilligung ───

export type MetaSetupState = { ok?: boolean; error?: string; message?: string; check?: MetaCheck };

export async function checkMetaAccessAction(_prev: MetaSetupState, fd: FormData): Promise<MetaSetupState> {
  try {
    const { ctx } = await requireCustomer();
    const r = await checkMetaAccess(ctx.customerId, { adAccount: str(fd, "adAccount", 200) || null, page: str(fd, "page", 300) || null }, { source: "kunde" });
    revalidatePath("/buyer", "layout");
    if (!r.ok) return { error: r.error, check: r.check };
    return r.check.ok
      ? { ok: true, check: r.check, message: "Alles freigegeben, danke! Wir kümmern uns jetzt um die Kampagne." }
      : { ok: false, check: r.check };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

export async function requestMetaAccessAction(_prev: MetaSetupState, fd: FormData): Promise<MetaSetupState> {
  try {
    const { ctx } = await requireCustomer();
    const r = await requestMetaAccess(ctx.customerId, { adAccount: str(fd, "adAccount", 200) || null, page: str(fd, "page", 300) || null });
    revalidatePath("/buyer", "layout");
    if (!r.ok) return { error: r.error };
    if (!r.sent.length) return { error: "Die Anfrage konnte nicht von uns gesendet werden. Bitte die Schritte unten selbst ausführen, das dauert ca. 3 Minuten." };
    return {
      ok: true,
      message: `Anfrage gesendet (${r.sent.join(" und ")}). Sie bekommen in Meta eine Benachrichtigung: bitte öffnen und bestätigen, danach hier auf „Zugriff prüfen“ tippen.${r.failed.length ? ` Für ${r.failed.join(" und ")} bitte die Schritte unten nutzen.` : ""}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

export async function confirmConsentAction(): Promise<SetupState> {
  let ob;
  try {
    ({ ob } = await requireCustomer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  if (!ob.consentAt) {
    await prisma.onboarding.update({ where: { id: ob.id }, data: { consentAt: new Date() } });
    await logOfferActivity({ dealId: null, salesContactId: ob.salesContactId }, "Onboarding: Kunde hat die Einwilligung im Leadformular bestätigt (bitte prüfen)");
  }
  revalidatePath("/buyer", "layout");
  return { ok: true };
}
