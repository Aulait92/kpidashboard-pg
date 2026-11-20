"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { encryptSecret } from "@/lib/encryption";
import { deliver } from "@/lib/ppl/engine";
import { adminRecordStorno, decideStorno, undoStorno } from "@/lib/ppl/storno";
import { placeOrder } from "@/lib/ppl/orders";
import { weekRange } from "@/lib/ppl/periods";
import { invalidAddresses, parseAddresses } from "@/lib/ppl/lead-mail";
import { effektiveSteuer, isRegisterStatus, isSteuer, nettoAusBrutto } from "@/lib/ppl/steuer";
import { normalizeRegisterNummer } from "@/lib/erstinformation-shared";

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  return s;
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[,\n;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};
const int = (v: FormDataEntryValue | null) => {
  const n = num(v);
  return n == null || !Number.isFinite(n) ? null : Math.round(n);
};

export type BezugState = { error?: string; ok?: boolean };

export async function saveSubscriptionAction(_prev: BezugState, fd: FormData): Promise<BezugState> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const customerId = String(fd.get("customerId") ?? "");
  const productKey = String(fd.get("productKey") ?? "").trim();
  const priceInput = num(fd.get("price"));
  if (!customerId || !productKey) return { error: "Kunde und Produkt angeben." };
  if (priceInput == null || !Number.isFinite(priceInput) || priceInput < 0) return { error: "Preis je Lead angeben." };
  // Umsatzsteuer (Ole, 20.11.2026): leer = Standard je Produkt (lib/ppl/steuer.ts)
  const steuerRaw = String(fd.get("steuer") ?? "");
  const steuer = isSteuer(steuerRaw) ? steuerRaw : null;
  // Preis brutto kalkuliert (z. B. Kindersparplan 65 € inkl. USt.): netto speichern (65 € → 54,62 €). Nur wenn die
  // Bestellung für diesen Käufer tatsächlich mit 19 % abgerechnet wird, sonst wäre brutto = netto.
  let price = priceInput;
  if (fd.get("priceMode") === "brutto") {
    const kunde = await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerRegisterNr: true, vermittlerRegisterStatus: true, vermittlerGeprueftAt: true } });
    if (effektiveSteuer({ productKey, steuer }, kunde).steuer !== "steuerpflichtig") {
      return { error: "Bruttopreis nur bei steuerpflichtigen Leads. Für steuerfreie Leads ist der Preis netto gleich brutto." };
    }
    price = nettoAusBrutto(priceInput);
  }
  const delivery = String(fd.get("delivery") ?? "app");
  const secret = String(fd.get("webhookSecret") ?? "").trim();
  // Lead-Mail: standard | vorlage | maschinenlesbar (nur gesendet, wenn Lieferung E-Mail gewählt ist)
  const mailKind = fd.get("emailKind") == null ? null : String(fd.get("emailKind"));
  const addresses = parseAddresses(String(fd.get("deliveryEmail") ?? ""));
  const mailData =
    mailKind == null
      ? // Kundenbereich + PDF per Mail: nur der Einwilligungstext fürs PDF
        fd.get("consentText") != null
        ? { consentText: String(fd.get("consentText")).replace(/\r\n/g, "\n").trim() || null }
        : {}
      : {
          emailFormat: mailKind === "maschinenlesbar" ? "maschinenlesbar" : "standard",
          ...(mailKind === "maschinenlesbar" ? {} : { emailTemplate: mailKind === "vorlage" ? String(fd.get("emailTemplate") ?? "").replace(/\r\n/g, "\n").trim() || null : null }),
          ...(fd.get("consentText") != null ? { consentText: String(fd.get("consentText")).replace(/\r\n/g, "\n").trim() || null } : {}),
        };
  const data = {
    customerId,
    productKey,
    label: String(fd.get("label") ?? "").trim() || null,
    active: fd.get("active") === "on",
    status: fd.get("status") === "test" ? "test" : "live",
    testQuantity: int(fd.get("testQuantity")),
    testDays: int(fd.get("testDays")),
    period: ["week", "month", "once"].includes(String(fd.get("period"))) ? String(fd.get("period")) : "week",
    goal: int(fd.get("goal")),
    startDate: fd.get("startDate") ? new Date(`${fd.get("startDate")}T00:00:00`) : null,
    price,
    steuer,
    plzRanges: String(fd.get("plzRanges") ?? "").trim() || null,
    acceptWeak: fd.get("acceptWeak") === "on",
    weakThreshold: int(fd.get("weakThreshold")),
    acceptCivilServants: fd.get("acceptCivilServants") === "on",
    onlyWeak: fd.get("onlyWeak") === "on",
    scoreFloor: int(fd.get("scoreFloor")),
    insurerInclude: list(fd.get("insurerInclude")),
    insurerExclude: list(fd.get("insurerExclude")),
    excludeRules: String(fd.get("excludeRules") ?? "").trim() || null,
    stornoDays: int(fd.get("stornoDays")),
    stornoReasons: list(fd.get("stornoReasons")),
    stornoAutoApprove: fd.get("stornoAutoApprove") === "on",
    delivery: ["app", "app_pdf", "email", "webhook"].includes(delivery) ? delivery : "app",
    deliveryEmail: addresses.length ? addresses.join(", ") : null,
    ...(mailKind === "maschinenlesbar" ? {} : { emailSubject: String(fd.get("emailSubject") ?? "").trim() || null }),
    ...mailData,
    slackNotify: fd.get("slackNotify") === "on",
    webhookUrl: String(fd.get("webhookUrl") ?? "").trim() || null,
    webhookFormat: fd.get("webhookFormat") === "convexa" ? "convexa" : "standard",
    ...(secret ? { webhookSecretEnc: encryptSecret(secret) } : {}),
  };
  const byMail = data.delivery === "email" || data.delivery === "app_pdf";
  if (byMail && !data.deliveryEmail) return { error: data.delivery === "app_pdf" ? "Für das PDF per Mail eine Adresse angeben." : "Für Lieferung per E-Mail eine Adresse angeben." };
  const bad = byMail ? invalidAddresses(addresses) : [];
  if (bad.length) return { error: `Keine gültige E-Mail-Adresse: ${bad.join(", ")}. Mehrere Adressen mit Komma trennen.` };
  if (mailKind === "vorlage" && !("emailTemplate" in mailData && mailData.emailTemplate)) return { error: "Für „Eigene Vorlage“ eine Vorlage angeben." };
  if (data.delivery === "webhook" && !/^https:\/\//.test(data.webhookUrl ?? "")) return { error: "Für Webhook eine https-Adresse angeben." };
  const saved = id ? await prisma.leadSubscription.update({ where: { id }, data }) : await prisma.leadSubscription.create({ data });
  await audit("ppl.subscription", { entity: "LeadSubscription", entityId: saved.id, customerId, details: { productKey, active: data.active, price, steuer, ...(price !== priceInput ? { bruttoEingabe: priceInput } : {}) } });
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
  // Rückweg: alte Übersicht oder (Feld „zurueck“) die Pay-per-Lead-Seite im neuen Admin
  const zurueck = String(fd.get("zurueck") ?? "");
  redirect(`${zurueck.startsWith("/admin/neu/") && !zurueck.includes("?") ? zurueck : "/admin/ppl"}?gespeichert=${saved.id}`);
}

