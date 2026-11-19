// Tagesportion der Vermittlerliste für Instantly (Ole, 19.11.2026). Die App lädt keine Leads per API in Kampagnen:
// Listen gehen als CSV in Instantly. Damit nicht eine Organisation die Welle bekommt, sondern alle gleichzeitig, kommt
// die Liste gemischt (lib/vertrieb/mischen.ts) und tageweise: je Tag höchstens `menge` Kontakte und je Ziel-Domain
// höchstens `proDomain` (Standard 30, VERTRIEB_DOMAIN_TAGESLIMIT). Eine gemischte Kampagne mit der Variable
// {{gesellschaft}} statt einer Kampagne je Gesellschaft: Instantly sendet je Kampagne in Upload-Reihenfolge, die
// Mischung bleibt also nur in einer Kampagne erhalten, und die Obergrenze je Domain gilt über alle Gesellschaften.
//
// Vor der Vergabe prüft vorUploadPruefen (feste Sperrliste, „nie kontaktieren“, Abmeldung, harter Bounce) ohne
// Instantly-Abruf. Vergebene Kontakte bekommen enrichment.instantlyPortion = { tag, am }; erneutes Herunterladen am
// selben Tag liefert dieselbe Portion (nichts doppelt, nichts verloren). Keine Instantly-Aufrufe, nichts wird gesendet.
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/vertrieb/dates";
import { domainTageslimit, mailDomain, mischen, tagesPortion } from "@/lib/vertrieb/mischen";
import { vorUploadPruefen } from "@/lib/vertrieb/nie-kontaktieren-server";

export const PORTION_STANDARD = 500;

const AUSWAHL = {
  id: true, email: true, name: true, firstName: true, lastName: true, url: true, phone: true, city: true, insurer: true,
  enrichment: true, stage: true, nieKontaktierenAt: true, createdAt: true,
  campaigns: { select: { id: true }, take: 1 },
} satisfies Prisma.SalesContactSelect;
type Kontakt = Prisma.SalesContactGetPayload<{ select: typeof AUSWAHL }>;

export type PortionZeile = { email: string; firstName: string; lastName: string; companyName: string; website: string; phone: string; city: string; gesellschaft: string };
export type Portion = {
  tag: string;
  /** schon heute vergeben (erneut heruntergeladen) */
  wiederholt: boolean;
  zeilen: PortionZeile[];
  /** noch offen für spätere Tage */
  offen: number;
  gesperrt: number;
  jeGesellschaft: Record<string, number>;
};

const portionVon = (k: Kontakt) => ((k.enrichment ?? {}) as { instantlyPortion?: { tag?: string } }).instantlyPortion?.tag ?? null;

function zeile(k: Kontakt): PortionZeile {
  return {
    email: k.email.trim().toLowerCase(),
    firstName: k.firstName ?? "",
    lastName: k.lastName ?? "",
    companyName: k.name === k.email ? "" : k.name,
    website: k.url ?? "",
    phone: k.phone ?? "",
    city: k.city ?? "",
    gesellschaft: k.insurer ?? "",
  };
}

/**
 * Portion für heute: anwenden false = nur ansehen (nichts vergeben). Mit anwenden werden die Kontakte als vergeben
 * markiert. Gibt es für heute schon eine Portion, kommt genau diese zurück.
 */
export async function instantlyPortion(opts: { menge?: number; proDomain?: number; anwenden?: boolean; now?: Date } = {}): Promise<Portion> {
  const now = opts.now ?? new Date();
  const tag = dayKey(now);
  const menge = Math.max(1, Math.floor(opts.menge ?? PORTION_STANDARD));
  const proDomain = Math.max(1, Math.floor(opts.proDomain ?? domainTageslimit()));
  const alle = await prisma.salesContact.findMany({
    where: { enrichment: { path: ["import", "liste"], equals: "vermittler" } },
    select: AUSWAHL,
    orderBy: { createdAt: "asc" },
  });
  const zaehlen = (ks: Kontakt[]) => ks.reduce<Record<string, number>>((m, k) => ((m[k.insurer ?? "ohne Angabe"] = (m[k.insurer ?? "ohne Angabe"] ?? 0) + 1), m), {});

  const heute = alle.filter((k) => portionVon(k) === tag);
  const kandidaten = alle.filter((k) => !portionVon(k) && !k.nieKontaktierenAt && k.stage === "NEU" && k.campaigns.length === 0);
  // In Stücken prüfen (Grenze der Datenbank-Parameter je Abfrage)
  const erlaubt = new Set<string>();
  let gesperrt = 0;
  for (let i = 0; i < kandidaten.length; i += 5000) {
    const p = await vorUploadPruefen(kandidaten.slice(i, i + 5000).map((k) => k.email));
    p.erlaubt.forEach((e) => erlaubt.add(e));
    gesperrt += p.gesperrt.length;
  }
  const frei = kandidaten.filter((k) => erlaubt.has(k.email.trim().toLowerCase()));

  if (heute.length) {
    const gemischt = mischen(heute, (k) => k.insurer, (k) => k.email);
    return { tag, wiederholt: true, zeilen: gemischt.map(zeile), offen: frei.length, gesperrt, jeGesellschaft: zaehlen(heute) };
  }

  const gemischt = mischen(frei, (k) => k.insurer, (k) => k.email);
  const portion = tagesPortion(gemischt, (k) => k.email, { menge, proDomain });
  if (opts.anwenden) {
    const am = now.toISOString();
    for (let i = 0; i < portion.length; i += 200) {
      await prisma.$transaction(
        portion.slice(i, i + 200).map((k) =>
          prisma.salesContact.update({
            where: { id: k.id },
            data: { enrichment: { ...((k.enrichment ?? {}) as Record<string, unknown>), instantlyPortion: { tag, am } } as Prisma.InputJsonValue },
          }),
        ),
      );
    }
  }
  return { tag, wiederholt: false, zeilen: portion.map(zeile), offen: frei.length - portion.length, gesperrt, jeGesellschaft: zaehlen(portion) };
}

const zelle = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV für den Instantly-Import (Komma, Spalten wie in Instantly, „gesellschaft“ als eigene Variable {{gesellschaft}}). */
export function portionCsv(zeilen: PortionZeile[]): string {
  const kopf = ["email", "first_name", "last_name", "company_name", "website", "phone", "city", "gesellschaft"];
  const rows = zeilen.map((z) => [z.email, z.firstName, z.lastName, z.companyName, z.website, z.phone, z.city, z.gesellschaft].map(zelle).join(","));
  return "﻿" + [kopf.join(","), ...rows].join("\r\n");
}

/** Ziel-Domains einer Portion mit Anzahl (zum Prüfen der Obergrenze). */
export const domainsDerPortion = (zeilen: PortionZeile[]) =>
  zeilen.reduce<Map<string, number>>((m, z) => m.set(mailDomain(z.email), (m.get(mailDomain(z.email)) ?? 0) + 1), new Map());
