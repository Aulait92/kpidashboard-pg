// Flow JSON „Unterlagen senden“ (bis 22.11.2026 „Policen senden“; Policen-Strecke v2) und eine Prüfung gegen die bekannten Regeln von Meta. Rein.
//
// Ein Flow je WhatsApp-Konto (WABA), alle Varianten (Sie/Du, mit/ohne Gesundheitssatz, KI-Satz) über dynamische Daten
// (${data.…}), die die Nachricht beim Öffnen mitgibt (flow_action navigate, flow_action_payload.data). Kein Endpoint,
// kein data_exchange: Bis zum Klick auf „Zustimmen & senden“ geht nichts an uns (Rechtsprüfung A2); der Knopf schließt
// das Formular mit der Aktion „complete“, die Antwort kommt als Webhook nfm_reply (lib/policen/server.ts).
//
// Abweichung vom Mockup (begründet): Meta erlaubt PhotoPicker und DocumentPicker NICHT auf demselben Bildschirm
// (Doku „Media upload“, Stand 19.11.2026). Darum zwei gleich aufgebaute Bildschirme mit denselben Punkten und demselben
// Knopf: POLICEN (Fotos, Kamera oder Galerie, Hauptweg „Foto der ersten Seite“) und POLICEN_PDF (PDFs), erreichbar über
// den Link „Lieber PDFs senden“ (navigate, keine Daten an uns); zurück zu den Fotos geht es mit dem Zurück-Pfeil des
// Formulars. Die Zeile „Ihr Termin findet auch ohne Policen statt.“ steht im Hinweis über dem Knopf (Footer-Untertitel
// höchstens 15 Zeichen).
//
// Einstiegs-Bildschirm (Produktionsfehler 19.11.2026, 360dialog 400 #131009 „Specified screen POLICEN is not allowed as
// first screen of this flow. Allowed screen name is: <none>“): Ohne Endpoint leitet Meta das Routing aus den
// navigate-Aktionen ab; Einstieg ist nur ein Bildschirm, auf den kein anderer navigiert. Die erste Fassung verlinkte
// POLICEN und POLICEN_PDF gegenseitig (Kreis), damit gab es keinen Einstieg und jede Flow-Nachricht mit
// flow_action_payload.screen = POLICEN scheiterte. Darum kein Link zurück, und pruefeFlowJson verlangt genau einen
// Einstieg (SCREEN_FOTOS) ohne Kreis.
//
// Grenzen laut developers.facebook.com/docs/whatsapp/flows/reference (components, media_upload), abgerufen 19.11.2026:
//   TextHeading/TextSubheading 80, TextBody 4096 (markdown ab 5.1), OptIn-Text 120 (höchstens 5 je Bildschirm),
//   EmbeddedLink-Text 25 (höchstens 2 je Bildschirm, open_url ab 6.0), Footer-Text 35 (genau einer je Bildschirm,
//   Untertitel je 15), Picker-Label 80 und Beschreibung 300, je Bildschirm höchstens ein PhotoPicker bzw.
//   DocumentPicker und nie beide, Medien nur als Wert einer obersten Eigenschaft in complete/data_exchange (nie in
//   navigate), in der Antwortnachricht höchstens 10 Dateien und 100 MiB zusammen, Dateigröße 1 bis 25.600 KB.

import { createHash } from "node:crypto";
import { FORMULAR, KNOPF_ZUSTIMMEN, type FormularDaten } from "@/lib/policen/flow/texte";
import { POLICEN_MAX_BYTES } from "@/lib/policen/regeln";

/** Flow-JSON-Version (markdown 5.1+, open_url 6.0+, Picker 4.0+). */
export const FLOW_JSON_VERSION = "6.3";
export const SCREEN_FOTOS = "POLICEN";
export const SCREEN_PDFS = "POLICEN_PDF";
/** Höchstens so viele Dateien je Absenden (Meta: 10 in der Antwortnachricht). */
export const MAX_DATEIEN_JE_SENDEN = 10;

const DATEN_KEYS: (keyof FormularDaten)[] = ["intro", "ueberschrift", "punkt1", "punkt2", "punkt3", "punkt4", "hinweis", "datenschutz_url"];
const BEISPIEL: FormularDaten = {
  intro: "Meist reicht ein Foto der ersten Seite. Gern mehrere Verträge auf einmal.",
  ueberschrift: "Das passiert mit Ihren Policen",
  punkt1: "1. **Nur für Ihren Termin:** Herr Kannapinn (Ole Kannapinn UG) speichert sie zur Vorbereitung.",
  punkt2: "2. **Per KI ausgelesen, damit Ihr Vergleich zum Termin schon fertig ist:** Die Vertragsdaten liest ein KI-Dienst in der EU aus.",
  punkt3: "3. **Beteiligt:** WhatsApp (Meta, Zugriff auch aus den USA) und der Dienstleister performancegrowth.",
  punkt4: "4. **Jederzeit widerrufbar:** Schreiben Sie „Widerruf“, dann wird alles gelöscht.",
  hinweis: "Mit „Zustimmen & senden“ sind Sie mit den Punkten oben einverstanden. Ihr Termin findet auch ohne Policen statt.",
  datenschutz_url: "https://app.performancegrowth.de/datenschutz/policen?k=beispiel",
};

