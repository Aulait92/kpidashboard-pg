// Neue Terminvorbereitung (Ole, 15.11.2026): Tarifauswahl laden und speichern (Autosave), Vertreter oder Makler und
// Gesellschaft, eigene Tarife, „Meine Merkmale“, Preise aus Angebots-PDFs. Reine Funktionen: lib/tarifauswahl.ts.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { appointmentScope, type TeamCtx } from "@/lib/team";
import { angeboteAuslesen, cleanAngebote } from "@/lib/angebote";
import { angeboteAuslesenErlaubt } from "@/lib/termin-vorbereitung-server";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { gesellschaftAusText, gesellschaftName, gesellschaftSchluessel, sortiereGesellschaften, sparteVon, type Katalog, type Vertrieb } from "@/lib/tarifkatalog";
import {
  ausAltenAngeboten,
  cleanTarifauswahl,
  kurzName,
  preiseUebernehmen,
  startAuswahl,
  ungepruefteBeitraege,
  zuAngebote,
  type EigenerTarifDaten,
  type MeineAuswahl,
  type Tarifauswahl,
} from "@/lib/tarifauswahl";
import { spartenFuerTermin } from "@/lib/terminvorbereitung-neu";
import { ladePreisPilot } from "@/lib/preise/pilot-server";
import { rechnerUrl } from "@/lib/preise/pilot";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";
import { schutzVorschlag } from "@/lib/schutz-ueberblick";
import { asAnsprache } from "@/lib/ansprache";
import { bisherAbgleichen, bisherAusSchutz, bisherVorschlag, schutzVonHand } from "@/lib/bisheriger-vertrag";
import { bisherPruefen, bisherQuellen, gesundheitFrei } from "@/lib/bisheriger-vertrag-server";
import { auswahlAuffrischen, vorschlaegeAusBisher, vorschlaegeAusEigenemTarif } from "@/lib/tarif-vorschlaege";
import { ladeTarifkatalogAktuell, vorschlaegeErfassen } from "@/lib/tarif-vorschlaege-server";

/**
 * Vertreter oder Makler (Customer.vermittlerTyp; Mehrfachvertreter wie Vertreter) und Gesellschaft(en):
 * einmal gewählt (Customer.tarifGesellschaften), sonst aus der Erstinformation (Versicherer), sonst aus dem Namen
 * („Allianz Agentur …“). gesellschaftFehlt: Vertreter ohne erkennbare Gesellschaft (einmalige Auswahl).
 */
export async function vertriebFuer(customerId: string): Promise<{ vertrieb: Vertrieb; gesellschaftFehlt: boolean }> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, vermittlerTyp: true, tarifGesellschaften: true, erstinformation: { select: { versicherer: true } } },
  });
  const rolle = c?.vermittlerTyp === "makler" ? "makler" : "vertreter";
  let gesellschaften = c?.tarifGesellschaften ?? [];
  if (!gesellschaften.length && rolle === "vertreter") {
    const ausErstinfo = (c?.erstinformation?.versicherer ?? []).map(gesellschaftAusText).filter((g): g is string => !!g);
    gesellschaften = ausErstinfo.length ? ausErstinfo : [gesellschaftAusText(c?.name)].filter((g): g is string => !!g);
  }
  // Frühere Schlüssel („barmenia“, „gothaer“) auf den heutigen umstellen
  gesellschaften = sortiereGesellschaften(gesellschaften.map(gesellschaftSchluessel));
  return { vertrieb: { rolle, gesellschaften }, gesellschaftFehlt: rolle === "vertreter" && !gesellschaften.length };
}

/** Gesellschaft(en) einmalig wählen (Vertreter) bzw. bevorzugte merken (Makler). */
export async function gesellschaftenSpeichern(ctx: TeamCtx, keys: string[]): Promise<void> {
  const clean = sortiereGesellschaften(
    keys
      .map((k) => k.trim().toLowerCase())
      .filter((k) => /^[a-z0-9-]{2,40}$/.test(k))
      .map(gesellschaftSchluessel),
  ).slice(0, 12);
  await prisma.customer.update({ where: { id: ctx.customerId }, data: { tarifGesellschaften: clean } });
}

