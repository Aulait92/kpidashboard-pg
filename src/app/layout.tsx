import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { NativeAppBridge } from "@/components/native-app-bridge";
import { NeueVersion } from "@/components/neue-version";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_METADATA: Metadata = {
  title: "performancegrowth",
  description: "Leads, Termine und Abschlüsse für Versicherungsvermittler",
  applicationName: "performancegrowth",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "performancegrowth",
  },
  formatDetection: {
    telephone: false,
  },
};

// Seiten für Endkunden (Buchung, Empfehlung, …, auch auf der eigenen Buchungsadresse): ohne Markennamen
// im Kopf der Seite (Ole, 15.11.2026). Kennzeichen setzt src/middleware.ts.
const LEAD_METADATA: Metadata = {
  title: "Terminbuchung",
  formatDetection: { telephone: false },
};

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  return h.get("x-bare-layout") === "lead" ? LEAD_METADATA : APP_METADATA;
}

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-[color:var(--foreground)]">
        <SiteHeader />
        {children}
        <SiteFooter />
        <NativeAppBridge />
        <NeueVersion />
      </body>
    </html>
  );
}
