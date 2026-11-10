"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Neue Admin-Oberfläche: Liste und Detail sind eigene, volle Seiten. Damit
// „Zurück“ wieder bei derselben Liste landet (Suche, Filter, Seite), merkt sich
// die Liste ihre Adresse pro Browser-Tab.

const PREFIX = "admin-list:";

/** In der Liste einbauen: speichert die aktuelle Adresse samt Filter. */
export function RememberList({ id, paths }: { id: string; paths: string[] }) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  useEffect(() => {
    if (!pathname || !paths.includes(pathname)) return;
    try {
      sessionStorage.setItem(PREFIX + id, search ? `${pathname}?${search}` : pathname);
    } catch {
      /* ohne Speicher: Zurück führt zur ungefilterten Liste */
    }
  }, [id, paths, pathname, search]);
  return null;
}

/** Gemerkte Listen-Adresse, nur wenn sie zu einer der erlaubten Listen gehört. */
export function savedListHref(id: string, fallback: string, allowed: string[] = [fallback]): string {
  try {
    const saved = sessionStorage.getItem(PREFIX + id);
    if (saved && allowed.some((a) => saved === a || saved.startsWith(`${a}?`))) return saved;
  } catch {
    /* ohne Speicher */
  }
  return fallback;
}

/** Zurück-Link im Detail: führt zur gemerkten Liste, sonst zu `fallback`. */
export function BackToList({
  id,
  fallback,
  allowed,
  className,
  children,
}: {
  id: string;
  fallback: string;
  /** Weitere Listen derselben Gruppe (z. B. Kontakte und Pipeline) */
  allowed?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        const href = savedListHref(id, fallback, allowed ?? [fallback]);
        if (href !== fallback) {
          e.preventDefault();
          router.push(href);
        }
      }}
    >
      {children}
    </Link>
  );
}