const userKey = (ctx: TeamCtx) => ctx.userId ?? "";

/** „Meine Merkmale“ je Sparte (eigene Zeile des Logins vor der des Inhabers). */
export async function meineAuswahl(ctx: TeamCtx): Promise<MeineAuswahl> {
  const rows = await prisma.beraterMerkmale.findMany({ where: { customerId: ctx.customerId, userKey: { in: [userKey(ctx), ""] } } });
  const out: MeineAuswahl = {};
  for (const r of rows.sort((a, b) => (a.userKey === userKey(ctx) ? 1 : 0) - (b.userKey === userKey(ctx) ? 1 : 0)))
    out[r.sparte] = { merkmale: r.merkmalKeys, bausteine: r.bausteinKeys };
  return out;
}

export type EigenerTarifZeile = EigenerTarifDaten & { sparte: string };

export async function eigeneTarife(customerId: string): Promise<EigenerTarifZeile[]> {
  const rows = await prisma.eigenerTarif.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, take: 200 });
  return rows.map((r) => ({
    id: r.id,
    sparte: r.sparte,
    gesellschaft: r.gesellschaft,
    name: r.name,
    kurz: r.kurz,
    werte: (r.werte && typeof r.werte === "object" && !Array.isArray(r.werte) ? r.werte : {}) as Record<string, string | null>,
  }));
}

/**
 * Eigenen Tarif anlegen (nur für diesen Kunden sichtbar). Werte nur für Merkmale der Sparte. Heißt er wie ein
 * Katalogtarif bzw. fehlt sein Name im Katalog der Gesellschaft: Vorschlag zum Katalog (lib/tarif-vorschlaege.ts).
 */
