"use client";

// Folien untereinander, auf die Breite skaliert (Kundenlink, nur lesen).

import { useEffect, useRef, useState } from "react";

export function FolienListe({ css, folien }: { css: string; folien: { id: string; html: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const fit = () => ref.current && setScale(ref.current.clientWidth / 1280);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div ref={ref} className="flex flex-col gap-4" data-kundenfolien>
      <style>{`${css}\n.nurlesen .bs,.nurlesen .wahl,.nurlesen .teil,.nurlesen .st{cursor:default;pointer-events:none}`}</style>
      {folien.map((f) => (
        <div key={f.id} className="relative w-full overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] shadow-[var(--shadow-sm)]" style={{ aspectRatio: "16 / 9" }}>
          <div className="deck nurlesen absolute left-0 top-0" style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: f.html }} />
        </div>
      ))}
    </div>
  );
}
