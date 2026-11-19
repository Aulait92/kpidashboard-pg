import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { classifyLegacy } from "@/lib/vertrieb/legacy";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/vertrieb/contact-merge";
import { detectInsurer } from "@/lib/vertrieb/contact-enrich";
import { ownEmailDomain } from "@/lib/vertrieb/dubletten";
import { emailGesperrt, geloeschteAdressen } from "@/lib/vertrieb/sperrliste";
import { mischen } from "@/lib/vertrieb/mischen";
import { LISTEN_GRUENDE, istVermittlerListe, type ListenErgebnis, type ListenGrund } from "@/lib/vertrieb/vermittler-format";

function parseGermanDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return new Date(Date.UTC(y, +m[2] - 1, +m[1], 9));
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

export type ImportStats = { rows: number; created: number; updated: number; withStatus: number; tasks: number; skipped: number };

/**
 * Importiert die Agenturliste (CSV-Export aus Numbers/Excel).
 * Spalten werden über die Kopfzeile erkannt. Die Status-Spalte ist die
 * Spalte "status" – oder, wie in der Original-Liste, die erste Spalte ohne
 * Überschrift nach "description"; die zweite ohne Überschrift ist das Datum.
 * Bestehende Kontakte (gleiche E-Mail) werden aktualisiert, ihre Pipeline
 * aber nicht überschrieben.
 */