export async function eigenenTarifAnlegen(
  ctx: TeamCtx,
  raw: { sparte: string; gesellschaft: string; name: string; werte?: Record<string, string | null> },
  kat?: Katalog,
): Promise<EigenerTarifZeile | null> {
  const k = kat ?? (await ladeTarifkatalogAktuell());
  const sparte = String(raw.sparte ?? "").slice(0, 80);
  const gesellschaft = String(raw.gesellschaft ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const name = String(raw.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!sparte || !gesellschaft || !name) return null;
  const s = sparteVon(k, sparte);
  const erlaubt = new Set(s?.merkmale.map((m) => m.key) ?? Object.keys(raw.werte ?? {}));
  const werte: Record<string, string> = {};
  for (const [key, w] of Object.entries(raw.werte ?? {})) {
    const t = typeof w === "string" ? w.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    if (t && erlaubt.has(key)) werte[key] = t;
  }
  const r = await prisma.eigenerTarif.create({
    data: { customerId: ctx.customerId, userId: ctx.userId, sparte, gesellschaft, name, kurz: kurzName(name, s?.label), werte },
  });
  await vorschlaegeErfassen(ctx, vorschlaegeAusEigenemTarif(k, { sparte, gesellschaft, name, werte }), "vorbereitung");
  return { id: r.id, sparte, gesellschaft, name, kurz: r.kurz, werte };
}

export type TarifVorbereitung = {
  auswahl: Tarifauswahl;
  /** gespeichert | angebote (ältere Angebote, noch nicht übernommen) | neu (Vorauswahl, noch nicht gespeichert) */
  quelle: "gespeichert" | "angebote" | "neu";
  katalog: Katalog;
  vertrieb: Vertrieb;
  gesellschaftFehlt: boolean;
  /** Gesellschaften im Katalog (Auswahl für Makler bzw. einmalige Auswahl für Vertreter) */
  gesellschaften: { key: string; name: string }[];
  eigene: EigenerTarifZeile[];
  meine: MeineAuswahl;
  klaerenErledigt: string[];
  /** Schutz-Überblick eben vorgeschlagen (noch nicht gespeichert): die Seite speichert ihn gleich mit */
  schutzNeu: boolean;
  /**
   * Bisheriger Vertrag aus Police bzw. Chat neu übernommen bzw. aktualisiert, oder von Vermittlern bestätigte
   * Katalogwerte eingespielt: die Seite speichert gleich mit
   */
  bisherNeu: boolean;
  /** Gesundheitssparten freigeschaltet (bisheriger Vertrag dort erst danach) */
  gesundheitFrei: boolean;
};

/** Alles für den Angebote-Teil der Seite; null, wenn der Termin nicht sichtbar ist. */
export async function ladeTarifvorbereitung(appointmentId: string, ctx: TeamCtx, d: VorbereitungDaten, kat?: Katalog): Promise<TarifVorbereitung | null> {
  // Katalog mit den übernommenen Vorschlägen der Vermittler (lib/tarif-vorschlaege-server.ts)
  const k = kat ?? (await ladeTarifkatalogAktuell());
  const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, ...appointmentScope(ctx) }, select: { tarifauswahl: true, offersJson: true, klaerenErledigt: true, leadId: true } });
  if (!appt) return null;
  const [{ vertrieb, gesellschaftFehlt }, meine, eigene] = await Promise.all([vertriebFuer(ctx.customerId), meineAuswahl(ctx), eigeneTarife(ctx.customerId)]);
  let auswahl = cleanTarifauswahl(appt.tarifauswahl);
  let quelle: TarifVorbereitung["quelle"] = "gespeichert";
  if (!auswahl) {
    const alt = cleanAngebote(appt.offersJson);
    if (alt.items.length) {
      auswahl = ausAltenAngeboten(alt, k);
      quelle = "angebote";
    } else {
      auswahl = startAuswahl(k, spartenFuerTermin(d, k), vertrieb, meine);
      quelle = "neu";
    }
  }
  // Schutz im Überblick (Cross-Selling, Ole 16.11.2026): Vorschlag aus Formular, Chat und Verträgen bei uns, bis der
  // Vermittler etwas ändert. Ältere ausgelesene Angebote bleiben unberührt (kein Überblick, keine neue Folie).
  let schutzNeu = false;
  if (!auswahl.schutz && quelle !== "angebote") {
    const [vertraege, kunde] = await Promise.all([
      appt.leadId ? prisma.leadContract.findMany({ where: { leadId: appt.leadId, customerId: ctx.customerId, status: "aktiv" }, select: { sparte: true, signedAt: true } }) : [],
      prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { leadAddress: true } }),
    ]);
    auswahl = { ...auswahl, schutz: schutzVorschlag(d, { angebot: auswahl.sparten.map((s) => s.key), vertraege: vertraege.map((v) => ({ sparte: v.sparte, seit: v.signedAt })) }, asAnsprache(kunde?.leadAddress)) };
    schutzNeu = true;
  }
  // Bisheriger Vertrag (Paket P3b): aus Police bzw. Chat vorschlagen, von Hand Eingetragenes bleibt
  const [quellen, frei] = await Promise.all([bisherQuellen(appt.leadId, ctx.customerId), gesundheitFrei(ctx.customerId)]);
  const ab = bisherAbgleichen(auswahl.sparten, (sp) => bisherVorschlag(sp, quellen, k), frei);
  if (ab.geaendert) auswahl = { ...auswahl, sparten: ab.sparten };
  // Eingabe in „Was hat … schon?“ (Ja, woanders) gewinnt über Chat und Police (Ole, 18.11.2026)
  const hs = bisherAusSchutz(auswahl.sparten, auswahl.schutz, k, frei);
  if (hs.geaendert) auswahl = { ...auswahl, sparten: hs.sparten };
  // Von Vermittlern bestätigte Katalogwerte (übernommen im Admin) in gespeicherte Auswahlen bevorstehender Termine;
  // vergangene Präsentationen bleiben, wie sie waren
  let katalogNeu = false;
  if (quelle === "gespeichert" && d.termin.startsAt.getTime() > Date.now() - 12 * 3600_000) {
    const f = auswahlAuffrischen(auswahl, k);
    if (f.geaendert) [auswahl, katalogNeu] = [f.auswahl, true];
  }
  // Vertreter sehen nur die Tarife ihrer Gesellschaft(en)
  const tarife = vertrieb.rolle === "vertreter" ? k.tarife.filter((t) => vertrieb.gesellschaften.includes(t.gesellschaft)) : k.tarife;
  const gesellschaften = sortiereGesellschaften(k.tarife.map((t) => t.gesellschaft)).map((key) => ({ key, name: k.tarife.find((t) => t.gesellschaft === key)?.gesellschaftName ?? gesellschaftName(key) }));
  return { auswahl, quelle, katalog: { sparten: k.sparten, tarife, buendel: k.buendel }, vertrieb, gesellschaftFehlt, gesellschaften, eigene, meine, klaerenErledigt: appt.klaerenErledigt, schutzNeu, bisherNeu: ab.geaendert || hs.geaendert || katalogNeu, gesundheitFrei: frei };
}

