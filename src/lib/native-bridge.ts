"use client";

// Brücke zur App-Store-App (Capacitor-Hülle, Ordner mobile/). Alle Funktionen
// sind ohne App harmlos (No-op bzw. false): die Web-App lädt keine Capacitor-
// Pakete, sondern nutzt die von der App eingespeisten Plugins unter
// window.Capacitor.Plugins.

type Listener = { remove: () => Promise<void> | void };
type PluginApi = Record<string, (...args: never[]) => Promise<unknown>> & {
  addListener?: (event: string, cb: (data: never) => void) => Promise<Listener> | Listener;
};
type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, PluginApi | undefined>;
};

function cap(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

/** Läuft die Seite in der App (nicht im Browser)? */
export function isNativeApp(): boolean {
  const c = cap();
  if (c?.isNativePlatform?.()) return true;
  return typeof navigator !== "undefined" && /performancegrowthApp\//.test(navigator.userAgent);
}

export function nativePlatform(): "ios" | "android" | null {
  const p = cap()?.getPlatform?.();
  return p === "ios" || p === "android" ? p : null;
}

function plugin(name: string): PluginApi | null {
  return (isNativeApp() && cap()?.Plugins?.[name]) || null;
}

async function call(name: string, method: string, arg?: unknown): Promise<unknown> {
  const p = plugin(name);
  const fn = p?.[method] as ((a?: unknown) => Promise<unknown>) | undefined;
  if (!fn) return undefined;
  try {
    return await fn.call(p, arg);
  } catch {
    return undefined;
  }
}

/** Kurzes haptisches Feedback – siehe lib/haptics.ts (semantische Funktionen). */
export { haptic } from "@/lib/haptics";

/** Natives Teilen-Menü; false = nicht verfügbar (dann Web-Fallback nutzen). */
export async function nativeShare(opts: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (!plugin("Share")) return false;
  await call("Share", "share", { ...opts, dialogTitle: opts.title });
  return true;
}

/** Zähler am App-Symbol setzen (0 = ausblenden). */
export function setAppBadge(count: number): void {
  if (!isNativeApp()) return;
  void call("Badge", count > 0 ? "set" : "clear", count > 0 ? { count } : undefined);
}

/** URL im System-Browser öffnen (In-App-Safari bzw. Chrome Custom Tab). */
export async function openInSystemBrowser(url: string): Promise<void> {
  if (plugin("Browser")) await call("Browser", "open", { url, presentationStyle: "popover" });
  else window.open(url, "_blank", "noopener");
}

// ─── Push ──────────────────────────────────────────────────────────────

const TOKEN_KEY = "pg-native-push-token";

export type NativePushState = "granted" | "denied" | "prompt" | "unsupported";

export async function nativePushPermission(): Promise<NativePushState> {
  if (!plugin("PushNotifications")) return "unsupported";
  const r = (await call("PushNotifications", "checkPermissions")) as { receive?: string } | undefined;
  const s = r?.receive;
  return s === "granted" ? "granted" : s === "denied" ? "denied" : s ? "prompt" : "unsupported";
}

let listenersReady = false;

/** Listener einmalig: Token an den Server, Tippen auf Benachrichtigung → Seite öffnen. */
export async function initNativePushListeners(navigate: (url: string) => void): Promise<void> {
  const p = plugin("PushNotifications");
  if (!p?.addListener || listenersReady) return;
  listenersReady = true;
  await p.addListener("registration", ((t: { value: string }) => {
    try {
      localStorage.setItem(TOKEN_KEY, t.value);
    } catch {
      /* egal */
    }
    void fetch("/api/app/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t.value, platform: nativePlatform(), appVersion: navigator.userAgent.match(/performancegrowthApp\/([\d.]+)/)?.[1] ?? null }),
    }).catch(() => {});
  }) as never);
  await p.addListener("pushNotificationActionPerformed", ((a: { notification?: { data?: { url?: string } } }) => {
    const url = a.notification?.data?.url;
    if (url && url.startsWith("/")) navigate(url);
  }) as never);
  if (nativePlatform() === "android") {
    await call("PushNotifications", "createChannel", {
      id: "leads",
      name: "Neue Leads und Aufgaben",
      description: "Neue Leads, Antworten und Termine",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  }
}

/** Erlaubnis anfragen (falls nötig) und beim Betriebssystem anmelden. */
export async function enableNativePush(): Promise<NativePushState> {
  let state = await nativePushPermission();
  if (state === "prompt") {
    const r = (await call("PushNotifications", "requestPermissions")) as { receive?: string } | undefined;
    state = r?.receive === "granted" ? "granted" : r?.receive === "denied" ? "denied" : "prompt";
  }
  if (state === "granted") await call("PushNotifications", "register");
  return state;
}

/** Beim Abmelden: Gerät vom Login lösen (keepalive, damit es auch beim Seitenwechsel ankommt). */
export function forgetNativeDevice(): void {
  if (!isNativeApp()) return;
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  void fetch("/api/app/device", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token ? { token } : {}),
    keepalive: true,
  }).catch(() => {});
  setAppBadge(0);
}

