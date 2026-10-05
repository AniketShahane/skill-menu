#!/bin/zsh
# Render scenes listed in video.json.
#   ./render.sh lint [Scene ...]   seconds: run every scene without drawing frames; reports overruns,
#                                  off-frame and overlapping text (fix these before rendering)
#   ./render.sh [l] [Scene ...]    preview render (480p15)
#   ./render.sh h [Scene ...]      final render (1080p60)
# Steps: voice all narration first (rate-limit friendly, cached), then run scenes in parallel,
# each in its own media dir (parallel renders sharing one dir delete each other's LaTeX temp files).
set -u
cd "${0:A:h}"
[[ $PWD == *\'* ]] && { echo "Manim can't render inside a path containing an apostrophe ($PWD). Move or rename the project."; exit 1; }
VENV=${EXPLAINER_VENV:-$HOME/.local/share/explainer-video/venv}
PY=$VENV/bin/python
[[ -x $PY ]] || { echo "No venv at $VENV — run the skill's scripts/setup.sh first"; exit 1; }
for d in ~/Library/TinyTeX/bin/universal-darwin ~/.TinyTeX/bin/*-linux(N); do [[ -d $d ]] && export PATH=$d:$PATH; done
JOBS=${JOBS:-$(( $(sysctl -n hw.ncpu 2>/dev/null || nproc) / 2 ))}; (( JOBS >= 1 )) || JOBS=1

Q=${1:-l}; [[ $# -gt 0 ]] && shift
case $Q in lint) FLAGS=(-ql -s) ;; l|m|h|k) FLAGS=(-q$Q) ;; *) echo "first argument: lint, l, m, h or k"; exit 1;; esac

SCENES=("${(@f)$($PY -c 'import json;[print(s["file"]+":"+s["class"]) for s in json.load(open("video.json"))["scenes"]]')}")
sel=()
for s in $SCENES; do c=${s##*:}; if [[ $# -eq 0 || " $* " == *" $c "* ]]; then sel+=$s; fi; done
[[ ${#sel} -gt 0 ]] || { echo "no matching scenes"; exit 1; }

echo "== voicing narration"
$PY tts.py --prepass ${sel%%:*} || { echo "narration failed — fix above, cached lines are kept"; exit 1; }

echo "== ${Q/lint/linting} ${#sel} scene(s) with $JOBS jobs"
mkdir -p logs
fail=0
pids=()
trap 'for p in $pids; do pkill -P $p; kill $p; done 2>/dev/null; echo "\ninterrupted"; exit 130' INT TERM
for s in $sel; do
  f=${s%%:*}; c=${s##*:}
  while (( ${#pids} >= JOBS )); do
    for p in $pids; do kill -0 $p 2>/dev/null || { wait $p || fail=1; pids=(${pids:#$p}); }; done; sleep 0.3
  done
  ( $VENV/bin/manim $FLAGS --media_dir media_$c $f $c > logs/$c.log 2>&1 && echo "  ok    $c" || { echo "  FAIL  $c  (logs/$c.log)"; exit 1; } ) &
  pids+=$!
done
for p in $pids; do wait $p || fail=1; done

if (( fail )); then
  echo "== some scenes failed; tail of their logs:"
  for s in $sel; do c=${s##*:}; grep -q "Traceback\|Error" logs/$c.log && { echo "--- $c"; grep -E "Error|error:|❱" logs/$c.log | tail -6; }; done
  exit 1
fi
if [[ $Q == lint ]]; then
  echo "== issues"
  if $PY qa.py --issues; then echo "== lint clean. next: ./render.sh"; exit 0
  else echo "== fix the issues above (or explain each one), then lint again"; exit 2; fi
fi
$PY qa.py --issues >/dev/null || echo "== there are logged issues: $PY qa.py --issues"
echo "== done. next: $PY qa.py $Q   (beat sheets + issues)"
