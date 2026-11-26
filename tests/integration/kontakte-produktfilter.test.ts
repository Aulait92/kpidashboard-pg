// Produktfilter der Kontakte (Ole, 26.11.2026): erscheint erst ab zwei Produkten, wirkt auf Liste, Zähler der
// Ansichten und Pipeline, Berater sehen nur Produkte ihrer eigenen Leads.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/app/buyer/actions", () => ({ getStornogruendePerLead: async () => new Map() }));

import { prisma } from "@/lib/prisma";
import { BuyerLeadsBody } from "@/components/buyer-leads-body";
import { BuyerKanbanBody } from "@/components/buyer-kanban-body";
import { FilterChips } from "@/components/ui/filter-chips";
import { BuyerLeadsTable } from "@/components/buyer-leads-table";
import { KanbanBoard } from "@/components/kanban-board";
import { ladeProduktFilter } from "@/lib/produkt-filter-server";
import { produktWhere } from "@/lib/produkt-filter";
import { leadScope, type TeamCtx } from "@/lib/team";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];
beforeAll(() => requireTestDb());
afterEach(async () => {
  for (const id of ids.splice(0)) await cleanupCustomer(id);
});

const range = { from: new Date(Date.now() - 30 * 86_400_000), to: new Date(Date.now() + 60_000) };

function finde(node: ReactNode, pred: (el: ReactElement) => boolean): ReactElement[] {
  const out: ReactElement[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    if (pred(n)) out.push(n);
    walk((n.props as { children?: ReactNode }).children);
  };
  walk(node);
  return out;
}

async function liste(team: TeamCtx, params: Record<string, string | undefined> = {}) {
  const el = await BuyerLeadsBody({ customerId: team.customerId, team, range, q: "", view: params.ansicht ?? "", phaseKey: "", params, basePath: "/buyer/kontakte" });
  const chips = finde(el, (e) => e.type === FilterChips)[0].props as { fields: { key: string; options: { value: string; label: string }[] }[] };
  const tabelle = finde(el, (e) => e.type === BuyerLeadsTable)[0].props as { leads: { name: string }[] };
  const nav = finde(el, (e) => e.type === "nav")[0];
  const zaehler = Object.fromEntries(
    finde(nav, (e) => !!(e.props as { href?: string }).href).map((l) => {
      const [label, n] = (l.props as { children: ReactNode[] }).children;
      return [label as string, isValidElement(n) ? Number((n.props as { children: unknown }).children) : null];
    }),
  );
  return { chips, namen: tabelle.leads.map((l) => l.name).sort(), zaehler };
}

async function lead(customerId: string, name: string, source: string | null, extra: Record<string, unknown> = {}) {
  await prisma.lead.create({ data: { customerId, name, source, status: "Neuer Lead", ...extra } });
}

describe("Kontakte: Produktfilter", () => {
  it("bei nur einem Produkt (auch Kfz-Varianten) kein Filter", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    await lead(c.id, "A", "Kfz-Versicherung");
    await lead(c.id, "B", "Kfz Wechsel");
    await lead(c.id, "C", null);
    const team: TeamCtx = { customerId: c.id, userId: null, teamRole: "owner" };
    expect((await ladeProduktFilter(leadScope(team), "Kfz-Versicherung")).optionen).toEqual([]);
    const { chips, namen } = await liste(team, { ansicht: "alle", produkt: "Kfz-Versicherung" });
    expect(chips.fields.map((f) => f.key)).toEqual(["phase"]);
    expect(namen).toEqual(["A", "B", "C"]);
  });

  it("ab zwei Produkten: Optionen nach Häufigkeit, Liste, Zähler und Pipeline gefiltert", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    await lead(c.id, "Kfz 1", "Kfz-Versicherung");
    await lead(c.id, "Kfz 2", "Kfz Wechsel", { reached: true, status: "Erreicht" });
    await lead(c.id, "Kfz 3", "Kfz-Versicherung");
    await lead(c.id, "Privat 1", "Privatschutz");
    await lead(c.id, "Privat 2", "Privatschutz");
    const team: TeamCtx = { customerId: c.id, userId: null, teamRole: "owner" };

    const ohne = await liste(team, { ansicht: "alle" });
    const feld = ohne.chips.fields.find((f) => f.key === "produkt");
    expect(feld?.options.map((o) => o.label)).toEqual(["Kfz-Versicherung", "Privatschutz"]);
    expect(ohne.zaehler["Alle"]).toBe(5);

    const mit = await liste(team, { ansicht: "alle", produkt: "Kfz-Versicherung" });
    expect(mit.namen).toEqual(["Kfz 1", "Kfz 2", "Kfz 3"]);
    expect(mit.zaehler["Alle"]).toBe(3);
    expect(mit.zaehler["Neu"]).toBe(2);
    expect((await liste(team, { ansicht: "neu", produkt: "Privatschutz" })).namen).toEqual(["Privat 1", "Privat 2"]);

    const pf = await ladeProduktFilter(leadScope(team), "Privatschutz");
    const board = await BuyerKanbanBody({ customerId: c.id, scope: { ...leadScope(team), ...produktWhere(pf.aktiv) }, range, rangeKey: "x" });
    const leads = (finde(board, (e) => e.type === KanbanBoard)[0].props as { leads: { name: string }[] }).leads;
    expect(leads.map((l) => l.name).sort()).toEqual(["Privat 1", "Privat 2"]);
  });

  it("Berater: nur Produkte und Leads der eigenen Kontakte", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const berater = await makeBuyer(c.id, "advisor");
    await lead(c.id, "Eigen Kfz", "Kfz-Versicherung", { assignedUserId: berater.id });
    await lead(c.id, "Eigen Privat", "Privatschutz", { assignedUserId: berater.id });
    await lead(c.id, "Fremd Tier", "Tierkrankenversicherung");
    await lead(c.id, "Fremd Kfz", "Kfz-Versicherung");
    const team: TeamCtx = { customerId: c.id, userId: berater.id, teamRole: "advisor" };
    const { chips, namen } = await liste(team, { ansicht: "alle", produkt: "Kfz-Versicherung" });
    expect(chips.fields.find((f) => f.key === "produkt")?.options.map((o) => o.label)).toEqual(["Kfz-Versicherung", "Privatschutz"]);
    expect(namen).toEqual(["Eigen Kfz"]);
  });
});
