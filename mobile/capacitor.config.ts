import type { CapacitorConfig } from "@capacitor/cli";

// App-Store-App für den Kundenbereich: lädt app.performancegrowth.de in einer
// nativen Hülle und ergänzt native Funktionen (Push, Haptik, Teilen, Zähler am
// App-Symbol). Die Web-App erkennt die App über window.Capacitor bzw. den
// User-Agent-Zusatz „performancegrowthApp“ (src/lib/native-bridge.ts).
//
// Staging-Build: CAP_SERVER_URL=https://staging.performancegrowth.de/buyer npx cap sync
const serverUrl = process.env.CAP_SERVER_URL ?? "https://app.performancegrowth.de/buyer";

const config: CapacitorConfig = {
  appId: "de.performancegrowth.app",
  appName: "performancegrowth",
  // Lokale Ersatzseite (kein Netz / Server nicht erreichbar)
  webDir: "www",
  server: {
    url: serverUrl,
    // Nur eigene Domains bleiben in der App; alles andere (wa.me, Karten,
    // fremde Seiten) öffnet Capacitor im System-Browser. tel:/mailto: nativ.
    allowNavigation: ["app.performancegrowth.de", "staging.performancegrowth.de"],
    errorPath: "offline.html",
    cleartext: false,
  },
  appendUserAgent: "performancegrowthApp/1.1",
  backgroundColor: "#ffffff",
  ios: {
    contentInset: "never",
    scheme: "performancegrowth",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Startbildschirm bis die Seite gezeichnet ist (Ole, 24.11.2026: vorher nach 0,6 s weiß, bis die Seite kam). Die
    // Web-App blendet ihn selbst aus (src/app/layout.tsx, SPLASH_HIDE, und native-app-bridge.tsx); spätestens nach 8 s.
    SplashScreen: {
      launchShowDuration: 8000,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      // Inhalt schrumpft mit der Tastatur (Eingabefeld bleibt sichtbar)
      resize: "native",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#ffffff",
      overlaysWebView: false,
    },
  },
};

export default config;
