// Kampagnen-Agenten: Kontext aus der Kundenakte laden und Voraussetzungen prüfen.

import { publicUrl } from "@/lib/public-url";
import { getOrCreateBookingSlug } from "@/lib/calendar";
import { libraryWinners, winnersBlock } from "@/lib/kampagnen/ad-library";
import { ladeEigeneGewinnerStandard, type EigeneGewinnerErgebnis } from "@/lib/kampagnen/eigene-gewinner";
import { prisma } from "@/lib/prisma";
import { redactTokens } from "@/lib/meta-leads";
import { currentBudgets, customerCpl } from "@/lib/budget";
import { productPatterns } from "@/lib/kampagnen/agents";
import type { CampaignContext } from "@/lib/kampagnen/types";
import { consentAngabenFor } from "@/lib/einwilligung-leadformular-server";
import { consentMissing, leadFormConsentText } from "@/lib/einwilligung-leadformular";

type WebsiteInfo = { privacyUrl?: string | null; impressumUrl?: string | null; sourceUrl?: string | null };
type Questionnaire = { special?: string; anrede?: string };

const httpUrl = (u: string | null | undefined): string | null => {
  const t = (u ?? "").trim();
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const url = new URL(withProto);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Produkte mit Werbebudget (Angebot bzw. „Budget ändern“) – Auswahl in der Kampagnen-Karte. */
export async function campaignProducts(customerId: string): Promise<{ product: string; dailyBudget: number }[]> {
  const { lines } = await currentBudgets(customerId).catch(() => ({ lines: [] }));
  return lines.filter((l) => l.dailyBudget > 0);
}

export async function loadCampaignContext(
  customerId: string,
  product: string,
  opts: {
    wish?: string | null;
    privacyUrl?: string | null;
    dailyBudgetEur?: number | null;
    /** false: ohne Vorlagen (eigene Gewinner, Werbebibliothek), z. B. für Vorgabewerte beim Seitenaufruf */
    vorlagen?: boolean;
    /** ersetzbar für Tests */
    eigeneGewinner?: (input: { customerId: string; adAccountId: string | null; product: string }) => Promise<EigeneGewinnerErgebnis>;
  } = {},
): Promise<CampaignContext> {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      plan: true,
      leadAddress: true,
      calendarConnection: { select: { status: true } },
      vermittlerTyp: true,
      region: true,
      metaAdAccountId: true,
      metaPageId: true,
      salesContact: { select: { name: true, firstName: true, lastName: true, city: true, zip: true, url: true, insurer: true } },
      onboarding: { select: { questionnaire: true, websiteInfo: true } },
      agentConfig: { select: { knowledge: true, systemPrompt: true } },
      leadSources: { where: { pageId: { not: null } }, select: { pageId: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const sc = c.salesContact;
  const web = (c.onboarding?.websiteInfo ?? {}) as WebsiteInfo;
  const q = (c.onboarding?.questionnaire ?? {}) as Questionnaire;
  const lines = await campaignProducts(customerId);
  const line = lines.find((l) => l.product === product);
  const cpl = await customerCpl(customerId, [product], c.vermittlerTyp).catch(() => null);
  const person = [sc?.firstName, sc?.lastName].filter(Boolean).join(" ").trim();
  const knowledge = [c.agentConfig?.knowledge, c.agentConfig?.systemPrompt].filter(Boolean).join("\n\n").slice(0, 2500);
  const privacyUrl = httpUrl(opts.privacyUrl) ?? httpUrl(web.privacyUrl) ?? httpUrl(web.impressumUrl);
  // Einwilligung im Formular: fester Wortlaut mit Vermittler, Anschrift, KI-Assistent, Widerruf (Ole, 15.11.2026)
  const angaben = await consentAngabenFor(customerId).catch(() => null);
  const vorlagen = opts.vorlagen !== false;
  // Eigene Gewinner aus dem angebundenen Werbekonto (Ole, 21.11.2026): Vorrang vor der Werbebibliothek
  const eigene: EigeneGewinnerErgebnis = vorlagen
    ? await (opts.eigeneGewinner ?? ladeEigeneGewinnerStandard)({ customerId, adAccountId: c.metaAdAccountId, product }).catch((err) => ({
        gewinner: [],
        hinweis: `Eigene Gewinner nicht genutzt: ${redactTokens(err instanceof Error ? err.message : String(err)).slice(0, 160)}`,
      }))
    : { gewinner: [], hinweis: null };
  const consentText = angaben ? leadFormConsentText({ ...angaben, datenschutzUrl: privacyUrl ?? angaben.datenschutzUrl }) : null;
  const consentFehlt = angaben ? consentMissing({ ...angaben, datenschutzUrl: privacyUrl ?? angaben.datenschutzUrl }) : [];
  return {
    customerId: c.id,
    customerName: c.name,
    advisorName: person || sc?.name || c.name,
    vermittlerTyp: c.vermittlerTyp === "makler" ? "makler" : c.vermittlerTyp === "mehrfachvertreter" ? "mehrfachvertreter" : "vertreter",
    insurer: sc?.insurer && sc.insurer !== "Makler" ? sc.insurer : null,
    product,
    wish: opts.wish?.trim() || null,
    anrede: q.anrede === "Du" ? "Du" : "Sie",
    leadAddress: c.leadAddress === "du" ? "du" : "sie",
    city: sc?.city?.trim() || null,
    zip: sc?.zip?.trim() || null,
    region: c.region?.trim() || null,
    website: httpUrl(sc?.url ?? web.sourceUrl ?? null),
    privacyUrl,
    consentText,
    consentFehlt,
    pageId: c.metaPageId ?? c.leadSources[0]?.pageId ?? null,
    adAccountId: c.metaAdAccountId,
    // Gebuchtes, noch nicht gestartetes Produkt: Budget aus der Buchung (zählt erst ab „Gestartet“)
    dailyBudgetEur: line?.dailyBudget ?? (opts.dailyBudgetEur && opts.dailyBudgetEur > 0 ? opts.dailyBudgetEur : 0),
    cplEur: cpl?.cpl ?? null,
    special: q.special?.trim() || null,
    assistantKnowledge: knowledge || null,
    patterns: productPatterns(product),
    // Dankeseite: Buchungskalender des Kunden (nur mit verbundenem Kalender)
    needsBooking: c.plan !== "service",
    bookingUrl:
      c.plan !== "service" && c.calendarConnection?.status === "connected"
        ? publicUrl(`/book/${await getOrCreateBookingSlug(c.id)}`)
        : null,
    // Gewinner anderer aus der Meta-Werbebibliothek (ohne Zugang zur Bibliothek: leer)
    libraryWinners: vorlagen ? winnersBlock(await libraryWinners(product, { excludePages: [c.name] }).catch(() => [])) : null,
    // Bestlaufende Anzeigen aus dem eigenen Werbekonto (ohne Konto/Daten/Berechtigung: leer, Hinweis für den Admin)
    eigeneGewinner: eigene.gewinner.length ? eigene.gewinner : null,
    eigeneGewinnerHinweis: eigene.hinweis,
  };
}

export type Problem = { key: string; message: string };

export type PrerequisiteDeps = {
  checkAdAccount: (id: string) => Promise<{ ok: true; name: string } | { ok: false; error: string }>;
  pageToken: (pageId: string) => Promise<string>;
  /** Hat die Seite die Lead-Ads-Nutzungsbedingungen akzeptiert? null = unbekannt (nicht blockieren). */
  leadgenTos?: (pageId: string) => Promise<boolean | null>;
  env: () => { anthropic: boolean; r2: boolean; meta: boolean };
};

/** Voraussetzungen vor dem Start (mit verständlichen Meldungen, was zu tun ist). */
export async function checkPrerequisites(ctx: CampaignContext, deps: PrerequisiteDeps): Promise<Problem[]> {
  const out: Problem[] = [];
  const env = deps.env();
  if (!env.anthropic) out.push({ key: "anthropic", message: "ANTHROPIC_API_KEY fehlt in Railway, die KI-Agenten können nicht arbeiten." });
  if (!env.r2) out.push({ key: "r2", message: "Bildspeicher (R2_BUCKET/R2_PUBLIC_URL) fehlt in Railway, Bilder können nicht erzeugt werden." });
  if (!env.meta) out.push({ key: "meta", message: "META_ACCESS_TOKEN fehlt in Railway." });
  if (ctx.dailyBudgetEur <= 0) {
    out.push({ key: "budget", message: `Für „${ctx.product}“ ist kein Werbebudget hinterlegt (Angebot bzw. Konto → Werbebudget).` });
  }
  if (ctx.needsBooking && !ctx.bookingUrl) {
    out.push({
      key: "booking",
      message: "Der Kalender des Kunden ist nicht verbunden: Die Dankeseite des Formulars braucht den Buchungskalender, damit Leads direkt einen Termin buchen (Kunde: Einstellungen → Mein Kalender).",
    });
  }
  if (!ctx.privacyUrl) {
    out.push({ key: "privacy", message: "Keine Datenschutz-URL: Bitte die Datenschutzseite des Kunden eintragen (Pflicht im Sofortformular)." });
  }
  // Einwilligung braucht Vermittler, Anschrift und Widerrufs-Mail (Ole, 23.11.2026: Schwarzkopf-Lauf lief 15 Minuten und
  // wurde dann vom Prüfer wegen „[Anschrift]“ gestoppt). Datenschutz-URL prüft der Punkt darüber.
  const fehlt = (ctx.consentFehlt ?? []).filter((x) => !/Datenschutz/i.test(x));
  if (fehlt.length) {
    out.push({
      key: "consent",
      message: `Für die Einwilligung im Formular fehlt: ${fehlt.join(", ")}. Bitte in der Kundenakte ergänzen (Vertriebskontakt: Straße, PLZ, Ort, E-Mail).`,
    });
  }
  if (!ctx.adAccountId) {
    out.push({ key: "adAccount", message: "Kein Meta-Werbekonto hinterlegt (Reiter „Leads & Formulare“ → Meta-Werbekonto)." });
  } else if (env.meta) {
    const r = await deps.checkAdAccount(ctx.adAccountId);
    if (!r.ok) {
      out.push({
        key: "adAccount",
        message: `Kein Zugriff auf das Werbekonto act_${ctx.adAccountId}: ${r.error}, Der Kunde muss unserem Business Manager Partnerzugriff auf das Werbekonto mit „Kampagnen verwalten“ (ads_management) geben, und Ole muss das Konto dem Systemnutzer zuweisen.`,
      });
    }
  }
  if (!ctx.pageId) {
    out.push({ key: "page", message: "Keine Facebook-Seite des Kunden hinterlegt (Seiten-ID in der Kampagnen-Karte eintragen)." });
  } else if (env.meta) {
    try {
      await deps.pageToken(ctx.pageId);
      // Lead-Ads-Bedingungen (Ole, 24.11.2026: Schwarzkopf-Lauf scheiterte erst nach 15 Minuten beim Anlegen)
      const tos = deps.leadgenTos ? await deps.leadgenTos(ctx.pageId).catch(() => null) : null;
      if (tos === false) {
        out.push({
          key: "leadgenTos",
          message: `Die Facebook-Seite hat die Nutzungsbedingungen für Lead Ads noch nicht akzeptiert. Ein Admin der Seite öffnet einmal https://www.facebook.com/ads/leadgen/tos?page_id=${ctx.pageId} und klickt auf „Akzeptieren“.`,
        });
      }
    } catch (err) {
      out.push({
        key: "page",
        message: `Kein Zugriff auf die Facebook-Seite ${ctx.pageId} (${err instanceof Error ? err.message.slice(0, 160) : "Fehler"}): Der Kunde muss uns Partnerzugriff auf die Seite geben (inkl. Leads und Werbeanzeigen), und die Seite muss dem Systemnutzer zugewiesen sein.`,
      });
    }
  }
  return out;
}