/**
 * Autosave: Auswahl speichern, daraus die Angebote für die Präsentation (offersJson, gleich freigegeben: kein
 * Bestätigen-Knopf mehr, die Werte kommen aus dem Katalog) und „Meine Merkmale“ für den nächsten Termin.
 */
export async function tarifauswahlSpeichern(appointmentId: string, ctx: TeamCtx, raw: unknown): Promise<{ ok: true; auswahl: Tarifauswahl } | { ok: false; error: string }> {
  let roh = cleanTarifauswahl(raw);
  if (!roh) return { ok: false, error: "Ungültige Daten." };
  // Bisheriger Vertrag aus „Was hat … schon?“ (Ja, woanders): Eingabe des Vermittlers gewinnt über Chat und Police,
  // mit den Katalogwerten des gewählten Tarifs (ganzer Katalog, auch Gesellschaften außerhalb des eigenen Vertriebs)
  if (roh.sparten.some((sp) => schutzVonHand(roh!.schutz?.find((x) => x.key === sp.key)))) {
    const hs = bisherAusSchutz(roh.sparten, roh.schutz, await ladeTarifkatalogAktuell(), true);
    if (hs.geaendert) roh = { ...roh, sparten: hs.sparten };
  }
  // Gesundheitssparten: bisheriger Vertrag erst nach Freischaltung (auch von Hand nicht)
  const a = await bisherPruefen(roh, ctx.customerId);
  // Kombi-Rabatt: Bündelregeln aus dem Katalog als Schnappschuss mit den Angeboten (Präsentation rechnet damit)
  const datei = ladeTarifkatalog();
  const ang = zuAngebote(a, datei.buendel);
  const n = await prisma.appointment.updateMany({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    data: {
      tarifauswahl: a as unknown as Prisma.InputJsonValue,
      offersJson: ang as unknown as Prisma.InputJsonValue,
      offersConfirmedAt: ang.items.length ? new Date() : null,
    },
  });
  if (!n.count) return { ok: false, error: "Termin nicht gefunden." };
  // Bisheriger Vertrag mit „Anderer Tarif“ einer Katalog-Gesellschaft: Tarifname als Vorschlag (nur Katalogbezug)
  await vorschlaegeErfassen(ctx, vorschlaegeAusBisher(datei, a.sparten), "bisheriger-vertrag");
  for (const sp of a.sparten) {
    if (!sp.merkmale.length && !sp.bausteine.length) continue;
    await prisma.beraterMerkmale.upsert({
      where: { customerId_userKey_sparte: { customerId: ctx.customerId, userKey: userKey(ctx), sparte: sp.key } },
      create: { customerId: ctx.customerId, userKey: userKey(ctx), sparte: sp.key, merkmalKeys: sp.merkmale, bausteinKeys: sp.bausteine },
      update: { merkmalKeys: sp.merkmale, bausteinKeys: sp.bausteine },
    });
  }
  return { ok: true, auswahl: a };
}

