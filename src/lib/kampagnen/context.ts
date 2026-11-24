// Kampagnen-Agenten: Kontext aus der Kundenakte laden und Voraussetzungen prüfen.

import { publicUrl } from "@/lib/public-url";
import { getOrCreateBookingSlug } from "@/lib/calendar";
import { libraryWinners, winnersBlock } from "@/lib/kampagnen/ad-library";
import { ladeEigeneGewinnerStandard, type EigeneGewinnerErgebnis } from "@/lib/kampagnen/eigene-gewinner";
import {
  HINWEIS_GESPERRT,
  fremdMusterAus,
  hinweisFremd,
  ladeQuelle,
  ladeSeiten,
  namensteileDerQuelle,
  ohneNamen,
  type Namensteil,
  type QuelleDaten,
  type ZielDaten,
} from "@/lib/kampagnen/fremdvorlagen";
import { ausgenommeneUnter, meldungLernSperre, vomLernenAusgenommen, type LernSperre } from "@/lib/kampagnen/lern-sperre";
import { prisma } from "@/lib/prisma";
import { redactTokens } from "@/lib/meta-leads";
import { currentBudgets, customerCpl } from "@/lib/budget";
import { productPatterns } from "@/lib/kampagnen/agents";
import type { Bildidee, CampaignContext, EigenerGewinner, FremdMuster } from "@/lib/kampagnen/types";
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

type GewinnerLader = (input: { customerId: string; adAccountId: string | null; product: string }) => Promise<EigeneGewinnerErgebnis>;

/** Klare Meldung, warum `vorlagenVon` nicht geht (Kunde nicht gefunden, kein Werbekonto). Nie stillschweigend eigene Vorlagen. */
export class VorlagenFehler extends Error {}

export const MELDUNG_QUELLE_FEHLT = "vorlagenVon: Der Kunde, dessen Anzeigen als Muster dienen sollen, wurde nicht gefunden. Es wurde nichts gestartet.";
export const MELDUNG_QUELLE_OHNE_KONTO = "vorlagenVon: Für den Kunden, dessen Anzeigen als Muster dienen sollen, ist kein Meta-Werbekonto hinterlegt. Es wurde nichts gestartet.";

/**
 * Vor dem Start mit `vorlagenVon` prüfen (Ole, 24.11.2026): Quelle vorhanden, mit Werbekonto, und weder Quelle noch Ziel
 * vom gemeinsamen Anzeigenlernen ausgenommen. null = in Ordnung, sonst die Meldung für den Aufrufer.
 */
export async function pruefeVorlagenQuelle(
  zielId: string,
  quelleId: string,
  deps: { lernSperre?: LernSperre; quelle?: (id: string) => Promise<QuelleDaten | null> } = {},
): Promise<Problem | null> {
  if (!quelleId || quelleId === zielId) return null;
  const quelle = await (deps.quelle ?? ladeQuelle)(quelleId);
  if (!quelle) return { key: "vorlagenVon", message: MELDUNG_QUELLE_FEHLT };
  const raus = await ausgenommeneUnter([zielId, quelle.id], deps.lernSperre);
  if (raus.size) return { key: "lernSperre", message: meldungLernSperre(zielId, raus) };
  if (!quelle.adAccountId) return { key: "vorlagenVon", message: MELDUNG_QUELLE_OHNE_KONTO };
  return null;
}

type FremdErgebnis = {
  /** false: Quelle oder Ziel ist ausgenommen, es wurde nichts geladen */
  fremd: boolean;
  quelleId: string;
  muster: FremdMuster[];
  hinweis: string;
  teile: Namensteil[];
};

/**
 * Muster aus dem Werbekonto eines anderen Kunden laden (gemeinsames Anzeigenlernen, lib/kampagnen/fremdvorlagen.ts).
 * Zurück kommen nur bereinigte Muster: keine Anzeigen- und Kampagnennamen, keine Kennzahlen, keine Bild-Adresse. Das
 * Vorlagenbild sieht höchstens der Bildidee-Aufruf (feste Kategorien, lib/kampagnen/bildidee.ts), sonst niemand.
 */
