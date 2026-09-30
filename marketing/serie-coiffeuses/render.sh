#!/usr/bin/env bash
# Rend les épisodes de la série en MP4 dans out/.
#   ./render.sh                  → tous les épisodes
#   ./render.sh 02               → un épisode (préfixe du fichier)
#   ./render.sh 02 --stills 1,5  → images fixes seulement (vérification)
# Installe ce qui manque : ffmpeg (via imageio-ffmpeg) et l'accès à Playwright.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tool="$here/../meta-ads"

if [ -z "${FFMPEG:-}" ]; then
  if command -v ffmpeg >/dev/null 2>&1; then
    FFMPEG=ffmpeg
  else
    python3 -c "import imageio_ffmpeg" 2>/dev/null || pip install -q imageio-ffmpeg
    FFMPEG="$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
  fi
fi
export FFMPEG

if ! (cd "$tool" && node --input-type=module -e "await import('playwright')" 2>/dev/null); then
  ln -sfn "$(npm root -g)" "$tool/node_modules"
fi

node "$tool/render.mjs" --dir "$here" "$@"
rm -f "$here"/out/*.wav