export async function importContactsCsv(text: string): Promise<ImportStats> {
  // Die Vermittlerliste hat auch eine Spalte „email“, braucht aber die Prüfungen und die Vorschau (importVermittlerListe)
  if (istVermittlerListe(text)) throw new Error("Vermittlerliste erkannt: bitte über die Vorschau importieren.");
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  const [header, ...rows] = parsed.data;
  if (!header) throw new Error("Leere Datei");
  const h = header.map((x) => x.trim().toLowerCase());
  const idx = (n: string) => h.indexOf(n.toLowerCase());
  if (idx("email") < 0) throw new Error("Spalte 'email' nicht gefunden");

  let statusIdx = idx("status");
  let dateIdx = idx("datum");
  if (statusIdx < 0) {
    const blanks = h.map((x, i) => (x === "" ? i : -1)).filter((i) => i > idx("description"));
    statusIdx = blanks[0] ?? -1;
    if (dateIdx < 0) dateIdx = blanks[1] ?? -1;
  }

  const existing = new Map(
    (await prisma.salesContact.findMany({ select: { id: true, email: true, legacyStatus: true } })).map((c) => [c.email, c]),
  );
  const stats: ImportStats = { rows: rows.length, created: 0, updated: 0, withStatus: 0, tasks: 0, skipped: 0 };
  const now = new Date();
  const seen = new Set<string>();
  // Feste Sperrliste und auf Verlangen gelöschte Adressen (Art. 17, nur als Hash gespeichert) nie wieder anlegen
  const emailIdx = idx("email");
  const geloescht = await geloeschteAdressen(emailIdx >= 0 ? rows.map((r) => r[emailIdx]?.trim().toLowerCase()) : []);

  type Pending = { data: Prisma.SalesContactCreateInput; legacy?: { text: string; date: Date | null } };
  const toCreate: Pending[] = [];
  const toUpdate: { id: string; data: Prisma.SalesContactUpdateInput; legacy?: { text: string; date: Date | null } }[] = [];

  for (const r of rows) {
    const get = (f: string) => {
      const i = idx(f);
      const v = i >= 0 ? r[i]?.trim() : "";
      return v ? v : undefined;
    };
    const email = get("email")?.toLowerCase();
    if (!email || seen.has(email) || geloescht.has(email) || emailGesperrt(email)) {
      stats.skipped++;
      continue;
    }
    seen.add(email);
    // Nur Spalten übernehmen, die in der Datei vorkommen – sonst würden
    // vorhandene Werte beim Import einer anderen Liste geleert.
    const base: Record<string, string | number | null> = {};
    const set = (col: string, value: string | number | null) => {
      if (idx(col) >= 0) base[col] = value;
    };
    const int = (v: string | undefined) => {
      const n = num(v);
      return n == null ? null : Math.round(n);
    };
    base.name = get("name") ?? email;
    set("phone", get("phone") ?? null);
    set("fax", get("fax") ?? null);
    set("street", get("street") ?? null);
    set("zip", get("zip")?.replace(/\.0$/, "").padStart(5, "0") ?? null);
    set("city", get("city") ?? null);
    set("ratingValue", num(get("ratingValue")));
    set("ratingCount", int(get("ratingCount")));
    set("openingHours", get("openingHours") ?? null);
    set("url", get("url") ?? null);
    set("description", get("description") ?? null);
    set("salutation", get("salutation") ?? null);
    set("firstName", get("firstName") ?? null);
    set("lastName", get("lastName") ?? null);
    if (idx("leaderNames") >= 0) {
      const names = [...new Set((get("leaderNames") ?? "").split(";").map((x) => x.trim()).filter(Boolean))];
      base.leaderNames = names.length ? names.join(", ") : null;
    }
    set("agencyType", get("agencyType") ?? null);
    set("teamSize", int(get("teamSize")));
    set("potentialScore", int(get("potentialScore")));
    set("facebookUrl", get("facebookUrl") ?? null);
    set("instagramUrl", get("instagramUrl") ?? null);
    set("xingUrl", get("xingUrl") ?? null);
    set("linkedinUrl", get("linkedinUrl") ?? null);
    const statusText = statusIdx >= 0 ? r[statusIdx]?.trim() : "";
    const legacy = statusText ? { text: statusText, date: parseGermanDate(dateIdx >= 0 ? r[dateIdx] : undefined) } : undefined;
    const ex = existing.get(email);
    if (ex) {
      // Legacy-Status nur übernehmen, wenn er neu ist
      toUpdate.push({ id: ex.id, data: base as Prisma.SalesContactUpdateInput, legacy: legacy && ex.legacyStatus !== legacy.text ? legacy : undefined });
    } else {
      toCreate.push({ data: { ...(base as unknown as Omit<Prisma.SalesContactCreateInput, "email">), email }, legacy });
    }
  }

  // Neue Kontakte in Blöcken anlegen
  for (let i = 0; i < toCreate.length; i += 500) {
    const chunk = toCreate.slice(i, i + 500);
    await prisma.salesContact.createMany({ data: chunk.map((c) => c.data as Prisma.SalesContactCreateManyInput), skipDuplicates: true });
    stats.created += chunk.length;
  }
  for (let i = 0; i < toUpdate.length; i += 200) {
    await prisma.$transaction(toUpdate.slice(i, i + 200).map((u) => prisma.salesContact.update({ where: { id: u.id }, data: u.data })));
    stats.updated += Math.min(200, toUpdate.length - i);
  }

  // Legacy-Status → Stufe, Aktivität, Aufgabe
  const withLegacy = [
    ...toCreate.filter((c) => c.legacy).map((c) => ({ email: c.data.email, legacy: c.legacy! })),
    ...toUpdate.filter((u) => u.legacy).map((u) => ({ email: [...existing.values()].find((e) => e.id === u.id)!.email, legacy: u.legacy! })),
  ];
  const ids = new Map(
    (await prisma.salesContact.findMany({ where: { email: { in: withLegacy.map((w) => w.email) } }, select: { id: true, email: true } })).map((c) => [c.email, c.id]),
  );
  for (let i = 0; i < withLegacy.length; i += 100) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const w of withLegacy.slice(i, i + 100)) {
      const id = ids.get(w.email);
      if (!id) continue;
      const res = classifyLegacy(w.legacy.text, now);
      stats.withStatus++;
      ops.push(
        prisma.salesContact.update({
          where: { id },
          data: {
            legacyStatus: w.legacy.text,
            stage: res?.stage ?? undefined,
            customerStage: res?.stage === "GEWONNEN" ? "VERTRAG" : undefined,
            lossReason: res?.lossReason ?? null,
            competitor: res?.competitor ?? undefined,
            callAttempts: { increment: 1 },
            lastContactAt: w.legacy.date ?? undefined,
          },
        }),
        prisma.salesActivity.create({
          data: { contactId: id, type: "IMPORT", note: w.legacy.text, occurredAt: w.legacy.date ?? now },
        }),
      );
      if (res?.task) {
        stats.tasks++;
        ops.push(
          prisma.salesTask.create({
            data: { contactId: id, title: res.task.title, type: res.task.type, dueAt: res.task.dueAt, note: w.legacy.text },
          }),
        );
      }
    }
    await prisma.$transaction(ops);
  }
  return stats;
}