async function ladeFremdMuster(o: {
  zielId: string;
  quelleId: string;
  product: string;
  ziel: ZielDaten;
  lernSperre?: LernSperre;
  ladeGewinner: GewinnerLader;
  bildidee?: (bildUrl: string) => Promise<Bildidee | null>;
  quelle?: (id: string) => Promise<QuelleDaten | null>;
}): Promise<FremdErgebnis> {
  const quelle = await (o.quelle ?? ladeQuelle)(o.quelleId);
  if (!quelle) throw new VorlagenFehler(MELDUNG_QUELLE_FEHLT);
  const teile = namensteileDerQuelle(quelle, o.ziel);
  // Widerspruch von Quelle oder Ziel: nichts laden (und nicht stillschweigend auf eigene Vorlagen ausweichen)
  if ((await ausgenommeneUnter([o.zielId, quelle.id], o.lernSperre)).size) return { fremd: false, quelleId: quelle.id, muster: [], hinweis: HINWEIS_GESPERRT, teile };
  if (!quelle.adAccountId) throw new VorlagenFehler(MELDUNG_QUELLE_OHNE_KONTO);
  let gewinner: EigenerGewinner[] = [];
  try {
    const r = await o.ladeGewinner({ customerId: quelle.id, adAccountId: quelle.adAccountId, product: o.product });
    gewinner = r.gewinner;
    // Der Hinweis des Laders nennt das Werbekonto der Quelle: nur ins Server-Log, nie in den Kontext des Zielkunden
    if (r.hinweis) console.error("[fremdvorlagen]", redactTokens(r.hinweis));
  } catch (err) {
    console.error("[fremdvorlagen]", redactTokens(err instanceof Error ? err.message : String(err)).slice(0, 200));
  }
  const bildideen = await Promise.all(gewinner.map((w) => (w.bildUrl && o.bildidee ? o.bildidee(w.bildUrl).catch(() => null) : null)));
  const muster = fremdMusterAus(gewinner, { teile, versicherer: o.ziel.insurer }, bildideen);
  return { fremd: true, quelleId: quelle.id, muster, hinweis: hinweisFremd(muster.length), teile };
}

/**
 * Seiten, die in der Werbebibliothek nicht als Vorlage dienen dürfen: die Seiten eigener Kunden, die vom gemeinsamen
 * Anzeigenlernen ausgenommen sind; ist der Zielkunde selbst ausgenommen, die Seiten aller eigenen Kunden; dazu immer
 * die Quelle dieses Laufs (sie wird nie gezeigt, auch nicht über ihren Seitennamen).
 */
