#!/usr/bin/env python3
"""Welche Erklärvideos sind von geänderten Dateien betroffen? (Ole, 15.11.2026)

  python3 tools/erklaervideos/betroffen.py                 # Änderungen seit origin/claude/facebook-ad-media-buyer-GdTgt (Produktion)
  python3 tools/erklaervideos/betroffen.py HEAD~5..HEAD    # beliebiger git-Bereich

Grobe Zuordnung Datei-Muster → Video. Ein Treffer heißt „prüfen“, nicht „neu aufnehmen“ (README Abschnitt 2).
"""
import re
import subprocess
import sys

VIDEOS = {
    "Kurz": [r"src/app/buyer/page\.tsx", r"src/app/buyer/(chats|kontakte|wachstum)/", r"src/components/(buyer-shell|heute|first-day|lead-detail)", r"src/components/hilfe"],
    "Ausführlich": [r"src/app/buyer/(page\.tsx|chats|kontakte|leads|wachstum|zahlen|kalender|team|termine)/?", r"src/components/(buyer-shell|heute|lead-detail|lead-actions|lead-history|pipeline|anruf|funnel|hilfe)", r"src/app/buyer/@modal/"],
    "WhatsApp verbinden": [r"src/app/buyer/(einrichtung|whatsapp-verbinden)/", r"src/lib/whatsapp/(connect|self-connect|connect-guide|dialog360)", r"src/components/whatsapp-guide"],
}


def main() -> None:
    rng = sys.argv[1] if len(sys.argv) > 1 else "origin/claude/facebook-ad-media-buyer-GdTgt..HEAD"
    files = subprocess.run(["git", "diff", "--name-only", rng], capture_output=True, text=True, check=True).stdout.split()
    hits = {v: sorted({f for f in files for p in pats if re.search(p, f)}) for v, pats in VIDEOS.items()}
    any_hit = False
    for video, fs in hits.items():
        if fs:
            any_hit = True
            print(f"Video „{video}“ prüfen ({len(fs)} Dateien):")
            for f in fs[:12]:
                print(f"  {f}")
    if not any_hit:
        print("Keine Video-Seiten geändert.")


if __name__ == "__main__":
    main()