// ─── Anmeldung mit Google/Microsoft in der App ─────────────────────────
// Google verbietet OAuth in eingebetteten Ansichten. Darum: Start im System-Browser
// (/api/auth/<anbieter>/start?app=1), der Callback leitet mit Einmal-Code auf
// performancegrowth://login?code=… zurück, die App fängt das ab (App-Plugin
// „appUrlOpen“), schließt den Browser und löst den Code in der App-Ansicht ein.

const SSO_LOGIN_FEHLER = new Set(["abgebrochen", "abgelaufen", "kein-konto", "fehlgeschlagen", "admin-freigabe", "einstellung"]);

/** Ziel in der App-Ansicht für eine performancegrowth://login-Adresse; null = nicht unsere. */
export function appLoginTarget(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "performancegrowth:" || u.hostname !== "login") return null;
  const code = u.searchParams.get("code");
  if (code) return /^[A-Za-z0-9_-]{20,100}$/.test(code) ? `/api/app/login-handoff?code=${encodeURIComponent(code)}` : "/login?fehler=abgelaufen";
  const fehler = u.searchParams.get("fehler") ?? "";
  return `/login?fehler=${SSO_LOGIN_FEHLER.has(fehler) ? fehler : "fehlgeschlagen"}`;
}

/** Google/Microsoft-Anmeldung aus der App im System-Browser starten. */
export function startSsoInSystemBrowser(provider: "google" | "microsoft", next: string): void {
  const u = new URL(`/api/auth/${provider}/start`, window.location.origin);
  u.searchParams.set("app", "1");
  if (next) u.searchParams.set("next", next);
  void openInSystemBrowser(u.toString());
}

let appLoginReady = false;

/** Rücksprung aus dem System-Browser abfangen (einmalig): Browser schließen, Code einlösen. */
export function initAppLoginListener(): void {
  const app = plugin("App");
  if (!app?.addListener || appLoginReady) return;
  appLoginReady = true;
  void app.addListener("appUrlOpen", ((d: { url?: string }) => {
    const target = d?.url ? appLoginTarget(d.url) : null;
    if (!target) return;
    void call("Browser", "close");
    // Volle Navigation (nicht router.push): die Route setzt das Sitzungs-Cookie und leitet weiter.
    window.location.assign(new URL(target, window.location.origin).toString());
  }) as never);
}

/** Pfade, die Google/Microsoft-Anmeldung auslösen und in der App nicht gehen. */
export function needsSystemBrowser(href: string): boolean {
  try {
    const u = new URL(href, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    return /^\/api\/(google|microsoft)\/connect\b/.test(u.pathname);
  } catch {
    return false;
  }
}

// ─── Face ID: angemeldet bleiben und beim Öffnen entsperren ───────────────
// Server: lib/app-geraete-login.ts. Der Geräte-Schlüssel liegt im Schlüsselbund hinter Face ID (Plugin
// NativeBiometric, accessControl BIOMETRY_ANY: lesen geht nur nach Face ID). Im localStorage stehen nur
// nicht geheime Kennzeichen: ob Face ID an ist (für die Sperre schon vor dem Laden, app/layout.tsx), die
// Eintrags-ID (zum Beenden beim Abmelden) und ob der Nutzer Face ID selbst ausgeschaltet hat.

/** Kennzeichen „Face ID an“; das Inline-Skript in app/layout.tsx liest es vor dem ersten Bild. */
export const FACE_ID_AN_KEY = "pg-face-id";
const FACE_ID_ID_KEY = "pg-face-id-eintrag";
const FACE_ID_AUS_KEY = "pg-face-id-aus";
const BIOMETRY_ANY = 2;

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* egal */
  }
}

function keychainServer(): string {
  return `pg-login:${window.location.host}`;
}

export type Biometrie = { verfuegbar: boolean; name: string };

/** Face ID/Touch ID (iOS) bzw. Fingerabdruck (Android) eingerichtet? Ohne App: nicht verfügbar. */
export async function biometrie(): Promise<Biometrie> {
  if (!plugin("NativeBiometric")) return { verfuegbar: false, name: "Face ID" };
  const r = (await call("NativeBiometric", "isAvailable", { useFallback: false })) as { isAvailable?: boolean; biometryType?: number } | undefined;
  const name = r?.biometryType === 1 ? "Touch ID" : r?.biometryType === 2 ? "Face ID" : nativePlatform() === "android" ? "Fingerabdruck" : "Face ID";
  return { verfuegbar: !!r?.isAvailable, name };
}

