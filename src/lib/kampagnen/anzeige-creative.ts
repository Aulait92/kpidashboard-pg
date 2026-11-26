// Ops-Creatives für pausierte Meta-Anzeigen (Ole, 26.11.2026, CL Capital Living / Tierfairgleich: „Die KI-Bilder sind
// nicht gut“). Reine Teile ohne Server-Abhängigkeiten: Sicherheitsnetz, link_data-Aufbau, Textprüfung und die drei
// HTML-Vorlagen (1080 × 1080) für echtes Foto plus Text-Overlay. Server-Teil: anzeige-creative-server.ts.

import { ohneGedankenstriche } from "@/lib/gedankenstriche";

export const LAYOUTS = ["frage", "balken", "leo", "ohne"] as const;
export type Layout = (typeof LAYOUTS)[number];

export type CreativeTexte = {
  /** Große Frage oben (Layout „frage“) bzw. Titel („leo“, z. B. „Das ist Leo.“) */
  titel?: string;
  /** Sprechblase unter der Frage (Layout „frage“) */
  sprechblase?: string;
  /** Runder Badge (Layout „frage“) */
  badge?: string;
  /** Nutzenleiste unten (Layout „frage“), 4 Punkte */
  nutzen?: string[];
  /** Balken unten (Layout „balken“) */
  balken?: string;
  /** Kleine Sprechblasen um das Tier (Layout „leo“), 3 bis 4 */
  blasen?: string[];
};

export const STANDARD_TEXTE: Record<Layout, CreativeTexte> = {
  frage: {
    titel: "2.500 € Tierarztkosten?",
    sprechblase: "Das geht schneller als man denkt, z. B. bei einer Zahnbehandlung.",
    badge: "Jetzt Schutz prüfen",
    nutzen: ["Umfassender Schutz", "Freie Tierarztwahl", "Persönliche Beratung", "Kostenfrei vergleichen"],
  },
  balken: { balken: "Schütze dich vor hohen Tierarztkosten!" },
  leo: { titel: "Das ist Leo.", blasen: ["Rundum gut abgesichert", "Kleiner Abenteurer", "Tarif vom Makler verglichen", "Jederzeit erreichbar"] },
  ohne: {},
};

/** Foto-Ideen je Layout (Suche bei Pexels/Unsplash bzw. Bild-Brief für die KI), angelehnt an Oles Beispiele. */
export const STANDARD_FOTO: Record<Layout, { suche: string; brief: string }> = {
  frage: {
    suche: "two kittens paper bag",
    brief: "Close-up photo of two cute kittens peeking out of a brown paper bag, looking straight into the camera, warm natural window light, cozy home, soft background",
  },
  balken: {
    suche: "maine coon cat grass",
    brief: "Majestic Maine Coon cat lying on a green summer meadow, looking into the camera, golden hour sunlight, shallow depth of field",
  },
  leo: {
    suche: "curious tabby cat",
    brief: "Curious young tabby cat looking up into the camera with big eyes, close-up portrait, bright natural daylight, light neutral home background",
  },
  ohne: {
    suche: "ginger white cat sunlight",
    brief: "Red and white cat sitting in warm sunlight by a window, looking into the camera, natural light, calm cozy mood",
  },
};

// Keine Zusagen, Prozente, Sterne, Siegel (Ole, 26.11.2026; AGENTS.md: nie „Garantie“, keine Versprechen)
const VERBOTEN: [RegExp, string][] = [
  [/garant/i, "„Garantie“"],
  [/zahlt\s+immer|immer\s+bezahlt|übernimmt\s+(immer|alles)|100\s*%/i, "Leistungszusage"],
  [/\d\s*%|prozent/i, "Prozentangabe"],
  [/[★☆⭐]|\bsterne?\b|testsieger|siegel|bewertung|\bnote\s+\d/i, "Bewertung/Siegel"],
];

/** Text bereinigen (Gedankenstriche) und auf verbotene Aussagen prüfen. */
export function pruefeText(t: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = ohneGedankenstriche(t.replace(/\s+/g, " ").trim());
  for (const [re, was] of VERBOTEN) if (re.test(text)) return { ok: false, error: `Nicht erlaubt (${was}): ${text.slice(0, 80)}` };
  return { ok: true, text };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const liste = (v: unknown, max: number, n: number) =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, n) : typeof v === "string" && v.trim() ? v.split("|").map((x) => x.trim().slice(0, max)).filter(Boolean).slice(0, n) : undefined;

