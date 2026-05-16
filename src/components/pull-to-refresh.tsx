"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { runAirtableSync } from "@/lib/actions";
import { cn } from "@/lib/utils";

const THRESHOLD = 70; // px Pull-Distanz bis Refresh ausgelöst wird
const MAX_PULL = 110; // px hartes Maximum (Resistance-Cap)
const RESISTANCE = 0.55; // Bruchteil der Finger-Bewegung, der als Pull übernommen wird

type Phase = "idle" | "pulling" | "armed" | "refreshing";

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  // Refs spiegeln State, damit die touch-Listener nicht bei jedem Render neu
  // gebunden werden müssen (geringerer Jitter beim Pull).
  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    let raf: number | null = null;

    function onTouchStart(e: TouchEvent) {
      if (phaseRef.current === "refreshing") return;
      // Nur wenn die Seite oben ist — sonst ist es normales Scrollen.
      if (window.scrollY > 0) {
        startY.current = null;
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      startY.current = t.clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current == null || phaseRef.current === "refreshing") return;
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      const next = dy <= 0 ? 0 : Math.min(dy * RESISTANCE, MAX_PULL);
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setPull(next);
        setPhase(next === 0 ? "idle" : next >= THRESHOLD ? "armed" : "pulling");
      });
    }

    async function onTouchEnd() {
      if (startY.current == null) return;
      const wasArmed = pullRef.current >= THRESHOLD;
      startY.current = null;

      if (!wasArmed) {
        setPull(0);
        setPhase("idle");
        return;
      }

      setPhase("refreshing");
      setPull(THRESHOLD);
      try {
        await runAirtableSync();
        router.refresh();
      } catch {
        // Schluck den Fehler — UI bleibt ruhig, Cron-Sync läuft sowieso parallel.
      } finally {
        // Kleines Plateau, damit der Spinner kurz stehen bleibt und es sich
        // bewusst nach Aktion anfühlt, nicht nach Flackern.
        setTimeout(() => {
          setPull(0);
          setPhase("idle");
        }, 350);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [router]);

  const visible = pull > 0 || phase === "refreshing";
  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <>
      <div
        aria-hidden={!visible}
        className={cn(
          "pointer-events-none fixed left-0 right-0 z-50 flex justify-center transition-opacity",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{
          top: `${pull - 44}px`,
          // safe-area-inset-top respektieren falls Notch
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="rounded-full bg-white p-2.5 shadow-[0_4px_14px_rgba(15,23,42,0.18)]">
          <RefreshCw
            className={cn(
              "h-5 w-5 text-[color:var(--brand)]",
              phase === "refreshing" && "animate-spin",
            )}
            strokeWidth={2.5}
            style={
              phase === "refreshing"
                ? undefined
                : { transform: `rotate(${progress * 360}deg)` }
            }
          />
        </div>
      </div>

      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: pull === 0 ? "transform 250ms ease" : undefined,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </>
  );
}