type Komponente = Record<string, unknown> & { type: string };
type Screen = { id: string; title: string; terminal?: boolean; success?: boolean; data: Record<string, unknown>; layout: { type: string; children: Komponente[] } };
export type FlowJson = { version: string; screens: Screen[] };

const durchreichen = () => Object.fromEntries(DATEN_KEYS.map((k) => [k, `\${data.${k}}`]));

function bildschirm(o: { id: string; picker: Komponente; wechsel: { text: string; ziel: string } | null; antwortKey: string; formName: string }): Screen {
  return {
    id: o.id,
    title: FORMULAR.titel,
    terminal: true,
    success: true,
    data: Object.fromEntries(DATEN_KEYS.map((k) => [k, { type: "string", __example__: BEISPIEL[k] }])),
    layout: {
      type: "SingleColumnLayout",
      children: [
        // Einleitung dynamisch (Kfz: Fahrzeugschein und Rechnung, Ole 22.11.2026)
        { type: "TextBody", text: "${data.intro}" },
        o.picker,
        ...(o.wechsel ? [{ type: "EmbeddedLink", text: o.wechsel.text, "on-click-action": { name: "navigate", next: { type: "screen", name: o.wechsel.ziel }, payload: durchreichen() } }] : []),
        { type: "TextSubheading", text: "${data.ueberschrift}" },
        { type: "TextBody", markdown: true, text: "${data.punkt1}" },
        { type: "TextBody", markdown: true, text: "${data.punkt2}" },
        // Nicht vorbelegt (kein init-value): gesetzt = nur speichern, nicht auslesen (ki = false)
        { type: "OptIn", name: "ohne_ki", label: FORMULAR.ohneKi, required: false },
        { type: "TextBody", markdown: true, text: "${data.punkt3}" },
        { type: "TextBody", markdown: true, text: "${data.punkt4}" },
        { type: "EmbeddedLink", text: FORMULAR.datenschutz, "on-click-action": { name: "open_url", url: "${data.datenschutz_url}" } },
        { type: "TextCaption", text: "${data.hinweis}" },
        {
          type: "Footer",
          label: KNOPF_ZUSTIMMEN,
          "on-click-action": { name: "complete", payload: { [o.antwortKey]: `\${form.${o.formName}}`, ohne_ki: "${form.ohne_ki}", bildschirm: o.id } },
        },
      ],
    },
  };
}

/** Das Flow JSON „Policen senden“ (zwei Bildschirme, siehe oben). */
export function policenFlowJson(): FlowJson {
  const maxKb = Math.floor(POLICEN_MAX_BYTES / 1024);
  return {
    version: FLOW_JSON_VERSION,
    screens: [
      bildschirm({
        id: SCREEN_FOTOS,
        picker: { type: "PhotoPicker", name: "fotos", label: FORMULAR.fotos, "photo-source": "camera_gallery", "min-uploaded-photos": 1, "max-uploaded-photos": MAX_DATEIEN_JE_SENDEN, "max-file-size-kb": maxKb },
        wechsel: { text: FORMULAR.zuPdfs, ziel: SCREEN_PDFS },
        antwortKey: "fotos",
        formName: "fotos",
      }),
      bildschirm({
        id: SCREEN_PDFS,
        picker: {
          type: "DocumentPicker",
          name: "pdfs",
          label: FORMULAR.pdfs,
          "min-uploaded-documents": 1,
          "max-uploaded-documents": MAX_DATEIEN_JE_SENDEN,
          "max-file-size-kb": maxKb,
          "allowed-mime-types": ["application/pdf"],
        },
        // Kein Link zurück (Kreis = kein Einstiegs-Bildschirm bei Meta, siehe oben): Zurück-Pfeil des Formulars
        wechsel: null,
        antwortKey: "pdfs",
        formName: "pdfs",
      }),
    ],
  };
}

export const flowJsonText = (f: FlowJson = policenFlowJson()) => JSON.stringify(f);
/** SHA-256 (hex) des Flow JSON: ändert er sich, wird ein neuer Flow angelegt (veröffentlichte Flows sind fest). */
export const flowJsonHash = (f: FlowJson = policenFlowJson()) => createHash("sha256").update(flowJsonText(f)).digest("hex");

// ─── Prüfung gegen die bekannten Regeln ─────────────────────────────────────