/** Texte für ein Layout: Standard, überschrieben durch Eingaben; alles geprüft. */
export function texteFuer(layout: Layout, eingabe: Record<string, unknown> = {}): { ok: true; texte: CreativeTexte } | { ok: false; error: string } {
  const basis = STANDARD_TEXTE[layout];
  const roh: CreativeTexte = {
    titel: str(eingabe.titel, 60) || basis.titel,
    sprechblase: str(eingabe.sprechblase, 110) || basis.sprechblase,
    badge: str(eingabe.badge, 30) || basis.badge,
    nutzen: liste(eingabe.nutzen, 28, 4) ?? basis.nutzen,
    balken: str(eingabe.balken, 70) || basis.balken,
    blasen: liste(eingabe.blasen, 32, 4) ?? basis.blasen,
  };
  const out: CreativeTexte = {};
  for (const k of ["titel", "sprechblase", "badge", "balken"] as const) {
    const v = roh[k];
    if (!v) continue;
    const r = pruefeText(v);
    if (!r.ok) return r;
    out[k] = r.text;
  }
  for (const k of ["nutzen", "blasen"] as const) {
    const v = roh[k];
    if (!v) continue;
    const geprueft: string[] = [];
    for (const x of v) {
      const r = pruefeText(x);
      if (!r.ok) return r;
      geprueft.push(r.text);
    }
    out[k] = geprueft;
  }
  return { ok: true, texte: out };
}

// ─── Sicherheitsnetz und Meta-Payload ────────────────────────────────

export type AnzeigeInfo = { account_id: string; status: string; name: string; creative?: { id: string } };

/** Nur pausierte Anzeigen im Werbekonto des Kunden, mit Creative. */
export function pruefeAnzeige(ad: AnzeigeInfo, act: string): { ok: true; creativeId: string } | { ok: false; error: string } {
  const konto = act.startsWith("act_") ? act : `act_${act}`;
  if (`act_${String(ad.account_id).replace(/^act_/, "")}` !== konto) return { ok: false, error: "Anzeige gehört nicht zum Werbekonto des Kunden." };
  if (ad.status !== "PAUSED") return { ok: false, error: `Anzeige ist nicht pausiert (${ad.status}).` };
  if (!ad.creative?.id) return { ok: false, error: "Anzeige ohne Creative." };
  return { ok: true, creativeId: ad.creative.id };
}

export type LinkDataAenderung = {
  /** Ergebnis von bildFuerAnzeige: Bild-Hash oder „url:…“ */
  bildRef?: string;
  message?: string;
  headline?: string;
  description?: string;
  formId?: string;
};

/**
 * Neues link_data, nur aus Feldern, die Meta beim Anlegen annimmt (Live-Fehler 1443051 „ObjectStorySpec“, 26.11.2026:
 * das GET liefert u. a. picture/image_url zusätzlich zum image_hash): image_hash bzw. picture, link, message, name,
 * description, call_to_action {type, value: {lead_gen_form_id}}. Geändertes wird ersetzt, der Rest bleibt.
 * altHash: image_hash des Creatives selbst, falls link_data keinen hat.
 */
export function neuesLinkData(alt: Record<string, unknown>, a: LinkDataAenderung, altHash?: string): Record<string, unknown> {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const ld: Record<string, unknown> = {};
  const ref = a.bildRef ?? (s(alt.image_hash) ?? s(altHash) ?? (s(alt.picture) ? `url:${alt.picture as string}` : undefined));
  if (ref) {
    if (ref.startsWith("url:")) ld.picture = ref.slice(4);
    else ld.image_hash = ref;
  }
  for (const [k, v] of [["link", s(alt.link)], ["message", a.message || s(alt.message)], ["name", a.headline || s(alt.name)], ["description", a.description || s(alt.description)]] as const) {
    if (v) ld[k] = v;
  }
  const cta = (alt.call_to_action ?? {}) as { type?: string; value?: { lead_gen_form_id?: unknown } };
  const formId = a.formId || s(cta.value?.lead_gen_form_id);
  if (formId || cta.type) ld.call_to_action = { type: cta.type ?? "SIGN_UP", ...(formId ? { value: { lead_gen_form_id: formId } } : {}) };
  return ld;
}