async function gesperrteSeiten(zielId: string, quelleId: string | null, lernSperre?: LernSperre): Promise<{ namen: string[]; seiten: string[] }> {
  const ids = (await prisma.customer.findMany({ select: { id: true } })).map((c) => c.id);
  const ausgenommen = await ausgenommeneUnter(ids, lernSperre);
  const raus = new Set(ausgenommen.has(zielId) ? ids : ausgenommen);
  if (quelleId) raus.add(quelleId);
  raus.delete(zielId);
  return raus.size ? ladeSeiten([...raus]) : { namen: [], seiten: [] };
}

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
    /**
     * Gewinner-Anzeigen eines anderen Kunden als Muster (Ole, 24.11.2026, gemeinsames Anzeigenlernen). Kunden-ID; dessen
     * Werbekonto liefert die Muster statt des eigenen. Es gelten die Leitplanken (lib/kampagnen/fremdvorlagen.ts): nur
     * bereinigte Muster, keine Namen, Kennzahlen oder Bild-Adressen der Quelle im Kontext. Wirft VorlagenFehler, wenn
     * es den Kunden nicht gibt oder er kein Werbekonto hat (nie stillschweigend eigene Vorlagen).
     */
    vorlagenVon?: string | null;
    /** ersetzbar für Tests */
    eigeneGewinner?: GewinnerLader;
    /** Widerspruch gegen das gemeinsame Anzeigenlernen (Standard: lib/kampagnen/lern-sperre.ts), ersetzbar für Tests */
    lernSperre?: LernSperre;
    /** Abstrakte Bildidee aus einem Vorlagenbild der Quelle (lib/kampagnen/bildidee.ts); ohne: Muster ohne Bildidee */
    bildidee?: (bildUrl: string) => Promise<Bildidee | null>;
    /** Kundendaten der Quelle, ersetzbar für Tests */
    quelle?: (id: string) => Promise<QuelleDaten | null>;
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
  const ladeGewinner = opts.eigeneGewinner ?? ladeEigeneGewinnerStandard;
  const advisorName = person || sc?.name || c.name;
  const insurer = sc?.insurer && sc.insurer !== "Makler" ? sc.insurer : null;
  const fremdId = vorlagen && opts.vorlagenVon && opts.vorlagenVon !== customerId ? opts.vorlagenVon : null;
  // Muster aus dem Werbekonto eines anderen Kunden (gemeinsames Anzeigenlernen): nur bereinigt, siehe ladeFremdMuster
  const fremd = fremdId
    ? await ladeFremdMuster({
        zielId: customerId,
        quelleId: fremdId,
        product,
        ziel: { customerName: c.name, advisorName, city: sc?.city ?? null, zip: sc?.zip ?? null, region: c.region, insurer, product, patterns: productPatterns(product), special: q.special ?? null },
        lernSperre: opts.lernSperre,
        ladeGewinner,
        bildidee: opts.bildidee,
        quelle: opts.quelle,
      })
    : null;
  // Eigene Gewinner aus dem angebundenen Werbekonto (Ole, 21.11.2026): Vorrang vor der Werbebibliothek
  const eigene: EigeneGewinnerErgebnis =
    vorlagen && !fremd
      ? await (async () => ladeGewinner({ customerId, adAccountId: c.metaAdAccountId, product }))().catch((err) => ({
          gewinner: [],
          hinweis: `Eigene Gewinner nicht genutzt: ${redactTokens(err instanceof Error ? err.message : String(err)).slice(0, 160)}`,
        }))
      : { gewinner: [], hinweis: null };
  // Werbebibliothek ohne die Seiten ausgenommener eigener Kunden; lässt sich das nicht klären, lieber ohne Bibliothek
  const bibliothek = vorlagen
    ? await (async () => {
        const raus = await gesperrteSeiten(customerId, fremd?.quelleId ?? null, opts.lernSperre ?? vomLernenAusgenommen);
        return winnersBlock(await libraryWinners(product, { excludePages: [c.name, ...raus.namen], excludePageIds: raus.seiten }));
      })().catch(() => null)
    : null;
  const wish = opts.wish?.trim() || null;
  const consentText = angaben ? leadFormConsentText({ ...angaben, datenschutzUrl: privacyUrl ?? angaben.datenschutzUrl }) : null;
  const consentFehlt = angaben ? consentMissing({ ...angaben, datenschutzUrl: privacyUrl ?? angaben.datenschutzUrl }) : [];
  return {
    customerId: c.id,
    customerName: c.name,
    advisorName,
    vermittlerTyp: c.vermittlerTyp === "makler" ? "makler" : c.vermittlerTyp === "mehrfachvertreter" ? "mehrfachvertreter" : "vertreter",
    insurer,
    product,
    // Der Zusatzwunsch darf die Quelle nicht nennen („an Lohmanns Gewinnern anlehnen“): Namensteile raus
    wish: fremd ? ohneNamen(wish, fremd.teile) : wish,
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
    libraryWinners: bibliothek,
    // Bestlaufende Anzeigen aus dem eigenen Werbekonto (ohne Konto/Daten/Berechtigung: leer, Hinweis für den Admin)
    eigeneGewinner: eigene.gewinner.length ? eigene.gewinner : null,
    eigeneGewinnerHinweis: fremd ? fremd.hinweis : eigene.hinweis,
    // Muster aus einem anderen Werbekonto: Kennzeichen, bereinigte Muster und (nur intern) die Kunden-ID der Quelle
    ...(fremd ? { fremdvorlagen: fremd.fremd, fremdMuster: fremd.muster.length ? fremd.muster : null, vorlagenQuelleId: fremd.fremd ? fremd.quelleId : null } : {}),
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
