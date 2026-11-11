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
  appendUserAgent: "performancegrowthApp/1.0",
  backgroundColor: "#ffffff",
  ios: {
    contentInset: "never",
    scheme: "performancegrowth",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
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