export type RegisterState = { error?: string; ok?: boolean };

/**
 * Registerprüfung (Ole, 20.11.2026): Ole hat den Käufer im Vermittlerregister nachgeschlagen und trägt Nummer, Status und
 * Prüfdatum ein. Steuerfrei nach § 4 Nr. 11 UStG nur bei Status vertreter/makler mit gültiger Nummer (lib/ppl/steuer.ts).
 * Gibt danach wartende Bestellungen frei (lib/ppl/erste-woche.ts).
 */
export async function saveRegisterpruefungAction(_prev: RegisterState, fd: FormData): Promise<RegisterState> {
  const s = await requireAdmin();
  const customerId = String(fd.get("customerId") ?? "");
  const status = String(fd.get("registerStatus") ?? "");
  if (!customerId) return { error: "Kunde fehlt." };
  if (!isRegisterStatus(status)) return { error: "Status wählen." };
  const rawNr = String(fd.get("registerNr") ?? "").trim();
  const nr = normalizeRegisterNummer(rawNr);
  if (status !== "keiner" && !nr) return { error: "Registernummer im Format D-XXXX-XXXXX-XX angeben." };
  if (rawNr && !nr) return { error: "Registernummer im Format D-XXXX-XXXXX-XX angeben." };
  const datum = String(fd.get("geprueftAm") ?? "");
  const geprueftAt = /^\d{4}-\d{2}-\d{2}$/.test(datum) ? new Date(`${datum}T12:00:00`) : new Date();
  if (geprueftAt.getTime() > Date.now() + 86_400_000) return { error: "Prüfdatum liegt in der Zukunft." };
  await prisma.customer.update({
    where: { id: customerId },
    data: { vermittlerRegisterNr: nr, vermittlerRegisterStatus: status, vermittlerGeprueftAt: geprueftAt, vermittlerGeprueftVon: s.email ?? s.userId },
  });
  await audit("ppl.registerpruefung", { entity: "Customer", entityId: customerId, customerId, actor: { id: s.userId, email: s.email, role: s.role }, details: { status, nr } });
  const { registerGeprueft } = await import("@/lib/ppl/erste-woche");
  await registerGeprueft(customerId, { id: s.userId, email: s.email, role: s.role });
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
  return { ok: true };
}

