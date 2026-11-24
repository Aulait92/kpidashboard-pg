// iPhone-App im App Store (Ole, 24.11.2026: Version 1.0 veröffentlicht, DE/AT/CH, nicht auf dem Mac).
// Ein Ort für den Store-Link und die Geräte-Erkennung über den User-Agent; überall diese Konstante nutzen.
// Die App ist eine Capacitor-Hülle (mobile/), sie hängt „performancegrowthApp/<Version>“ an den User-Agent.

/** Link zur iPhone-App im App Store. */
export const IOS_APP_STORE_URL = "https://apps.apple.com/de/app/performancegrowth/id6838442707";

/** Android-App: noch nicht im Play Store (Hinweis „kommt bald“). */
export const ANDROID_APP_VERFUEGBAR = false;

/** Text, wenn jemand kein iPhone hat (Wortlaut Ole, 24.11.2026). */
export const ANDROID_BALD_TEXT = "Die Android-App kommt bald, bis dahin sehen Sie alle neuen Leads wie gewohnt hier im Browser.";

export type Geraet = "app" | "iphone" | "android" | "desktop";

/** Läuft die Anfrage aus der App-Store-App (iOS oder Android)? */
export function istAppUserAgent(ua: string | null | undefined): boolean {
  return /performancegrowthApp\//.test(ua ?? "");
}

/**
 * Gerät aus dem User-Agent: App (Store-App), iPhone (Browser), Android (Browser), sonst Computer.
 * iPads melden sich in Safari als Mac und gelten als Computer (QR-Code statt Store-Knopf).
 */
export function geraetAusUserAgent(ua: string | null | undefined): Geraet {
  const s = ua ?? "";
  if (istAppUserAgent(s)) return "app";
  if (/iPhone|iPod/.test(s)) return "iphone";
  if (/Android/i.test(s)) return "android";
  return "desktop";
}

/** iPhone im Spiel (Browser oder App auf einem iPhone)? Für „schon einmal mit dem iPhone angemeldet“. */
export function istIphoneUserAgent(ua: string | null | undefined): boolean {
  return /iPhone|iPod/.test(ua ?? "");
}

export type AppHinweisArt = "iphone" | "desktop" | "android";

/**
 * Welche Hinweiskarte „iPhone-App“ zeigt die Startseite? null = keine.
 * Nie in der App, nie nach der ersten App-Anmeldung, nie nach Wegklicken. Am Computer nur für Nutzer,
 * die schon einmal mit einem iPhone da waren (sonst hilft der QR-Code nicht).
 */
export function appHinweisArt(o: { geraet: Geraet; appAngemeldet: boolean; weggeklickt: boolean; iphoneGesehen: boolean }): AppHinweisArt | null {
  if (o.geraet === "app" || o.appAngemeldet || o.weggeklickt) return null;
  if (o.geraet === "iphone") return "iphone";
  if (o.geraet === "android") return ANDROID_APP_VERFUEGBAR ? null : "android";
  return o.iphoneGesehen ? "desktop" : null;
}
