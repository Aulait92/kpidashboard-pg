"use client";

// Maskottchen „Leo“ (von Lead), nur im Vermittlerbereich (Ole, 27.11.2026; Vorlage docs/ux/maskottchen/leo.js im
// Branch claude/loving-mendel-j965x3). Runder Assistent im PG-Blau mit Sprechblasen-Antenne, vier Posen:
//   hallo  Einrichtung (Begrüßung), Hilfe-Knopf und Kopf der KI-Hilfe
//   ruhig  leere Zustände (Heute, Kontakte, Nachrichten)
//   denkt  KI-Hilfe, während sie antwortet
//   jubel  Toast nach einem Abschluss
// Nie in Arbeitsabläufen (Formulare, Angebote, Lead-Detail, Abschluss-Blatt) und nie im Admin.
// Inline-SVG, dekorativ (aria-hidden), keine externen Bilder. „wippen“: einmal dezent beim Erscheinen, mit
// prefers-reduced-motion gar nicht (globals.css .leo-wippen).

import { useId } from "react";
import { cn } from "@/lib/utils";

export type LeoPose = "hallo" | "jubel" | "denkt" | "ruhig";

const ARM = { stroke: "#1d4ed8", strokeWidth: 9, strokeLinecap: "round" as const, fill: "none" };
const STRICH = { stroke: "#0b1220", strokeWidth: 5, fill: "none", strokeLinecap: "round" as const };
const MUND = { stroke: "#0b1220", strokeWidth: 4.5, fill: "none", strokeLinecap: "round" as const };

function Arme({ pose }: { pose: LeoPose }) {
  const d: Record<LeoPose, [string, string]> = {
    hallo: ["M38 112 q-22 -6 -26 -30", "M122 112 q14 6 18 22"],
    jubel: ["M40 104 q-18 -14 -18 -40", "M120 104 q18 -14 18 -40"],
    denkt: ["M40 114 q-12 10 -10 26", "M120 112 q10 -14 -8 -24"],
    ruhig: ["M40 116 q-12 10 -10 24", "M120 116 q12 10 10 24"],
  };
  return (
    <>
      <path d={d[pose][0]} {...ARM} />
      <path d={d[pose][1]} {...ARM} />
    </>
  );
}

function Augen({ pose }: { pose: LeoPose }) {
  if (pose === "jubel")
    return (
      <>
        <path d="M56 94 q8 -10 16 0" {...STRICH} />
        <path d="M88 94 q8 -10 16 0" {...STRICH} />
      </>
    );
  if (pose === "ruhig")
    return (
      <>
        <path d="M56 93 q8 6 16 0" {...STRICH} />
        <path d="M88 93 q8 6 16 0" {...STRICH} />
      </>
    );
  if (pose === "denkt")
    return (
      <>
        <ellipse cx="66" cy="90" rx="7" ry="9" fill="#0b1220" />
        <ellipse cx="98" cy="90" rx="7" ry="9" fill="#0b1220" />
        <circle cx="69" cy="86" r="2.4" fill="#fff" />
        <circle cx="101" cy="86" r="2.4" fill="#fff" />
      </>
    );
  return (
    <>
      <ellipse cx="64" cy="92" rx="8" ry="10" fill="#0b1220" />
      <ellipse cx="96" cy="92" rx="8" ry="10" fill="#0b1220" />
      <circle cx="66.5" cy="88.5" r="2.6" fill="#fff" />
      <circle cx="98.5" cy="88.5" r="2.6" fill="#fff" />
    </>
  );
}

function Mund({ pose }: { pose: LeoPose }) {
  if (pose === "jubel")
    return (
      <>
        <path d="M66 106 q14 20 28 0 z" fill="#0b1220" />
        <path d="M72 112 q8 6 16 0" fill="#f87171" />
      </>
    );
  if (pose === "denkt") return <path d="M74 113 h14" {...MUND} />;
  if (pose === "ruhig") return <path d="M72 110 q8 6 16 0" {...MUND} />;
  return <path d="M70 110 q10 10 20 0" {...MUND} />;
}

function Extra({ pose }: { pose: LeoPose }) {
  if (pose === "ruhig")
    return (
      <>
        <text x="128" y="52" fontFamily="Geist,sans-serif" fontWeight="700" fontSize="16" fill="#93a4c8">
          z
        </text>
        <text x="140" y="38" fontFamily="Geist,sans-serif" fontWeight="700" fontSize="12" fill="#b6c2dc">
          z
        </text>
      </>
    );
  if (pose === "jubel")
    return (
      <>
        <rect x="20" y="40" width="7" height="12" rx="2" fill="#22c55e" transform="rotate(-20 23 46)" />
        <rect x="136" y="34" width="7" height="12" rx="2" fill="#f59e0b" transform="rotate(25 139 40)" />
        <circle cx="34" cy="22" r="4" fill="#2563eb" />
        <circle cx="128" cy="16" r="4" fill="#22c55e" />
        <rect x="146" y="70" width="6" height="10" rx="2" fill="#2563eb" transform="rotate(30 149 75)" />
        <rect x="8" y="76" width="6" height="10" rx="2" fill="#f59e0b" transform="rotate(-30 11 81)" />
      </>
    );
  if (pose === "denkt")
    return (
      <>
        <circle cx="128" cy="48" r="4" fill="#93a4c8" />
        <circle cx="138" cy="38" r="5" fill="#93a4c8" />
        <circle cx="150" cy="26" r="6" fill="#93a4c8" />
      </>
    );
  return null;
}

export function Leo({ pose = "hallo", size = 120, wippen = false, className }: { pose?: LeoPose; size?: number; wippen?: boolean; className?: string }) {
  // Eigene Verlaufs-ID je Leo: gleiche IDs auf einer Seite brechen den Verlauf, sobald der erste Leo ausgeblendet ist
  const g = `leo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-leo={pose}
      className={cn("shrink-0", wippen && "leo-wippen", className)}
    >
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <Extra pose={pose} />
      <ellipse cx="80" cy="150" rx="36" ry="5" fill="#0b1220" opacity=".08" />
      <path d="M80 30 v-10" stroke="#1d4ed8" strokeWidth="5" strokeLinecap="round" />
      <rect x="66" y="4" width="28" height="18" rx="7" fill="#fff" stroke="#1d4ed8" strokeWidth="3" />
      <path d="M74 21 l-2 6 l8 -6" fill="#fff" stroke="#1d4ed8" strokeWidth="3" strokeLinejoin="round" />
      <path d="M72 13 l5 -4 l4 3 l6 -5" stroke="#2563eb" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Arme pose={pose} />
      <rect x="32" y="30" width="96" height="110" rx="44" fill="#2563eb" />
      <rect x="38" y="36" width="84" height="98" rx="40" fill={`url(#${g})`} />
      <ellipse cx="80" cy="96" rx="36" ry="30" fill="#eef3ff" />
      <circle cx="52" cy="106" r="6" fill="#fca5a5" opacity=".55" />
      <circle cx="108" cy="106" r="6" fill="#fca5a5" opacity=".55" />
      <Augen pose={pose} />
      <Mund pose={pose} />
    </svg>
  );
}