export async function manualOrderAction(fd: FormData): Promise<void> {
  const s = await requireAdmin();
  await placeOrder({
    subscriptionId: String(fd.get("subscriptionId") ?? ""),
    weekOffset: fd.get("week") === "1" ? 1 : 0,
    quantity: Number(fd.get("quantity")),
    autoRenew: false,
    markPaid: true,
    actor: { id: s.userId, email: s.email, role: s.role },
  });
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
}

export async function assignParkedAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const pool = await prisma.poolLead.findUnique({ where: { id: String(fd.get("poolLeadId") ?? "") } });
  const sub = await prisma.leadSubscription.findUnique({ where: { id: String(fd.get("subscriptionId") ?? "") } });
  if (!pool || pool.status !== "parked" || !sub) return;
  const order =
    sub.period === "week"
      ? await prisma.leadOrder.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart: weekRange().start } } })
      : null;
  await deliver(pool.id, sub, order?.id ?? null);
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
}

export async function discardParkedAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await prisma.poolLead.updateMany({ where: { id: String(fd.get("poolLeadId") ?? ""), status: "parked" }, data: { status: "invalid", reason: "verworfen (Admin)" } });
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
}

export async function decideStornoAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const d = fd.get("decision");
  await decideStorno(String(fd.get("leadId") ?? ""), d === "half" ? "half" : d === "approve");
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
}

export type AdminStornoState = { error?: string; message?: string };

/** Admin → Pay-per-Lead → Gelieferte Leads: Storno direkt als anerkannt eintragen. */
export async function adminStornoAction(_prev: AdminStornoState, fd: FormData): Promise<AdminStornoState> {
  const s = await requireAdmin();
  const r = await adminRecordStorno(String(fd.get("leadId") ?? ""), String(fd.get("reason") ?? ""), String(fd.get("note") ?? ""), { id: s.userId, email: s.email, role: s.role });
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
  return { message: r.already ? "War schon storniert." : `Storno eingetragen${r.outsideWindow ? " (außerhalb des Storno-Fensters)" : ""}.` };
}

export async function undoStornoAction(_prev: AdminStornoState, fd: FormData): Promise<AdminStornoState> {
  const s = await requireAdmin();
  const r = await undoStorno(String(fd.get("leadId") ?? ""), { id: s.userId, email: s.email, role: s.role });
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
  return { message: r.already ? "Kein anerkannter Storno." : "Storno zurückgenommen." };
}