/** Ziele der navigate-Aktionen je Bildschirm (Routing, wie Meta es ohne Endpoint ableitet). */
function navigateZiele(f: FlowJson): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of f.screens) {
    const ziele: string[] = [];
    const walk = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v)) return v.forEach(walk);
      const o = v as Record<string, unknown>;
      const a = o["on-click-action"] as { name?: string; next?: { name?: string } } | undefined;
      if (a?.name === "navigate" && a.next?.name) ziele.push(a.next.name);
      Object.values(o).forEach(walk);
    };
    walk(s.layout);
    out.set(s.id, ziele);
  }
  return out;
}

/**
 * Einstiegs-Bildschirme laut Routing: Bildschirme, auf die keiner navigiert. Meta erlaubt als flow_action_payload.screen
 * bzw. navigate_screen nur einen davon (sonst 400 #131009 „… not allowed as first screen … Allowed screen name is: <none>“).
 */
export function einstiegsBildschirme(f: FlowJson = policenFlowJson()): string[] {
  const ziele = new Set([...navigateZiele(f).values()].flat());
  return f.screens.map((s) => s.id).filter((id) => !ziele.has(id));
}

/** Kreis im Routing (A → B → A)? */
function hatKreis(f: FlowJson): boolean {
  const z = navigateZiele(f);
  const stand = new Map<string, 1 | 2>();
  const besuche = (id: string): boolean => {
    if (stand.get(id) === 1) return true;
    if (stand.get(id) === 2) return false;
    stand.set(id, 1);
    if ((z.get(id) ?? []).some(besuche)) return true;
    stand.set(id, 2);
    return false;
  };
  return f.screens.some((s) => besuche(s.id));
}

const LIMITS: Record<string, Record<string, number>> = {
  TextHeading: { text: 80 },
  TextSubheading: { text: 80 },
  TextBody: { text: 4096 },
  TextCaption: { text: 4096 },
  OptIn: { label: 120 },
  EmbeddedLink: { text: 25 },
  Footer: { label: 35, "left-caption": 15, "center-caption": 15, "right-caption": 15 },
  PhotoPicker: { label: 80, description: 300 },
  DocumentPicker: { label: 80, description: 300 },
};
const FELD_RE = /\$\{(data|form)\.([A-Za-z0-9_]+)\}/g;
const MIN_VERSION: Record<string, number> = { PhotoPicker: 4.0, DocumentPicker: 4.0 };

const vNum = (v: string) => Number(v);

/** Feste Texte gegen die Grenze; ${data.x} mit allen übergebenen Werten einsetzen (Längen dynamischer Texte). */
function laenge(text: string, daten?: Partial<FormularDaten>): number {
  return text.replace(FELD_RE, (_, art: string, k: string) => (art === "data" && daten ? String((daten as Record<string, string>)[k] ?? "") : "x")).length;
}

/**
 * Fehlerliste (leer = gültig) für die Regeln oben, dazu eigene: kein data_exchange und kein Endpoint, jeder
 * Bildschirm mit Footer ist terminal, alle ${data.x} sind deklariert, Medien nur oben in complete. daten: Werte
 * zum Prüfen der Längen dynamischer Texte (z. B. jede Variante aus formularDaten).
 */
