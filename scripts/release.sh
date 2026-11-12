#!/usr/bin/env sh
# Baut die App (Tests, Typecheck, Build) und pusht Quellcode + dist/ mit Datum nach GitHub.
# Aufruf: npm run release            → Commit "Build 2026-11-01 14:30"
#         npm run release -- "Notiz" → Commit "Build 2026-11-01 14:30 – Notiz"
# Schlägt ein Schritt fehl, wird nichts committet.
set -eu
cd "$(dirname "$0")/.."

# Ein Zeitstempel für Commit und App (Einstellungen → „Build …“), damit beide übereinstimmen.
stamp="$(date '+%Y-%m-%d %H:%M')"

npm test
BUILD_TIME="$stamp" npm run build

msg="Build $stamp${1:+ – $1}"

git add -A
if git diff --cached --quiet; then
  echo "Keine Änderungen seit dem letzten Commit – pushe nur."
else
  git commit -q -m "$msg"
  echo "Commit: $msg"
fi
git push -u origin HEAD
