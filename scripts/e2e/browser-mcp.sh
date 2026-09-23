#!/usr/bin/env bash
# Launches the Playwright MCP server so Claude Code can drive a real browser
# (click, type, screenshot, read console/network) against the local stack.
#
# - On a developer machine the browser window is visible: you watch Claude use
#   the app live, side by side with the terminal.
# - In a headless cloud container (no DISPLAY) it runs headless on the
#   pre-installed Chromium; Claude sends screenshots instead.
set -euo pipefail

ARGS=(--browser chromium --isolated --output-dir "$(dirname "$0")/../../.e2e/mcp")

if [ -z "${DISPLAY:-}" ] && [ "$(uname)" = "Linux" ]; then
  ARGS+=(--headless --no-sandbox)
  CHROME="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1 || true)"
  [ -n "$CHROME" ] && ARGS+=(--executable-path "$CHROME")
fi

exec npx -y @playwright/mcp@0.0.82 "${ARGS[@]}"
