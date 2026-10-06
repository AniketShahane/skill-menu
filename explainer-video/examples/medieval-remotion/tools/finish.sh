#!/bin/zsh
# Retry narration until every line is voiced, then render the remaining chapters at 1080p and assemble.
cd "${0:A:h:h}"
until ! uv run python tools/voice_report.py | grep -q missing; do
  uv run python tools/voice.py >/dev/null 2>&1
  uv run python tools/voice_report.py | head -1
  uv run python tools/voice_report.py | grep -q missing && sleep 180
done
uv run python tools/voice.py --only=X | tail -1   # copy clips + final timing.json
(cd video && node scripts/render.mjs h crisis lessons credits) || exit 1
uv run python tools/assemble.py h
