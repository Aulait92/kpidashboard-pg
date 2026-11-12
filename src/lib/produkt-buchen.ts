// Weiteres Produkt selbst buchen (Kundenbereich → Konto → Produkte).
//
// Ablauf (Ole, 12.11.2026):
// - Kunde bucht: Tagesbudget, Startwunsch, Pflicht-Häkchen. Status „In Einrichtung“.
// - Einrichtung (PRICE_LIST.extraProductSetup) kommt sofort als einmalige Position auf die
//   nächste Rechnung; Ole bekommt Push + Aufgaben „Kampagne aufsetzen“ (+ WhatsApp-Vorlagen).
// - Admin setzt in der Kundenakte „Gestartet“: erst dann zählen Budget und Garantie
//   (CustomerBudget-Eintrag) und der Monatspreis (Stufe + weiteres Produkt) kommt ins Abo
//   (wie bei „Budget ändern“ ab dem nächsten Abrechnungsmonat).
// - Über PRICE_LIST.individualFrom: nur Anfrage. Individuelle Konditionen, Jahreszahler,
//   „Nur Betreuung“ oder ohne Stripe: Produkt trotzdem gebucht, Preis von Hand (Aufgabe).
// - Ablehnen nimmt die Einrichtungsposition zurück. Beenden nur als Anfrage (Laufzeit).

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { addInvoiceItem, billingEnabled, changeMonthlyFee, removeInvoiceItem } from "@/lib/billing";
import { reportError } from "@/lib/monitoring";
import { loadRechnerConfig } from "@/lib/rechner-server";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { berlinYmd } from "@/lib/absence";
import { adminTask, budgetState, customerInfo, effectiveFromOf, mailCustomer, notifyAdmins } from "@/lib/budget";
import { BUDGET_MAX_DAILY, BUDGET_MIN_DAILY, previewChange, type BudgetLine } from "@/lib/budget-shared";
import {
  bookingSentence,
  DEFAULT_CATALOG,
  findCatalogItem,
  MANUAL_REASON_LABEL,
  matchesCatalog,
  previewBooking,
  type BookingPreview,
  type CatalogItem,
} from "@/lib/produkt-buchen-shared";

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const eurDay = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} €/Tag`;
const fmtDate = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
const OPEN = ["requested", "setup", "live"];

// ─── Katalog ──────────────────────────────────────────────────────────────

/** Katalog: Standard aus dem Code, überschrieben durch Admin-Einstellungen. */
export async function loadCatalog(): Promise<CatalogItem[]> {
  const rows = await prisma.productCatalogItem.findMany().catch(() => []);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return DEFAULT_CATALOG.map((d) => {
    const r = byKey.get(d.key);
    return r ? { ...d, benefit: r.benefit, proven: r.proven, enabled: r.enabled, sort: r.sort } : d;
  }).sort((a, b) => a.sort - b.sort);
}

export async function saveCatalogItem(
  key: string,
  data: { enabled: boolean; proven: boolean; benefit: string },
  actor?: AuditActor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = DEFAULT_CATALOG.find((c) => c.key === key);
  if (!d) return { ok: false, error: "Unbekanntes Produkt." };
  const benefit = data.benefit.trim().slice(0, 240) || d.benefit;
  await prisma.productCatalogItem.upsert({
    where: { key },
    create: { key, name: d.name, benefit, proven: data.proven, enabled: data.enabled, sort: d.sort },
    update: { benefit, proven: data.proven, enabled: data.enabled },
  });
  await audit("produkt.catalog", { entity: "ProductCatalogItem", entityId: key, details: { ...data, benefit }, ...(actor ? { actor } : {}) });
  return { ok: true };
}

/** Leadpreis für ein Katalog-Produkt aus der Rechner-Konfiguration (null = noch kein Erfahrungswert). */
async function catalogCpls(catalog: CatalogItem[], vermittlerTyp: string): Promise<Record<string, number | null>> {
  const cfg = await loadRechnerConfig().catch(() => null);
  const out: Record<string, number | null> = {};
  for (const c of catalog) {
    const p = c.rechnerKey ? cfg?.products.find((x) => x.key === c.rechnerKey) : null;
    // Nur bewährte Produkte bekommen einen Leadpreis; bei Testprodukten sind die Werte Annahmen
    out[c.key] = p && c.proven ? (vermittlerTyp === "makler" && p.cplMakler != null ? p.cplMakler : p.cpl) : null;
  }
  return out;
}

// ─── Stand für Kundenbereich und Kundenakte ──────────────────────────────

export type BookedProduct = {
  name: string;
  dailyBudget: number;
  status: "live" | "setup" | "requested";
  bookingId: string | null;
  startWish: string | null;
  endRequestedAt: string | null;
};
export type BookableProduct = Pick<CatalogItem, "key" | "name" | "benefit" | "proven"> & { cpl: number | null; guarantee: boolean };

export async function productOverview(customerId: string, now = new Date()) {
  const [{ lines, ctx, pending }, catalog, bookings, c] = await Promise.all([
    budgetState(customerId, now),
    loadCatalog(),
    prisma.productBooking.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerTyp: true } }),
  ]);
  const cpls = await catalogCpls(catalog, c?.vermittlerTyp ?? "vertreter");
  const endReq = new Map(bookings.filter((b) => b.status === "live" && b.endRequestedAt).map((b) => [b.product, b.endRequestedAt!]));
  const booked: BookedProduct[] = lines
    .filter((l) => l.dailyBudget > 0)
    .map((l) => ({ name: l.product, dailyBudget: l.dailyBudget, status: "live" as const, bookingId: null, startWish: null, endRequestedAt: endReq.get(l.product)?.toISOString() ?? null }));
  for (const b of bookings.filter((x) => x.status === "setup" || x.status === "requested")) {
    booked.push({
      name: b.product,
      dailyBudget: Number(b.dailyBudget),
      status: b.status as "setup" | "requested",
      bookingId: b.id,
      startWish: b.startWish?.toISOString() ?? null,
      endRequestedAt: null,
    });
  }
  const taken = (item: CatalogItem) => booked.some((p) => matchesCatalog(item, p.name));
  const bookable: BookableProduct[] = catalog
    .filter((i) => i.enabled && !taken(i))
    .map((i) => ({ key: i.key, name: i.name, benefit: i.benefit, proven: i.proven, cpl: cpls[i.key] ?? null, guarantee: /katze|\btkv\b|tierkranken/i.test(i.name) }));
  return { lines, ctx, booked, bookable, budgetRequestPending: !!pending, bookings };
}

// ─── Buchen ───────────────────────────────────────────────────────────────

export type BookInput = {
  customerId: string;
  userId: string | null;
  catalogKey: string;
  dailyBudget: number;
  /** YYYY-MM-DD (Berlin) oder null = so bald wie möglich. */
  startDate: string | null;
  acknowledged: boolean;
  actor?: AuditActor;
};
export type BookResult =
  | { ok: true; status: "setup" | "requested"; bookingId: string; preview: BookingPreview }
  | { ok: false; error: string };

export async function bookProduct(input: BookInput, now = new Date()): Promise<BookResult> {
  const catalog = await loadCatalog();
  const item = findCatalogItem(catalog, input.catalogKey);
  if (!item || !item.enabled) return { ok: false, error: "Dieses Produkt ist derzeit nicht buchbar." };
  const daily = Number(input.dailyBudget);
  if (!Number.isFinite(daily) || daily < BUDGET_MIN_DAILY || daily > BUDGET_MAX_DAILY) {
    return { ok: false, error: `Bitte ein Tagesbudget zwischen ${BUDGET_MIN_DAILY} und ${BUDGET_MAX_DAILY} € wählen.` };
  }
  let startWish: Date | null = null;
  if (input.startDate) {
    const eff = effectiveFromOf(input.startDate, now);
    if ("error" in eff) return { ok: false, error: eff.error };
    startWish = input.startDate === berlinYmd(now) ? null : eff;
  }
  if (!input.acknowledged) return { ok: false, error: "Bitte bestätigen Sie Einrichtung und Monatspreis." };

  const ov = await productOverview(input.customerId, now);
  if (!ov.lines.length) return { ok: false, error: "Für Ihr Konto ist noch kein Vertrag hinterlegt. Bitte melden Sie sich kurz bei uns." };
  if (ov.booked.some((p) => matchesCatalog(item, p.name))) return { ok: false, error: `${item.name} ist bei Ihnen schon gebucht.` };

  const cpl = ov.bookable.find((b) => b.key === item.key)?.cpl ?? null;
  const add: BudgetLine = { product: item.name, dailyBudget: daily };
  const preview = previewBooking(ov.lines, add, ov.ctx, cpl);
  const requested = preview.overIndividual;
  const pricing = preview.bookingPricing;

  // Doppelte Buchung (Doppelklick, zwei Tabs) verhindern: offene Buchung desselben Produkts
  const row = await prisma.$transaction(async (tx) => {
    const open = await tx.productBooking.findFirst({ where: { customerId: input.customerId, catalogKey: item.key, status: { in: OPEN } } });
    if (open) return null;
    return tx.productBooking.create({
      data: {
        customerId: input.customerId,
        userId: input.userId,
        catalogKey: item.key,
        product: item.name,
        dailyBudget: daily,
        startWish,
        status: requested ? "requested" : "setup",
        monthlyBudgetFrom: preview.monthlyFrom,
        monthlyBudgetTo: preview.monthlyTo,
        feeFrom: preview.feeFrom,
        feeTo: requested ? null : preview.feeTo,
        setupFee: preview.setupFee,
        tierChange: preview.tierChange,
        acknowledged: true,
        pricing: requested ? "individual" : pricing,
        reason: requested ? "individual_budget" : preview.manualReason,
        feeStatus: requested ? "none" : pricing === "list" ? "pending" : "manual",
      },
    });
  });
  if (!row) return { ok: false, error: `${item.name} ist bei Ihnen schon gebucht.` };

  const info = await customerInfo(input.customerId);
  const wish = startWish ? `ab ${fmtDate(startWish)}` : "so bald wie möglich";
  const lines = [
    `${item.name}: ${eurDay(daily)} (${eur(daily * PRICE_LIST.daysPerMonth)} pro Monat)`,
    `Werbebudget gesamt pro Monat: ${eur(preview.monthlyFrom)} → ${eur(preview.monthlyTo)}`,
    `Start: ${wish}`,
  ];
  await audit(requested ? "produkt.request" : "produkt.book", {
    entity: "ProductBooking",
    entityId: row.id,
    customerId: input.customerId,
    details: { product: item.name, daily, monthly: { from: preview.monthlyFrom, to: preview.monthlyTo }, fee: { from: preview.feeFrom, to: preview.feeTo }, pricing, startWish: startWish?.toISOString() ?? null },
    ...(input.actor ? { actor: input.actor } : {}),
  });

  if (requested) {
    await adminTask(info.contactId, `Produkt-Anfrage ${info.name}: ${item.name}, ${eur(preview.monthlyTo)}/Monat, individuelles Angebot`, [...lines, "Übernehmen oder ablehnen in der Kundenakte → Abrechnung."].join("\n"), now);
    await notifyAdmins(`Produkt-Anfrage: ${info.name}`, `${item.name} mit ${eurDay(daily)} – Gesamtbudget ${eur(preview.monthlyTo)}/Monat, bitte individuelles Angebot.`, info.contactId, input.customerId);
    await mailCustomer(info, {
      subject: `Ihre Anfrage: ${item.name}`,
      paragraphs: [
        `vielen Dank für Ihre Anfrage zu ${item.name}.`,
        `Ab ${eur(PRICE_LIST.individualFrom)} Werbebudget pro Monat erstellen wir Ihnen ein individuelles Angebot. Wir melden uns kurzfristig bei Ihnen.`,
      ],
      list: lines,
    });
    return { ok: true, status: "requested", bookingId: row.id, preview };
  }

  // Einrichtung: einmalige Position auf der nächsten Rechnung (nur Listenpreis, sonst von Hand)
  const setup = await addSetupItem(row.id, input.customerId, item.name, preview.setupFee, pricing === "list");

  await adminTask(
    info.contactId,
    `Kampagne für ${item.name} bei ${info.name} aufsetzen (Meta, Formular, Assistent-Fragen)`,
    [...lines, "Danach in der Kundenakte → Abrechnung → Produkte auf „Gestartet“ setzen: erst dann zählen Budget, Garantie und Monatspreis."].join("\n"),
    startWish ?? now,
  );
  const wa = await prisma.whatsAppAccount.findFirst({ where: { customerId: input.customerId }, select: { id: true } }).catch(() => null);
  if (wa) await adminTask(info.contactId, `WhatsApp-Vorlagen für ${item.name} bei ${info.name} prüfen`, "Erstanschreiben und Assistent-Fragen für das neue Produkt anlegen bzw. bei Meta einreichen.", startWish ?? now);
  if (pricing === "individual" || setup !== "added") {
    const why = preview.manualReason ? MANUAL_REASON_LABEL[preview.manualReason] : "Stripe nicht automatisch möglich";
    await adminTask(
      info.contactId,
      `Preis prüfen ${info.name}: ${item.name} dazugebucht`,
      `${why}. Einrichtung ${eur(preview.setupFee)} netto${setup === "added" ? " (bereits auf der nächsten Rechnung)" : " bitte von Hand berechnen"}; Monatspreis bisher ${preview.feeFrom != null ? eur(preview.feeFrom) : "–"}, Listenpreis neu ${preview.tierTo ? eur(preview.tierTo.monthly + (ov.lines.length) * PRICE_LIST.extraProductMonthly) : "–"} netto. Bitte festlegen, bestätigen und in Stripe anpassen.`,
      now,
    );
  }
  await notifyAdmins(
    `Produkt gebucht: ${info.name}`,
    `${item.name} mit ${eurDay(daily)} (${wish}). Bitte Kampagne aufsetzen.${preview.tierChange ? ` Neue Stufe ${preview.tierTo?.label ?? ""}.` : ""}`,
    info.contactId,
    input.customerId,
  );

  const sentence = bookingSentence(preview);
  const paragraphs = [
    `vielen Dank für Ihre Buchung. Wir richten ${item.name} jetzt für Sie ein: Kampagne bei Meta, Leadformular und die Fragen Ihres WhatsApp-Assistenten. Gewünschter Start: ${wish}. Sobald alles läuft, bekommen Sie eine kurze Nachricht von uns.`,
    pricing === "list"
      ? `Die Einrichtung (${eur(preview.setupFee)} netto, einmalig) erscheint auf Ihrer nächsten Rechnung. Ab dem Start gilt Ihr neuer Monatspreis von ${preview.feeTo != null ? eur(preview.feeTo) : "–"} netto (ab dem nächsten Abrechnungsmonat).`
      : "Da Ihre Konditionen individuell sind, bestätigen wir Ihnen Einrichtung und neuen Monatspreis gesondert.",
  ];
  if (sentence && pricing === "list" && preview.tierChange) paragraphs.push(sentence);
  if (preview.guarantee && daily < 20) paragraphs.push("Bitte beachten Sie: Die Lead-Garantie gilt ab 20 € pro Tag und Produkt.");
  await mailCustomer(info, { subject: `Ihre Buchung: ${item.name}`, paragraphs, list: lines });
  return { ok: true, status: "setup", bookingId: row.id, preview };
}

/** Einrichtungsgebühr als offene Position (idempotent je Buchung). */
async function addSetupItem(bookingId: string, customerId: string, product: string, amount: number, auto: boolean): Promise<"added" | "manual" | "error"> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { stripeCustomerId: true } });
  if (!auto || !billingEnabled() || !c?.stripeCustomerId) {
    await prisma.productBooking.update({ where: { id: bookingId }, data: { setupStatus: "manual", stripeNote: auto ? "Ohne Stripe – Einrichtung bitte von Hand berechnen." : null } });
    return "manual";
  }
  try {
    const itemId = await addInvoiceItem({
      stripeCustomerId: c.stripeCustomerId,
      amountEur: amount,
      description: `Einrichtung weiteres Produkt: ${product}`,
      idempotencyKey: `produkt-setup-${bookingId}`,
      metadata: { pg_kind: "produkt_setup", booking: bookingId },
      productKey: "setup",
    });
    await prisma.productBooking.update({ where: { id: bookingId }, data: { setupStatus: "added", setupItemId: itemId } });
    return "added";
  } catch (err) {
    reportError(err, "produkt-setup", { customer: customerId });
    await prisma.productBooking.update({ where: { id: bookingId }, data: { setupStatus: "error", stripeNote: "Einrichtung konnte nicht in Stripe angelegt werden." } });
    return "error";
  }
}

// ─── Admin: Start, Annahme, Ablehnung ─────────────────────────────────────

type AdminResult = { ok: true; note?: string } | { ok: false; error: string };

/** Anfrage (über individualFrom) übernehmen: Produkt geht in Einrichtung, Preis individuell (von Hand). */
export async function acceptProductRequest(bookingId: string, note: string | null, actor?: AuditActor, now = new Date()): Promise<AdminResult> {
  const claimed = await prisma.productBooking.updateMany({
    where: { id: bookingId, status: "requested" },
    data: { status: "setup", decidedBy: actor?.email ?? "admin", note: note?.trim() || null, setupStatus: "manual", feeStatus: "manual" },
  });
  if (claimed.count === 0) return { ok: false, error: "Die Anfrage ist schon entschieden." };
  const b = await prisma.productBooking.findUniqueOrThrow({ where: { id: bookingId } });
  const info = await customerInfo(b.customerId);
  await audit("produkt.decide", { entity: "ProductBooking", entityId: b.id, customerId: b.customerId, details: { accept: true, note }, ...(actor ? { actor } : {}) });
  await adminTask(info.contactId, `Kampagne für ${b.product} bei ${info.name} aufsetzen (Meta, Formular, Assistent-Fragen)`, "Anfrage übernommen. Preis individuell: Einrichtung und Monatspreis bitte bestätigen und in Stripe anpassen.", b.startWish ?? now);
  await mailCustomer(info, {
    subject: `Ihre Buchung: ${b.product}`,
    paragraphs: [`wir haben Ihre Anfrage zu ${b.product} übernommen und richten das Produkt jetzt für Sie ein. Den Preis bestätigen wir Ihnen gesondert.`, ...(note?.trim() ? [note.trim()] : [])],
  });
  return { ok: true };
}

/**
 * Admin „Gestartet“: Budget gilt ab jetzt (CustomerBudget), Monatspreis kommt ins Abo
 * (Listenpreis, ab dem nächsten Abrechnungsmonat). Idempotent über den Status.
 */
export async function startProduct(bookingId: string, actor?: AuditActor, now = new Date()): Promise<AdminResult> {
  const before = await prisma.productBooking.findUnique({ where: { id: bookingId } });
  if (!before) return { ok: false, error: "Buchung nicht gefunden." };
  // Preis mit dem aktuellen Stand neu rechnen (zwischenzeitliche Budgetänderungen)
  const { lines, ctx } = await budgetState(before.customerId, now);
  const others = lines.filter((l) => l.product !== before.product);
  const next = [...others, { product: before.product, dailyBudget: Number(before.dailyBudget) }];
  const p = previewChange(others, next, ctx);
  const claimed = await prisma.productBooking.updateMany({ where: { id: bookingId, status: "setup" }, data: { status: "live", startedAt: now, decidedBy: actor?.email ?? "admin" } });
  if (claimed.count === 0) return { ok: false, error: "Das Produkt ist nicht in Einrichtung." };
  await prisma.customerBudget.create({ data: { customerId: before.customerId, product: before.product, dailyBudget: before.dailyBudget, validFrom: now } });

  let note: string | undefined;
  const info = await customerInfo(before.customerId);
  if (before.feeStatus === "pending") {
    const feeTo = p.pricing === "list" ? p.feeTo : null;
    if (feeTo == null) {
      await prisma.productBooking.update({ where: { id: bookingId }, data: { feeStatus: "manual", stripeNote: "Kein Listenpreis beim Start" } });
      note = "Monatspreis bitte von Hand anpassen (Aufgabe in Heute).";
      await adminTask(info.contactId, `Preis anpassen ${info.name}: ${before.product} gestartet`, "Kein Listenpreis – bitte Monatspreis festlegen und in Stripe anpassen.", now);
    } else {
      const r = await changeMonthlyFee(before.customerId, feeTo, { idempotencyKey: `produkt-${bookingId}`, ...(actor ? { actor } : {}) });
      if (!r.ok || r.note) {
        const why = r.ok ? r.note! : r.error;
        await prisma.productBooking.update({ where: { id: bookingId }, data: { feeStatus: r.ok ? "manual" : "error", feeTo, stripeNote: why } });
        await adminTask(info.contactId, `Preis anpassen ${info.name}: ${eur(feeTo)} netto/Monat ab nächstem Abrechnungsmonat`, `${before.product} gestartet. Automatisch nicht möglich: ${why}`, now);
        note = `Monatspreis automatisch nicht möglich: ${why}`;
      } else {
        await prisma.$transaction([
          prisma.productBooking.update({ where: { id: bookingId }, data: { feeStatus: "done", feeTo, stripeNote: r.from ? `ab ${fmtDate(r.from)}` : null } }),
          prisma.customer.update({ where: { id: before.customerId }, data: { retainerMonthly: feeTo } }),
        ]);
      }
    }
  }
  await audit("produkt.start", { entity: "ProductBooking", entityId: bookingId, customerId: before.customerId, details: { product: before.product, daily: Number(before.dailyBudget) }, ...(actor ? { actor } : {}) });
  await mailCustomer(info, {
    subject: `${before.product} ist gestartet`,
    paragraphs: [`gute Nachricht: ${before.product} läuft ab heute. Die ersten Anfragen erscheinen wie gewohnt in Ihrem Kundenbereich und bei Ihrem WhatsApp-Assistenten.`],
    list: [`${before.product}: ${eurDay(Number(before.dailyBudget))}`],
  });
  return { ok: true, ...(note ? { note } : {}) };
}

/** Admin „Ablehnen“: Einrichtungsposition zurücknehmen, Kunde informieren. */
export async function rejectProduct(bookingId: string, note: string | null, actor?: AuditActor, now = new Date()): Promise<AdminResult> {
  const claimed = await prisma.productBooking.updateMany({
    where: { id: bookingId, status: { in: ["requested", "setup"] } },
    data: { status: "rejected", rejectedAt: now, decidedBy: actor?.email ?? "admin", note: note?.trim() || null },
  });
  if (claimed.count === 0) return { ok: false, error: "Die Buchung ist schon entschieden." };
  const b = await prisma.productBooking.findUniqueOrThrow({ where: { id: bookingId } });
  const info = await customerInfo(b.customerId);
  let msg: string | undefined;
  if (b.setupStatus === "added" && b.setupItemId) {
    try {
      const r = await removeInvoiceItem(b.setupItemId);
      if (r === "removed") {
        await prisma.productBooking.update({ where: { id: b.id }, data: { setupStatus: "removed" } });
      } else {
        await prisma.productBooking.update({ where: { id: b.id }, data: { setupStatus: "manual", stripeNote: "Einrichtung schon berechnet – bitte gutschreiben." } });
        await adminTask(info.contactId, `Gutschrift ${info.name}: Einrichtung ${b.product} (${eur(Number(b.setupFee))} netto)`, "Buchung abgelehnt, die Einrichtung stand schon auf einer Rechnung.", now);
        msg = "Einrichtung war schon berechnet – Aufgabe „Gutschrift“ angelegt.";
      }
    } catch (err) {
      reportError(err, "produkt-setup-remove", { customer: b.customerId });
      await prisma.productBooking.update({ where: { id: b.id }, data: { setupStatus: "error", stripeNote: "Einrichtung konnte nicht entfernt werden." } });
      await adminTask(info.contactId, `Einrichtung entfernen ${info.name}: ${b.product}`, "Automatisch nicht möglich – bitte in Stripe die offene Position löschen.", now);
      msg = "Einrichtung konnte nicht entfernt werden – Aufgabe angelegt.";
    }
  }
  // Monatspreis kommt erst beim Start ins Abo – nichts zurückzunehmen
  if (b.feeStatus === "pending" || b.feeStatus === "manual") await prisma.productBooking.update({ where: { id: b.id }, data: { feeStatus: "none" } });
  await audit("produkt.decide", { entity: "ProductBooking", entityId: b.id, customerId: b.customerId, details: { accept: false, note }, ...(actor ? { actor } : {}) });
  await mailCustomer(info, {
    subject: `Ihre Buchung: ${b.product}`,
    paragraphs: [
      `vielen Dank für Ihre Buchung von ${b.product}. Leider können wir das Produkt für Sie derzeit nicht einrichten. Es entstehen Ihnen keine Kosten.`,
      ...(note?.trim() ? [note.trim()] : []),
      "Bei Fragen antworten Sie einfach auf diese E-Mail.",
    ],
  });
  return { ok: true, ...(msg ? { note: msg } : {}) };
}

// ─── Beenden (nur Anfrage) ────────────────────────────────────────────────

export async function requestProductEnd(
  customerId: string,
  product: string,
  userId: string | null,
  actor?: AuditActor,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { lines } = await budgetState(customerId, now);
  const line = lines.find((l) => l.product === product && l.dailyBudget > 0);
  if (!line) return { ok: false, error: "Dieses Produkt läuft bei Ihnen nicht." };
  const existing = await prisma.productBooking.findFirst({ where: { customerId, product, status: "live" }, orderBy: { createdAt: "desc" } });
  if (existing?.endRequestedAt) return { ok: false, error: "Ihre Anfrage liegt uns schon vor." };
  if (existing) {
    await prisma.productBooking.update({ where: { id: existing.id }, data: { endRequestedAt: now } });
  } else {
    // Produkt aus dem Angebot: Anfrage festhalten (ohne Abrechnung)
    await prisma.productBooking.create({
      data: {
        customerId,
        userId,
        catalogKey: "angebot",
        product,
        dailyBudget: line.dailyBudget,
        status: "live",
        monthlyBudgetFrom: 0,
        monthlyBudgetTo: 0,
        setupFee: 0,
        pricing: "list",
        note: "Produkt aus dem Angebot",
        endRequestedAt: now,
      },
    });
  }
  const info = await customerInfo(customerId);
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { retainerStart: true, onboarding: { select: { offerId: true } } } });
  const offer = c?.onboarding?.offerId ? await prisma.offer.findUnique({ where: { id: c.onboarding.offerId }, select: { term: true } }) : null;
  const term = offer?.term === "12m" ? "12 Monate" : offer?.term === "3m" ? "3 Monate" : "ohne Mindestlaufzeit";
  await audit("produkt.end_request", { entity: "Customer", entityId: customerId, customerId, details: { product }, ...(actor ? { actor } : {}) });
  await adminTask(
    info.contactId,
    `Produkt beenden ${info.name}: ${product}`,
    `Kunde möchte ${product} beenden. Laufzeit: ${term}${c?.retainerStart ? ` ab ${fmtDate(c.retainerStart)}` : ""}. Bitte Laufzeit prüfen, Termin mit dem Kunden abstimmen, Kampagne stoppen, Budget und Monatspreis anpassen.`,
    now,
  );
  await notifyAdmins(`Produkt beenden: ${info.name}`, `${product} – bitte Laufzeit prüfen und Kunde kontaktieren.`, info.contactId, customerId);
  await mailCustomer(info, {
    subject: `Ihre Anfrage: ${product} beenden`,
    paragraphs: [`Ihre Anfrage, ${product} zu beenden, ist bei uns eingegangen. Wir prüfen Ihre Vertragslaufzeit und melden uns kurzfristig mit dem möglichen Enddatum. Bis dahin läuft das Produkt unverändert weiter.`],
  });
  return { ok: true };
}

/** Buchungshistorie für die Kundenakte. */
export async function productHistory(customerId: string, take = 20) {
  const rows = await prisma.productBooking.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => ({
    id: r.id,
    product: r.product,
    catalogKey: r.catalogKey,
    dailyBudget: Number(r.dailyBudget),
    status: r.status,
    startWish: r.startWish,
    createdAt: r.createdAt,
    startedAt: r.startedAt,
    endRequestedAt: r.endRequestedAt,
    monthlyBudgetFrom: r.monthlyBudgetFrom,
    monthlyBudgetTo: r.monthlyBudgetTo,
    feeFrom: r.feeFrom == null ? null : Number(r.feeFrom),
    feeTo: r.feeTo == null ? null : Number(r.feeTo),
    setupFee: Number(r.setupFee),
    tierChange: r.tierChange,
    pricing: r.pricing,
    reason: r.reason,
    setupStatus: r.setupStatus,
    feeStatus: r.feeStatus,
    stripeNote: r.stripeNote,
    note: r.note,
  }));
}
export type ProductHistoryRow = Awaited<ReturnType<typeof productHistory>>[number];
