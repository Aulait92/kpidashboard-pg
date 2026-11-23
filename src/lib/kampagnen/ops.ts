// Kampagnen-Assistent ohne Admin-Login starten und beobachten (Ole, 21.11.2026), für /api/ops/kampagne.
// Kunde per ID (oder eindeutigem Namensteil), Produkt tolerant: genauer Name der Budget-Zeile, Katalog-Schlüssel
// bzw. Anzeigename oder die Art („kfz“, „privatschutz“). Ausgabe ohne Tokens und ohne Lead-Daten.

import { prisma } from "@/lib/prisma";
import { currentBudgets } from "@/lib/budget";
import { redactTokens } from "@/lib/meta-leads";
import { formularArt } from "@/lib/kampagnen/formular-vorgaben";
import { adsManagerUrl, formUrl } from "@/lib/kampagnen/builder";
import type { BuiltState, CampaignContext, LeadFormDraft, ReviewResult, RunStep } from "@/lib/kampagnen/types";

export type ProduktZeile = { product: string; dailyBudget: number };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "");

/**
 * Produktname, wie startCampaignRun ihn erwartet (Name der Budget-Zeile, lib/budget.ts currentBudgets).
 * Reihenfolge: genauer Name, Name ohne Satzzeichen/Groß-Klein, Katalog-Aliase (Schlüssel, Anzeigename), Art (kfz/privatschutz).
 * Ohne Treffer: die Eingabe unverändert (startCampaignRun meldet dann ggf. „kein Werbebudget“). Mehrdeutig: Fehler.
 */
export function resolveProduct(input: string, zeilen: ProduktZeile[], aliase: string[] = []): { ok: true; product: string; matched: boolean } | { ok: false; error: string } {
  const t = input.trim();
  if (!t) return { ok: false, error: "Produkt fehlt." };
  const exact = zeilen.find((z) => z.product === t);
  if (exact) return { ok: true, product: exact.product, matched: true };
  for (const name of [t, ...aliase]) {
    const hit = zeilen.filter((z) => norm(z.product) === norm(name));
    if (hit.length === 1) return { ok: true, product: hit[0].product, matched: true };
  }
  const art = formularArt(t) ?? (/^(kfz|auto)$/i.test(t) ? "kfz" : null);
  if (art) {
    const hit = zeilen.filter((z) => formularArt(z.product) === art);
    const mitBudget = hit.filter((z) => z.dailyBudget > 0);
    const wahl = mitBudget.length ? mitBudget : hit;
    if (wahl.length === 1) return { ok: true, product: wahl[0].product, matched: true };
    if (wahl.length > 1) return { ok: false, error: `„${t}“ ist mehrdeutig: ${wahl.map((z) => `„${z.product}“`).join(", ")}. Bitte den genauen Namen übergeben.` };
  }
  return { ok: true, product: t, matched: false };
}

/** Kunde per ID, sonst per eindeutigem Namensteil. */
export async function findCustomer(kunde: string): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const k = kunde.trim();
  if (!k) return { ok: false, error: "Parameter „kunde“ fehlt." };
  const byId = await prisma.customer.findUnique({ where: { id: k }, select: { id: true, name: true } });
  if (byId) return { ok: true, ...byId };
  const byName = await prisma.customer.findMany({ where: { name: { contains: k, mode: "insensitive" } }, select: { id: true, name: true }, take: 5 });
  if (byName.length === 1) return { ok: true, ...byName[0] };
  if (byName.length > 1) return { ok: false, error: `Mehrere Kunden passen: ${byName.map((c) => `${c.name} (${c.id})`).join(", ")}.` };
  return { ok: false, error: "Kunde nicht gefunden." };
}

/** Budget-Zeilen des Kunden (alle, auch ohne Budget) mit Formular-Art. */
export async function produktZeilen(customerId: string): Promise<(ProduktZeile & { formular: string | null })[]> {
  const { lines } = await currentBudgets(customerId).catch(() => ({ lines: [] as ProduktZeile[] }));
  return lines.map((l) => ({ product: l.product, dailyBudget: l.dailyBudget, formular: formularArt(l.product) }));
}

/** Katalog-Aliase (Name, Slug, Anzeigename) zur Eingabe, z. B. Schlüssel „kfz-versicherung“ → „Kfz-Versicherung“. */
export async function katalogAliase(input: string): Promise<string[]> {
  const t = input.trim();
  if (!t) return [];
  const rows = await prisma.product
    .findMany({
      where: { OR: [{ name: { equals: t, mode: "insensitive" } }, { slug: { equals: t, mode: "insensitive" } }, { displayName: { equals: t, mode: "insensitive" } }] },
      select: { name: true, displayName: true },
      take: 3,
    })
    .catch(() => []);
  return rows.flatMap((r) => [r.name, r.displayName].filter((x): x is string => !!x));
}

const clean = (s: string | null | undefined) => (s ? redactTokens(s) : s ?? null);

/** Läufe des Kunden (neueste zuerst): Status, Schritte, Fehler, IDs und Links. Keine Tokens, keine Lead-Daten. */
export async function runOverview(customerId: string, take = 10) {
  const runs = await prisma.campaignRun.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, product: true, kind: true, trigger: true, createdBy: true, status: true, autoBuild: true, steps: true, error: true, review: true, form: true, built: true, context: true, costCents: true, createdAt: true, finishedAt: true },
  });
  return runs.map((r) => {
    const ctx = (r.context ?? {}) as Partial<CampaignContext>;
    const built = (r.built ?? null) as BuiltState | null;
    const review = (r.review ?? null) as ReviewResult | null;
    const form = (r.form ?? null) as LeadFormDraft | null;
    return {
      id: r.id,
      product: r.product,
      kind: r.kind,
      trigger: r.trigger,
      createdBy: r.createdBy,
      status: r.status,
      autoBuild: r.autoBuild,
      error: clean(r.error),
      steps: ((r.steps ?? []) as unknown as RunStep[]).map((s) => ({ key: s.key, status: s.status, note: clean(s.note), error: clean(s.error), startedAt: s.startedAt ?? null, finishedAt: s.finishedAt ?? null })),
      review: review ? { status: review.status, summary: review.summary, findings: review.findings.length } : null,
      formular: form ? { name: form.formName, fragen: form.questions.map((q) => ({ key: q.key, label: q.label, options: q.options })) } : null,
      meta: built
        ? { campaignId: built.campaignId ?? null, formId: built.formId ?? null, adSetIds: built.adSetIds ?? [], adIds: built.adIds ?? [], leadSourceId: built.leadSourceId ?? null }
        : null,
      links: {
        adsManager: built?.campaignId && ctx.adAccountId ? adsManagerUrl(ctx.adAccountId, built.campaignId) : null,
        form: built?.formId && ctx.pageId ? formUrl(ctx.pageId, built.formId) : null,
      },
      costCents: r.costCents,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  });
}