export function faceIdAn(): boolean {
  return isNativeApp() && lsGet(FACE_ID_AN_KEY) === "1";
}

/** Hat der Nutzer Face ID in den Einstellungen ausgeschaltet? Dann nicht automatisch wieder einrichten. */
export function faceIdAbgewaehlt(): boolean {
  return lsGet(FACE_ID_AUS_KEY) === "1";
}

async function speichern(id: string, token: string): Promise<boolean> {
  await call("NativeBiometric", "deleteCredentials", { server: keychainServer() });
  const p = plugin("NativeBiometric");
  const fn = p?.setCredentials as ((a: unknown) => Promise<unknown>) | undefined;
  if (!fn) return false;
  try {
    await fn.call(p, { username: id, password: token, server: keychainServer(), accessControl: BIOMETRY_ANY });
  } catch {
    return false;
  }
  lsSet(FACE_ID_ID_KEY, id);
  lsSet(FACE_ID_AN_KEY, "1");
  return true;
}

/** Face ID einrichten (nur angemeldet): Schlüssel vom Server holen und hinter Face ID ablegen. */
export async function faceIdEinrichten(): Promise<boolean> {
  if (!(await biometrie()).verfuegbar) return false;
  const r = await fetch("/api/app/geraete-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: nativePlatform() }),
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return false;
  const d = (await r.json().catch(() => null)) as { id?: string; token?: string } | null;
  if (!d?.id || !d.token) return false;
  const ok = await speichern(d.id, d.token);
  if (ok) lsSet(FACE_ID_AUS_KEY, null);
  return ok;
}

/** Face ID auf diesem Gerät beenden. `abgewaehlt`: vom Nutzer ausgeschaltet (nicht automatisch neu einrichten). */
export function faceIdBeenden(opts: { abgewaehlt?: boolean } = {}): void {
  const id = lsGet(FACE_ID_ID_KEY);
  lsSet(FACE_ID_AN_KEY, null);
  lsSet(FACE_ID_ID_KEY, null);
  if (opts.abgewaehlt) lsSet(FACE_ID_AUS_KEY, "1");
  if (!isNativeApp()) return;
  void call("NativeBiometric", "deleteCredentials", { server: keychainServer() });
  if (id) {
    void fetch("/api/app/geraete-login", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {});
  }
}

export type Entsperrt =
  | { status: "angemeldet"; ziel: string } // Face ID ok, Sitzung erneuert
  | { status: "abgebrochen" } // Face ID abgebrochen oder fehlgeschlagen: erneut versuchen oder Passwort
  | { status: "ungueltig" } // Schlüssel fehlt oder gilt nicht mehr: Face ID ist aus, normal anmelden
  | { status: "offline" }; // Face ID ok, Server nicht erreichbar

/** Face ID abfragen, Schlüssel einlösen (neue Sitzung) und den neuen Schlüssel wieder ablegen. */
export async function faceIdEntsperren(next: string | null, grund: string): Promise<Entsperrt> {
  const p = plugin("NativeBiometric");
  const lesen = p?.getSecureCredentials as ((a: unknown) => Promise<{ username?: string; password?: string }>) | undefined;
  if (!lesen) return { status: "ungueltig" };
  let cred: { username?: string; password?: string };
  try {
    cred = await lesen.call(p, { server: keychainServer(), reason: grund });
  } catch (e) {
    // Kein Eintrag im Schlüsselbund (z. B. App neu installiert) → Face ID aus; sonst abgebrochen/fehlgeschlagen
    const msg = String((e as { message?: unknown })?.message ?? e).toLowerCase();
    if (/not found|no credentials|item not found|-25300/.test(msg)) {
      faceIdBeenden();
      return { status: "ungueltig" };
    }
    return { status: "abgebrochen" };
  }
  if (!cred?.password) {
    faceIdBeenden();
    return { status: "ungueltig" };
  }
  let r: Response | null;
  try {
    r = await fetch("/api/app/geraete-login/einloesen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: cred.password, next }),
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    return { status: "offline" };
  }
  if (r.status === 401) {
    faceIdBeenden();
    return { status: "ungueltig" };
  }
  if (!r.ok) return { status: "offline" };
  const d = (await r.json().catch(() => null)) as { id?: string; token?: string; ziel?: string } | null;
  if (d?.id && d.token) await speichern(d.id, d.token);
  return { status: "angemeldet", ziel: d?.ziel ?? "/buyer" };
}