export function pruefeFlowJson(f: FlowJson, daten: Partial<FormularDaten>[] = []): string[] {
  const fehler: string[] = [];
  if (!/^\d+\.\d+$/.test(f.version)) fehler.push("version");
  if (!f.screens.length) fehler.push("keine Bildschirme");
  const ids = new Set(f.screens.map((s) => s.id));
  if (ids.size !== f.screens.length) fehler.push("Bildschirm-IDs doppelt");
  if (JSON.stringify(f).includes("data_exchange")) fehler.push("data_exchange ist nicht erlaubt (A2)");
  if ("data_api_version" in f || "routing_model" in f) fehler.push("kein Endpoint");
  if (f.screens.length) {
    if (hatKreis(f)) fehler.push("Routing mit Kreis (Meta: kein Einstiegs-Bildschirm)");
    const einstieg = einstiegsBildschirme(f);
    if (einstieg.length !== 1 || einstieg[0] !== SCREEN_FOTOS) fehler.push(`Einstieg muss genau ${SCREEN_FOTOS} sein (ist: ${einstieg.join(", ") || "keiner"})`);
  }
  for (const s of f.screens) {
    if (!/^[A-Z][A-Z_]*$/.test(s.id) || s.id === "SUCCESS") fehler.push(`${s.id}: ungültige ID`);
    const kids = s.layout.children;
    const zahl = (t: string) => kids.filter((k) => k.type === t).length;
    if (zahl("Footer") > 1) fehler.push(`${s.id}: mehr als ein Footer`);
    if (s.terminal && zahl("Footer") !== 1) fehler.push(`${s.id}: terminaler Bildschirm ohne Footer`);
    if (zahl("EmbeddedLink") > 2) fehler.push(`${s.id}: mehr als 2 EmbeddedLinks`);
    if (zahl("OptIn") > 5) fehler.push(`${s.id}: mehr als 5 OptIns`);
    if (zahl("PhotoPicker") > 1 || zahl("DocumentPicker") > 1) fehler.push(`${s.id}: mehr als ein Picker gleicher Art`);
    if (zahl("PhotoPicker") && zahl("DocumentPicker")) fehler.push(`${s.id}: PhotoPicker und DocumentPicker auf einem Bildschirm`);
    const namen = kids.map((k) => k.name).filter((n): n is string => typeof n === "string");
    if (new Set(namen).size !== namen.length) fehler.push(`${s.id}: Namen doppelt`);
    const deklariert = new Set(Object.keys(s.data ?? {}));
    for (const [k, v] of Object.entries(s.data ?? {})) {
      if (!v || typeof v !== "object" || !("__example__" in v)) fehler.push(`${s.id}: data.${k} ohne __example__`);
    }
    const footer = kids.find((k) => k.type === "Footer");
    if (footer && (footer["center-caption"] && (footer["left-caption"] || footer["right-caption"]))) fehler.push(`${s.id}: Footer-Untertitel`);
    for (const k of kids) {
      const min = MIN_VERSION[k.type];
      if (min && vNum(f.version) < min) fehler.push(`${s.id}: ${k.type} erst ab ${min}`);
      if (k.markdown && vNum(f.version) < 5.1) fehler.push(`${s.id}: markdown erst ab 5.1`);
      for (const [feld, max] of Object.entries(LIMITS[k.type] ?? {})) {
        const v = k[feld];
        if (typeof v !== "string") continue;
        if (!v.trim()) fehler.push(`${s.id}: ${k.type}.${feld} leer`);
        const varianten = /\$\{data\./.test(v) && daten.length ? daten : [undefined];
        for (const d of varianten) if (laenge(v, d) > max) fehler.push(`${s.id}: ${k.type}.${feld} länger als ${max}`);
      }
      for (const m of JSON.stringify(k).matchAll(FELD_RE)) {
        if (m[1] === "data" && !deklariert.has(m[2])) fehler.push(`${s.id}: data.${m[2]} nicht deklariert`);
        if (m[1] === "form" && !namen.includes(m[2])) fehler.push(`${s.id}: form.${m[2]} gibt es nicht`);
      }
      if (k.type === "PhotoPicker" || k.type === "DocumentPicker") {
        const art = k.type === "PhotoPicker" ? "photos" : "documents";
        const mn = Number(k[`min-uploaded-${art}`] ?? 0);
        const mx = Number(k[`max-uploaded-${art}`] ?? 30);
        if (mn < 0 || mn > 30 || mx < 1 || mx > 30 || mn > mx) fehler.push(`${s.id}: ${k.type} min/max`);
        if (mx > MAX_DATEIEN_JE_SENDEN) fehler.push(`${s.id}: mehr als ${MAX_DATEIEN_JE_SENDEN} Dateien in der Antwort`);
        const kb = Number(k["max-file-size-kb"] ?? 25600);
        if (kb < 1 || kb > 25600) fehler.push(`${s.id}: max-file-size-kb`);
      }
      const aktion = k["on-click-action"] as { name?: string; payload?: Record<string, unknown>; next?: { name?: string } } | undefined;
      if (aktion) {
        const pickerNamen = kids.filter((x) => x.type === "PhotoPicker" || x.type === "DocumentPicker").map((x) => x.name as string);
        const medienRef = (v: unknown) => typeof v === "string" && pickerNamen.some((n) => v.includes(`\${form.${n}}`));
        const payload = aktion.payload ?? {};
        if (aktion.name === "navigate") {
          if (!aktion.next?.name || !ids.has(aktion.next.name)) fehler.push(`${s.id}: navigate auf unbekannten Bildschirm`);
          if (JSON.stringify(payload).match(/\$\{form\.(fotos|pdfs)\}/)) fehler.push(`${s.id}: Medien in navigate`);
        }
        if (aktion.name === "complete") {
          for (const v of Object.values(payload)) if (v && typeof v === "object" && JSON.stringify(v).includes("${form.")) fehler.push(`${s.id}: Medien nicht oben im payload`);
          if (!Object.values(payload).some(medienRef)) fehler.push(`${s.id}: complete ohne Dateien`);
        }
        if (aktion.name === "open_url" && vNum(f.version) < 6.0) fehler.push(`${s.id}: open_url erst ab 6.0`);
        if (!["navigate", "complete", "open_url", "update_data"].includes(aktion.name ?? "")) fehler.push(`${s.id}: Aktion ${aktion.name}`);
      }
    }
  }
  return fehler;
}