// „Bezüge aus Airtable übernehmen“ (runImportAction) ist entfallen (UX-Umbau 20.11.2026, Airtable aus der Oberfläche);
// die Logik bleibt in lib/ppl/import-airtable.ts, falls sie per Skript noch einmal gebraucht wird.

// ─── Gebiete (Vorrang je PLZ-Gebiet mit eigener Menge) ──────────────────────
const PLZ_SPEC = /^\s*\d{1,5}(\s*-\s*\d{1,5})?(\s*[|,;\s]\s*\d{1,5}(\s*-\s*\d{1,5})?)*\s*$/;

export async function saveAreaAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const subscriptionId = String(fd.get("subscriptionId") ?? "");
  const id = String(fd.get("id") ?? "");
  const plzRanges = String(fd.get("plzRanges") ?? "").replace(/\s*-\s*/g, "-").replace(/[,;\s]+/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, "");
  const quantity = int(fd.get("quantity"));
  const period = ["week", "month"].includes(String(fd.get("period"))) ? String(fd.get("period")) : null;
  const label = String(fd.get("label") ?? "").trim() || null;
  if (!subscriptionId || !plzRanges || !PLZ_SPEC.test(plzRanges) || quantity == null || quantity < 0) return;
  const data = { label, plzRanges, quantity, period };
  if (id) await prisma.subscriptionArea.update({ where: { id }, data });
  else await prisma.subscriptionArea.create({ data: { ...data, subscriptionId } });
  await audit("ppl.area", { entity: "LeadSubscription", entityId: subscriptionId, details: { plzRanges, quantity, period } });
  revalidatePath(`/admin/ppl/bezug/${subscriptionId}`);
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
}

export async function deleteAreaAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const a = await prisma.subscriptionArea.delete({ where: { id } });
  await audit("ppl.area_delete", { entity: "LeadSubscription", entityId: a.subscriptionId, details: { plzRanges: a.plzRanges } });
  revalidatePath(`/admin/ppl/bezug/${a.subscriptionId}`);
  revalidatePath("/admin/neu", "layout");
}

export type TestLeadState = { error?: string; message?: string; targets?: { target: string; ok: boolean; error?: string; blocked?: boolean; hinweis?: string }[] };

/** Bezug → „Testdatensatz senden“: Test-Lead an alle Lieferadressen, zählt nirgends mit. */
export async function sendTestLeadAction(_prev: TestLeadState, fd: FormData): Promise<TestLeadState> {
  const s = await requireAdmin();
  const { sendTestLead } = await import("@/lib/ppl/test-lead");
  const r = await sendTestLead(String(fd.get("subscriptionId") ?? ""), { id: s.userId, email: s.email, role: s.role });
  revalidatePath(`/admin/ppl/bezug/${String(fd.get("subscriptionId") ?? "")}`);
  if (!r.targets.length) return { error: r.error ?? "Nicht gesendet." };
  const okCount = r.targets.filter((t) => t.ok).length;
  return {
    targets: r.targets,
    ...(r.ok ? { message: `Testdatensatz ${r.leadId} gesendet an ${okCount} von ${r.targets.length} ${r.targets.length === 1 ? "Adresse" : "Adressen"}.` } : { error: `Nur an ${okCount} von ${r.targets.length} gesendet.` }),
  };
}

export type SlackTestState = { state?: "gesendet" | "nicht eingerichtet" | "fehler"; status?: number; error?: string };

/** Pay-per-Lead → „Slack testen“: Testnachricht an SLACK_PPL_WEBHOOK_URL, Ergebnis anzeigen. */
export async function slackTestAction(_prev: SlackTestState, _fd: FormData): Promise<SlackTestState> {
  const s = await requireAdmin();
  const { sendSlackTest } = await import("@/lib/ppl/slack");
  const r = await sendSlackTest();
  await audit("ppl.slack_test", { entity: "LeadSubscription", actor: { id: s.userId, email: s.email, role: s.role }, details: { ...r } });
  return r;
}