/** Öffentliche Bild-Adresse: nur https, nie Meta (keine Bilder aus fremden Anzeigen). */
export function bildUrlErlaubt(raw: string, gesperrt: string[]): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return !gesperrt.some((h) => host === h || host.endsWith(`.${h}`));
}

// ─── HTML-Vorlagen (1080 × 1080, Handy: große Schrift, starke Kontraste) ─────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ICONS = [
  // Schild mit Haken
  '<path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 12l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  // Stethoskop
  '<path d="M6 3v6a5 5 0 0010 0V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M11 14v2a5 5 0 0010 0v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="21" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/>',
  // Person mit Sprechblase
  '<circle cx="9" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 21c0-4 3.1-6.5 7-6.5s7 2.5 7 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M15 3h7v5h-4l-3 2V3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  // Waage
  '<path d="M12 3v18M7 21h10M4 7h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 7l-3 6a3 3 0 006 0L4 7zM20 7l-3 6a3 3 0 006 0l-3-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
];
const HAKEN = '<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M7 12.5l3.2 3L17 8.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PFOTE =
  '<svg viewBox="0 0 24 24" width="26" height="26"><g fill="currentColor"><ellipse cx="6" cy="9" rx="2.2" ry="2.8"/><ellipse cx="10" cy="5.5" rx="2.2" ry="2.8"/><ellipse cx="14.5" cy="5.5" rx="2.2" ry="2.8"/><ellipse cx="18.5" cy="9" rx="2.2" ry="2.8"/><path d="M12 11c-3.5 0-6.5 4-6.5 6.5 0 2 1.6 3 3.3 3 1.3 0 2-.6 3.2-.6s1.9.6 3.2.6c1.7 0 3.3-1 3.3-3C18.5 15 15.5 11 12 11z"/></g></svg>';

export type VorlageEingabe = {
  layout: Layout;
  /** data:-URL oder erlaubte https-Adresse des Fotos */
  fotoSrc: string;
  texte: CreativeTexte;
  /** Marke, dezent (z. B. „Tierfairgleich“) */
  marke?: string;
  /** Akzentfarbe (Hex) */
  farbe?: string;
  /** CSS object-position des Fotos, z. B. „50% 30%“ */
  fotoPosition?: string;
};