/** Sparten mit Beiträgen, die noch ein Richtwert sind (Hinweis auf der Präsentationsseite). */
export async function ungepruefteSparten(appointmentId: string, ctx: TeamCtx): Promise<string[]> {
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, ...appointmentScope(ctx) }, select: { tarifauswahl: true } }).catch(() => null);
  const t = a ? cleanTarifauswahl(a.tarifauswahl) : null;
  return t ? [...new Set(ungepruefteBeitraege(t).map((u) => u.label))] : [];
}

/** „Noch klären im Termin“: abgehakte Punkte speichern. */
export async function klaerenSpeichern(appointmentId: string, ctx: TeamCtx, erledigt: string[]): Promise<boolean> {
  const clean = [...new Set(erledigt.filter((x) => typeof x === "string").map((x) => x.slice(0, 200)))].slice(0, 30);
  const n = await prisma.appointment.updateMany({ where: { id: appointmentId, ...appointmentScope(ctx) }, data: { klaerenErledigt: clean } });
  return n.count > 0;
}

/**
 * Angebot ablegen: die KI liest die hochgeladenen Angebote des Kontakts (bestehender Weg, lib/angebote.ts) und
 * übernimmt nur Beiträge und Bausteinpreise in leere Felder der gewählten Tarife; danach wird gespeichert.
 */
export async function preiseAuslesen(
  appointmentId: string,
  ctx: TeamCtx,
  raw: unknown,
): Promise<{ ok: true; auswahl: Tarifauswahl; anzahl: number; sparten: string[] } | { ok: false; error: string }> {
  const aktuell = cleanTarifauswahl(raw);
  if (!aktuell) return { ok: false, error: "Ungültige Daten." };
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, ...appointmentScope(ctx) }, select: { leadId: true, lead: { select: { source: true } } } });
  if (!a?.leadId) return { ok: false, error: "Termin nicht gefunden." };
  if (!(await angeboteAuslesenErlaubt(ctx.customerId, a.lead?.source)))
    return { ok: false, error: "Gespeichert. Für dieses Produkt lesen wir Angebote nicht automatisch aus, bitte Beiträge eintragen." };
  const files = await prisma.leadFile.findMany({ where: { leadId: a.leadId, kind: "angebot" }, orderBy: { createdAt: "desc" }, take: 5, select: { fileName: true, contentType: true, data: true } });
  const res = await angeboteAuslesen(
    files.map((f) => ({ fileName: f.fileName, contentType: f.contentType, data: new Uint8Array(f.data) })),
    { customerId: ctx.customerId, appointmentId, userId: ctx.userId, weg: "tarifauswahl" },
  );
  // Fehler oder Gesundheitssparte erkannt: keine Preise übernehmen, nichts speichern
  if ("error" in res) return { ok: false, error: res.error };
  // Pilot „Beiträge rechnen“ (docs/preise-pilot.md): Beiträge freigeschalteter Sparten sind ein Richtwert, bis der Vermittler bestätigt
  const pilot = await ladePreisPilot();
  const r = preiseUebernehmen(aktuell, res.items, { pruefen: (sparte, ges) => rechnerUrl(pilot, ges, sparte) != null });
  const s = await tarifauswahlSpeichern(appointmentId, ctx, r.auswahl);
  if (!s.ok) return s;
  return { ok: true, auswahl: s.auswahl, anzahl: r.anzahl, sparten: r.sparten };
}