// ─── Öffentlich gesammelte Vermittlerliste (Ole, 19.11.2026) ────────────────────────────────────────────────────
// Semikolon-CSV mit Herkunft je Zeile (lib/vertrieb/vermittler-format.ts). Erst Trockenlauf (Vorschau mit Zahlen je
// Grund und Gesellschaft), dann Anlegen in Blöcken. Nie angelegt: ohne gültige E-Mail, nur vermutete E-Mail, doppelt
// in der Datei, feste Sperrliste, bestehende Kunden (Login-Adresse, verknüpfter Vertriebskontakt, gleiche eigene
// Domain), „nie kontaktieren“ bzw. abgemeldet oder hart gebounct (auch gleiche eigene Domain). Schon vorhandene
// Vertriebskontakte bekommen nur leere Felder ergänzt; Stufe und Status bleiben. Herkunft (Quelle, Gesellschaft, Typ,
// Quell-URL, Abrufdatum) steht in enrichment.import und als Verlaufseintrag am Kontakt (Art. 14 DSGVO, Widerspruch).
// Die Gesellschaft wird zum Merkmal „Versicherer“ (SalesContact.insurer): daran werden Instantly-Kampagnen je
// Gesellschaft gebildet; vor jedem Upload prüft vorUploadPruefen (lib/vertrieb/nie-kontaktieren-server.ts) erneut.

/** Ab so vielen Zeilen derselben Domain in der Datei ist die Domain ein Portal (tecis.de, telis-finanz.de …), keine eigene. */
export const GEMEINSAME_DOMAIN_AB = 5;
const BLOCK = 500;
const TITEL = /^(dr|prof|dipl|mag|ing|med|rer|nat|jur|oec|pol|h\.?c)\.?(-\S*)?$/i;
const NAMENSTEIL = new Set(["von", "van", "vom", "zu", "zum", "zur", "der", "den", "de", "del", "della", "di", "da", "dos", "du", "la", "le", "ten", "ter", "to", "op"]);

/** Ansprechpartner in Vor- und Nachname: Titel und „e. K.“ weg, bei mehreren Personen die erste. */
export function teileName(raw: string | null | undefined): { firstName: string | null; lastName: string | null } {
  let s = String(raw ?? "")
    .replace(/\s+e\.\s?K\.?$/i, "")
    .replace(/,?\s+(GmbH|UG|OHG|KG|AG|GbR)\b.*$/i, "")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return { firstName: null, lastName: null };
  // „Martin u. Gregor Schneider“, „Paul & Patrik Knieriem“, „Max Muster, Erika Beispiel“
  const teile = s.split(/\s*(?:,|&|\+|\/|\bund\b|\bu\.)\s*/i).filter(Boolean);
  const letzte = teile[teile.length - 1]?.split(" ") ?? [];
  s = teile[0] ?? s;
  const w = s.split(" ").filter((x) => !TITEL.test(x));
  if (!w.length) return { firstName: null, lastName: null };
  // Nur Vorname vor „und“: gemeinsamer Nachname steht am Ende
  if (w.length === 1 && teile.length > 1 && letzte.length > 1) return { firstName: w[0], lastName: letzte[letzte.length - 1] };
  if (w.length === 1) return { firstName: null, lastName: w[0] };
  let i = w.length - 1;
  while (i > 1 && NAMENSTEIL.has(w[i - 1].toLowerCase())) i--;
  return { firstName: w.slice(0, i).join(" "), lastName: w.slice(i).join(" ") };
}