const farbeOk = (f?: string) => (f && /^#[0-9a-f]{6}$/i.test(f) ? f : "#E8742A");
const posOk = (p?: string) => (p && /^\d{1,3}% \d{1,3}%$/.test(p) ? p : "50% 40%");

/** HTML für das Creative (Playwright rendert 1080 × 1080). */
export function creativeHtml(e: VorlageEingabe): string {
  const farbe = farbeOk(e.farbe);
  const t = e.texte;
  const marke = e.marke ? `<div class="marke">${PFOTE}<span>${esc(e.marke)}</span></div>` : "";
  let inhalt = "";
  if (e.layout === "frage") {
    const nutzen = (t.nutzen ?? []).map((n, i) => `<div class="n"><svg viewBox="0 0 24 24" width="54" height="54">${ICONS[i % ICONS.length]}</svg><span>${esc(n)}</span></div>`).join("");
    inhalt = `
      <div class="oben-verlauf"></div>
      <h1 class="frage">${esc(t.titel ?? "")}</h1>
      ${t.sprechblase ? `<div class="blase-gross">${esc(t.sprechblase)}</div>` : ""}
      ${t.badge ? `<div class="badge"><span>${esc(t.badge)}</span></div>` : ""}
      ${marke.replace('class="marke"', 'class="marke marke-ueber-leiste"')}
      ${nutzen ? `<div class="leiste">${nutzen}</div>` : ""}`;
  } else if (e.layout === "balken") {
    inhalt = `${marke.replace('class="marke"', 'class="marke marke-oben"')}<div class="balken"><span>${esc(t.balken ?? "")}</span></div>`;
  } else if (e.layout === "leo") {
    const plaetze = ["b1", "b2", "b3", "b4"];
    const blasen = (t.blasen ?? []).map((b, i) => `<div class="klein ${plaetze[i]}">${HAKEN}<span>${esc(b)}</span></div>`).join("");
    inhalt = `<div class="oben-verlauf"></div><h1 class="leo">${esc(t.titel ?? "")}</h1>${blasen}${marke.replace('class="marke"', 'class="marke marke-unten"')}`;
  } else {
    inhalt = marke.replace('class="marke"', 'class="marke marke-unten"');
  }
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1080px;overflow:hidden;background:#222}
body{font-family:Nunito,"Helvetica Neue",Arial,sans-serif;color:#1d2433;position:relative;--akzent:${farbe}}
.foto{position:absolute;inset:0;width:1080px;height:1080px;object-fit:cover;object-position:${posOk(e.fotoPosition)}}
.oben-verlauf{position:absolute;left:0;right:0;top:0;height:420px;background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,0))}
.frage{position:absolute;left:56px;right:56px;top:50px;font-size:94px;line-height:1.02;font-weight:900;color:#fff;letter-spacing:-1.5px;text-shadow:0 3px 18px rgba(0,0,0,.45)}
.blase-gross{position:absolute;left:56px;top:270px;max-width:620px;background:#fff;border-radius:34px;padding:26px 34px;font-size:38px;line-height:1.22;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.blase-gross:after{content:"";position:absolute;left:70px;bottom:-30px;border-width:32px 26px 0 0;border-style:solid;border-color:#fff transparent transparent transparent}
.badge{position:absolute;right:52px;top:430px;width:250px;height:250px;border-radius:50%;background:var(--akzent);color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;transform:rotate(-9deg);box-shadow:0 12px 30px rgba(0,0,0,.3);border:6px solid #fff}
.badge span{font-size:42px;line-height:1.08;font-weight:900;padding:0 26px}
.leiste{position:absolute;left:0;right:0;bottom:0;height:190px;background:rgba(255,255,255,.96);display:flex;align-items:center;justify-content:space-around;padding:0 18px}
.n{display:flex;flex-direction:column;align-items:center;gap:10px;width:250px;text-align:center;color:var(--akzent)}
.n span{color:#1d2433;font-size:29px;line-height:1.1;font-weight:800}
.marke{position:absolute;display:flex;align-items:center;gap:10px;padding:10px 20px;border-radius:999px;background:rgba(255,255,255,.88);color:var(--akzent);font-weight:900;font-size:30px;letter-spacing:.2px}
.marke span{color:#1d2433}
.marke-ueber-leiste{right:36px;bottom:212px}
.marke-oben{right:36px;top:36px}
.marke-unten{right:36px;bottom:36px}
.balken{position:absolute;left:0;right:0;bottom:0;min-height:230px;background:var(--akzent);display:flex;align-items:center;justify-content:center;padding:34px 64px;text-align:center}
.balken span{color:#fff;font-size:70px;line-height:1.08;font-weight:900;letter-spacing:-.5px}
.leo{position:absolute;left:56px;top:48px;font-size:104px;font-weight:900;color:#fff;letter-spacing:-1.5px;text-shadow:0 3px 18px rgba(0,0,0,.45)}
.klein{position:absolute;display:flex;align-items:center;gap:12px;background:#fff;border-radius:26px;padding:16px 24px;font-size:33px;line-height:1.15;font-weight:800;max-width:430px;box-shadow:0 8px 24px rgba(0,0,0,.22);color:#1d2433}
.klein svg{flex:none;color:var(--akzent)}
.klein:after{content:"";position:absolute;bottom:-20px;border-style:solid}
.b1{left:44px;top:330px}.b1:after{right:60px;border-width:22px 0 0 22px;border-color:#fff transparent transparent transparent}
.b2{right:44px;top:470px}.b2:after{left:60px;border-width:22px 22px 0 0;border-color:#fff transparent transparent transparent}
.b3{left:44px;top:700px}.b3:after{right:60px;border-width:22px 0 0 22px;border-color:#fff transparent transparent transparent}
.b4{right:44px;top:850px}.b4:after{left:60px;border-width:22px 22px 0 0;border-color:#fff transparent transparent transparent}
.b4~.marke-unten{bottom:auto;top:44px}
</style></head><body><img class="foto" src="${esc(e.fotoSrc)}" alt="">${inhalt}</body></html>`;
}
