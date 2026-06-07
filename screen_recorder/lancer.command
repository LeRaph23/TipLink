#!/bin/bash
# === Lanceur automatique du Screen Recorder (Mac/Linux) ===
# Double-clique dessus (Mac) ou lance ./lancer.command

cd "$(dirname "$0")"

echo "Demarrage du screen recorder..."

if command -v python3 >/dev/null 2>&1; then
  (sleep 1 && open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null) &
  python3 -m http.server 8000
else
  open index.html 2>/dev/null || xdg-open index.html 2>/dev/null
fi