/** Gesellschaft als Merkmal: bekannte Versicherer wie bei der Anreicherung („LVM“, „DVAG“), sonst Name ohne Rechtsform. */
export function gesellschaftName(raw: string | null | undefined): string | null {
  const ohneKlammer = String(raw ?? "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (!ohneKlammer) return null;
  const bekannt = detectInsurer(ohneKlammer);
  if (bekannt && bekannt !== "Makler") return bekannt;
  let s = ohneKlammer;
  for (let alt = ""; alt !== s; ) {
    alt = s;
    s = s.replace(/\s+(AG|SE|GmbH|KG|KGaA|VVaG|a\.\s?G\.|mbH|e\.\s?V\.)$/i, "").trim();
  }
  return s || ohneKlammer;
}

const datumDe = (iso: string | null) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

export type ListenZeile = {
  email: string | null;
  vermutet: boolean;
  gesellschaft: string | null;
  daten: {
    name: string;
    firstName: string | null;
    lastName: string | null;
    leaderNames: string | null;
    street: string | null;
    zip: string | null;
    city: string | null;
    phone: string | null;
    url: string | null;
    description: string | null;
    insurer: string | null;
  };
  herkunft: { liste: "vermittler"; quelle: string | null; gesellschaft: string | null; typ: string | null; emailQuelle: string | null; quelleUrl: string | null; abgerufenAm: string | null };
};

/** Eine Zeile der Liste auf SalesContact abbilden (rein, ohne Datenbank). */
export function listenZeile(r: Record<string, string | undefined>): ListenZeile {
  const v = (k: string) => {
    const x = r[k]?.trim();
    return x ? x : null;
  };
  const roh = normalizeEmail(v("email"));
  const email = roh && !/\.(invalid|local|example)$/.test(roh) ? roh : null;
  const name = teileName(v("ansprechpartner"));
  const website = v("website");
  const zip = v("plz")?.replace(/\.0$/, "") ?? null;
  const gesellschaft = gesellschaftName(v("gesellschaft"));
  return {
    email,
    vermutet: !!v("email_muster_vermutet"),
    gesellschaft,
    daten: {
      name: v("firma") ?? v("ansprechpartner") ?? email ?? "",
      firstName: name.firstName,
      lastName: name.lastName,
      leaderNames: v("ansprechpartner"),
      street: v("strasse"),
      zip: zip && /^\d{4,5}$/.test(zip) ? zip.padStart(5, "0") : zip,
      city: v("ort"),
      phone: v("telefon"),
      url: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
      description: v("typ"),
      insurer: gesellschaft,
    },
    herkunft: {
      liste: "vermittler",
      quelle: v("quelle"),
      gesellschaft: v("gesellschaft"),
      typ: v("typ"),
      emailQuelle: v("email_quelle"),
      quelleUrl: v("quelle_url"),
      abgerufenAm: v("abgerufen_am"),
    },
  };
}

/** Verlaufseintrag mit der Herkunft (Auskunft nach Art. 14/15 DSGVO, Widerspruch). */
export function herkunftNotiz(h: ListenZeile["herkunft"], ergaenzt = false): string {
  const quelle = [h.emailQuelle, h.quelleUrl].filter(Boolean).join(", ");
  const teile = [h.gesellschaft, quelle ? `Quelle: ${quelle}` : null, h.abgerufenAm ? `abgerufen am ${datumDe(h.abgerufenAm)}` : null].filter(Boolean);
  return `${ergaenzt ? "Leere Felder aus öffentlicher Vermittlerliste ergänzt" : "Aus öffentlicher Vermittlerliste übernommen"}${teile.length ? ` (${teile.join("; ")})` : ""}.`;
}

const ERGAENZBAR = ["firstName", "lastName", "leaderNames", "street", "zip", "city", "phone", "url", "description", "insurer"] as const;

/**
 * Vermittlerliste prüfen (Vorschau, Standard) bzw. mit anwenden: true importieren. Liest Vertriebskontakte, Logins und
 * Abmeldungen einmal, prüft im Speicher und legt neue Kontakte in Blöcken zu 500 an (30.000 Zeilen in Sekunden).
 */
export async function importVermittlerListe(text: string, opts: { anwenden?: boolean; now?: Date } = {}): Promise<ListenErgebnis> {
  const start = Date.now();
  const now = opts.now ?? new Date();
  if (!istVermittlerListe(text)) throw new Error("Keine Vermittlerliste (Kopfzeile mit quelle;gesellschaft;…;email;… erwartet).");
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    delimiter: ";",
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const zeilen = parsed.data.map(listenZeile);

  const geloescht = await geloeschteAdressen(zeilen.map((z) => z.email));
  const [kontakte, gesperrteLeads, logins] = await Promise.all([
    prisma.salesContact.findMany({
      select: {
        id: true, email: true, altEmails: true, name: true, nieKontaktierenAt: true, customerId: true, customerStage: true,
        firstName: true, lastName: true, leaderNames: true, street: true, zip: true, city: true, phone: true, url: true, description: true, insurer: true,
      },
    }),
    prisma.salesCampaignLead.findMany({ where: { OR: [{ unsubscribed: true }, { bounced: true }] }, select: { contactId: true } }),
    prisma.user.findMany({ select: { email: true } }),
  ]);
  type Kontakt = (typeof kontakte)[number];
  const abgemeldet = new Set(gesperrteLeads.map((l) => l.contactId));
  const istKunde = (k: Kontakt) => !!k.customerId || !!k.customerStage;
  const istGesperrt = (k: Kontakt) => !!k.nieKontaktierenAt || abgemeldet.has(k.id);
  const adressen = (k: Kontakt) => [k.email, ...k.altEmails].map((e) => e.trim().toLowerCase());

  // Haupt- vor weiterer Adresse
  const nachEmail = new Map<string, Kontakt>();
  for (const k of kontakte) for (const a of k.altEmails) nachEmail.set(a.trim().toLowerCase(), k);
  for (const k of kontakte) nachEmail.set(k.email.trim().toLowerCase(), k);

  // Domain-Abgleich nur bei eigener Domain (nicht Freemail, nicht Konzern) und nur, wenn sie in der Datei selten ist
  const domainZahl = new Map<string, number>();
  for (const z of zeilen) {
    const d = z.email?.split("@")[1];
    if (d) domainZahl.set(d, (domainZahl.get(d) ?? 0) + 1);
  }
  const eigeneDomain = (email: string) => {
    const d = ownEmailDomain(email);
    return d && (domainZahl.get(d) ?? 0) < GEMEINSAME_DOMAIN_AB ? d : null;
  };
  const loginAdressen = new Set(logins.map((u) => u.email.trim().toLowerCase()));
  const kundenDomains = new Set<string>();
  const sperrDomains = new Set<string>();
  for (const e of loginAdressen) {
    const d = ownEmailDomain(e);
    if (d) kundenDomains.add(d);
  }
  for (const k of kontakte) {
    const ziel = istKunde(k) ? kundenDomains : istGesperrt(k) ? sperrDomains : null;
    if (!ziel) continue;
    for (const a of adressen(k)) {
      const d = ownEmailDomain(a);
      if (d) ziel.add(d);
    }
  }

  const uebersprungen = Object.fromEntries(LISTEN_GRUENDE.map((g) => [g, 0])) as Record<ListenGrund, number>;
  const jeGesellschaft = new Map<string, { zeilen: number; neu: number }>();
  const gesehen = new Set<string>();
  const neu: ListenZeile[] = [];
  const ergaenzen: { id: string; data: Prisma.SalesContactUpdateInput; zeile: ListenZeile }[] = [];

  const pruefen = (z: ListenZeile): ListenGrund | null => {
    if (!z.email) return "ohne_email";
    if (z.vermutet) return "vermutet";
    if (gesehen.has(z.email)) return "doppelt";
    gesehen.add(z.email);
    if (emailGesperrt(z.email)) return "sperrliste";
    // Auf Verlangen gelöscht (Art. 17): Sperrvermerk nur als Hash
    if (geloescht.has(z.email)) return "nie_kontaktieren";
    const k = nachEmail.get(z.email);
    const d = eigeneDomain(z.email);
    if (loginAdressen.has(z.email) || (k && istKunde(k)) || (d && kundenDomains.has(d))) return "kunde";
    if ((k && istGesperrt(k)) || (d && sperrDomains.has(d))) return "nie_kontaktieren";
    if (!k) return null;
    // Schon im Vertrieb: nur leere Felder ergänzen, Stufe und Status bleiben
    const data: Record<string, string> = {};
    for (const f of ERGAENZBAR) {
      const wert = z.daten[f];
      if (wert && !k[f]?.trim()) data[f] = wert;
    }
    const nameLeer = !k.name.trim() || k.name.trim().toLowerCase() === k.email.trim().toLowerCase();
    if (nameLeer && z.daten.name && z.daten.name !== z.email) data.name = z.daten.name;
    if (Object.keys(data).length) ergaenzen.push({ id: k.id, data, zeile: z });
    return "vorhanden";
  };

  for (const z of zeilen) {
    const g = z.gesellschaft ?? "ohne Angabe";
    const stat = jeGesellschaft.get(g) ?? { zeilen: 0, neu: 0 };
    jeGesellschaft.set(g, stat);
    stat.zeilen++;
    const grund = pruefen(z);
    if (grund) {
      uebersprungen[grund]++;
      continue;
    }
    stat.neu++;
    neu.push(z);
  }

  let angelegtZahl = 0;
  if (opts.anwenden) {
    // Gemischt speichern (Reißverschluss nach Gesellschaft, darin nach Mail-Domain) und createdAt je Zeile um 1 ms
    // versetzt: wer später nach createdAt liest (Instantly-Portion, Exporte), bekommt die Liste schon gemischt.
    const gemischt = mischen(neu, (z) => z.gesellschaft, (z) => z.email);
    const ab = now.getTime() - gemischt.length;
    // Die Liste bringt Adresse und Telefon mit: nicht automatisch anreichern. Sonst stünden zehntausende Kontakte vor
    // neuen Leads in der Warteschlange der Website- und Google-Anreicherung (lib/vertrieb/contact-enrich.ts).
    for (let i = 0; i < gemischt.length; i += BLOCK) {
      const block = gemischt.slice(i, i + BLOCK);
      const nachAdresse = new Map(block.map((z) => [z.email!, z]));
      await prisma.$transaction(
        async (tx) => {
          const angelegt = await tx.salesContact.createManyAndReturn({
            data: block.map((z, j) => ({
              ...z.daten,
              email: z.email!,
              createdAt: new Date(ab + i + j),
              enrichment: { import: { ...z.herkunft, importiertAm: now.toISOString() } },
              webEnrichAt: now,
              googleCheckedAt: now,
              addressEnrichTriedAt: now,
            })),
            skipDuplicates: true,
            select: { id: true, email: true },
          });
          angelegtZahl += angelegt.length;
          await tx.salesActivity.createMany({
            data: angelegt.map((c) => ({ contactId: c.id, type: "IMPORT" as const, note: herkunftNotiz(nachAdresse.get(c.email)!.herkunft), occurredAt: now })),
          });
        },
        { timeout: 60_000 },
      );
    }
    for (let i = 0; i < ergaenzen.length; i += 200) {
      const block = ergaenzen.slice(i, i + 200);
      await prisma.$transaction([
        ...block.map((u) => prisma.salesContact.update({ where: { id: u.id }, data: u.data })),
        prisma.salesActivity.createMany({ data: block.map((u) => ({ contactId: u.id, type: "IMPORT" as const, note: herkunftNotiz(u.zeile.herkunft, true), occurredAt: now })) }),
      ]);
    }
  }

  return {
    angewendet: !!opts.anwenden,
    zeilen: zeilen.length,
    // Angewendet: tatsächlich angelegt (gleichzeitig anderswo angelegte Adressen fallen weg)
    neu: opts.anwenden ? angelegtZahl : neu.length,
    ergaenzt: ergaenzen.length,
    uebersprungen,
    jeGesellschaft: [...jeGesellschaft.entries()]
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.neu - a.neu || b.zeilen - a.zeilen || a.name.localeCompare(b.name, "de")),
    dauerMs: Date.now() - start,
  };
}
