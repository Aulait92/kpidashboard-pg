/**
 * AXA Agenturen & Betreuer – v2 Scraper.
 *
 * Nutzt die öffentliche agencySearch.json-API von axa-betreuer.de.
 * Pro API-Call maximal 100 Treffer → feines Lat/Lng-Grid (~15 km) über Deutschland
 * deckt alles ab. Dedupe per (id, ma_nr) = eine Zeile pro Person.
 *
 * Erwartung: ~3000 Betreuer, komplett mit email/phone/anrede/adresse.
 */

import { writeFileSync, mkdirSync } from "node:fs";

const API = "https://www.axa-betreuer.de/webservices/agencySearch.json";
const OUTPUT = "data/axa-agenturen.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Grid-Parameter
const DE_LAT_MIN = 47.27, DE_LAT_MAX = 55.06;
const DE_LNG_MIN = 5.87,  DE_LNG_MAX = 15.04;
const SPACING_KM = Number(process.env.SPACING_KM ?? 15);
const RANGE_KM = 25; // API range per point
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);

type Row = Record<string, any>;

async function fetchJson(url: string, retries = 3): Promise<any | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === retries) return null;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

function buildGrid(): { lat: number; lng: number }[] {
  // 1 Grad Latitude ~ 111 km, 1 Grad Longitude ~ 71 km @ 50°N
  const latStep = SPACING_KM / 111;
  const lngStep = SPACING_KM / 71;
  const points: { lat: number; lng: number }[] = [];
  for (let lat = DE_LAT_MIN; lat <= DE_LAT_MAX; lat += latStep) {
    for (let lng = DE_LNG_MIN; lng <= DE_LNG_MAX; lng += lngStep) {
      points.push({ lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 });
    }
  }
  return points;
}

function esc(v: string | number | undefined | null): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function joinPhone(vorwahl: string, nummer: string): string {
  const v = (vorwahl ?? "").toString().trim();
  const n = (nummer ?? "").toString().trim();
  if (!v && !n) return "";
  return `${v} ${n}`.trim();
}

async function main() {
  const grid = buildGrid();
  console.log(`AXA Scraper · grid=${grid.length} Punkte (spacing=${SPACING_KM}km) · concurrency=${CONCURRENCY}`);

  const byKey = new Map<string, Row>(); // key = `${id}|${ma_nr}|${email}` to be safe
  let done = 0;
  let totalRows = 0;
  const t0 = Date.now();

  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < grid.length) {
      const i = cursor++;
      const { lat, lng } = grid[i];
      const url = `${API}?lat=${lat}&lng=${lng}&range=${RANGE_KM}&minresults=100`;
      const j = await fetchJson(url);
      done++;
      const list: Row[] = j?.agencyDataList ?? [];
      totalRows += list.length;
      for (const row of list) {
        const key = `${row.id || ""}|${row.ma_nr || ""}|${(row.email || "").toLowerCase()}`;
        if (!byKey.has(key)) byKey.set(key, row);
      }
      if (done % 50 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = done / elapsed;
        const eta = (grid.length - done) / rate;
        console.log(`  ${done}/${grid.length} · unique=${byKey.size} · raw=${totalRows} · ${rate.toFixed(1)}/s · ETA ${eta.toFixed(0)}s`);
      }
    }
  });
  await Promise.all(workers);

  const rows = [...byKey.values()];
  console.log(`\n✓ ${rows.length} eindeutige Einträge (raw: ${totalRows})`);

  // Emit CSV
  const outRows = rows.map(r => ({
    salutation: r.ma_anrede || r.anrede || "",
    firstName: r.ma_vname || r.vname || "",
    lastName: r.ma_nname || r.nname || "",
    email: (r.email || "").toLowerCase(),
    phone: joinPhone(r.telvorwahl, r.telnummer),
    mobile: joinPhone(r.mobilvorwahl, r.mobilnummer),
    fax: joinPhone(r.faxvorwahl, r.faxnummer),
    agencyName: r.filialname || "",
    agencyId: r.id || "",
    maNr: r.ma_nr || "",
    function: r.funktion || "",
    street: `${r.strasse || ""} ${r.hnr || ""}`.trim(),
    zip: r.plz || "",
    city: r.ort || "",
    teilort: r.teilort || "",
    ekomiRating: r.ekomi_rating_average || "",
    ekomiCount: r.ekomi_rating_count || "",
    languages: r.languages || "",
    schwerpunkt: r.schwerpunkt || "",
    qualifikation: [r.qualifikation, r.qualifikation2, r.qualifikation3].filter(Boolean).join("; "),
    url: r.url ? (r.url.startsWith("http") ? r.url : `https://${r.url}`) : "",
    bookingUrl: r.bookingtime_link_url || "",
    lat: r.lat || "",
    lng: r.lng || "",
  }));

  // Sort by zip for predictability
  outRows.sort((a, b) => (a.zip || "").localeCompare(b.zip || "") || a.lastName.localeCompare(b.lastName));

  const headers = Object.keys(outRows[0] ?? {});
  const lines = [headers.join(",")];
  for (const r of outRows) {
    lines.push(headers.map(h => esc((r as any)[h])).join(","));
  }
  mkdirSync("data", { recursive: true });
  writeFileSync(OUTPUT, lines.join("\n") + "\n", "utf8");

  const withEmail = outRows.filter(r => r.email).length;
  const withPhone = outRows.filter(r => r.phone || r.mobile).length;
  const withName = outRows.filter(r => r.firstName || r.lastName).length;
  console.log(`\n  mit E-Mail: ${withEmail}`);
  console.log(`  mit Name:   ${withName}`);
  console.log(`  mit Tel:    ${withPhone}`);
  console.log(`  Output:     ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
