#!/bin/zsh
# Scaffold a new explainer-video project. Run this FIRST, before writing the script.
#   scripts/new_project.sh <dir> "<Video title>"
# Copies the kit (vkit.py, tts.py, render.sh, qa.py, assemble.py) so each project is self-contained
# and keeps working even if the skill changes later. Never overwrites existing files.
set -eu
[[ $# -ge 1 ]] || { echo "usage: new_project.sh <dir> \"<title>\""; exit 1; }
SKILL=${0:A:h:h}
DIR=${1:A}
TITLE=${2:-Untitled explainer}
[[ $DIR == *\'* ]] && { echo "Choose a path without an apostrophe: Manim fails to render inside one."; exit 1; }
[[ -e $DIR/video.json ]] && { echo "$DIR already has a video.json — it's a project already; nothing changed"; exit 1; }
mkdir -p $DIR
put() { if [[ -e $2 ]]; then echo "  kept existing ${2:t}"; else cp $1 $2; fi; }
for f in vkit.py tts.py render.sh qa.py assemble.py; do put $SKILL/kit/$f $DIR/$f; done
chmod +x $DIR/render.sh
put $SKILL/templates/s1_intro.py $DIR/s1_intro.py
put $SKILL/templates/SCRIPT.md $DIR/SCRIPT.md
python3 -c '
import json, sys
cfg = json.load(open(sys.argv[3])); cfg["title"] = sys.argv[2]
json.dump(cfg, open(sys.argv[1], "w"), indent=2)
' "$DIR/video.json" "$TITLE" "$SKILL/templates/video.json"
[[ -e $DIR/.gitignore ]] || printf '%s\n' media/ 'media_*/' logs/ qa/ out/ __pycache__/ > $DIR/.gitignore
echo "created $DIR"
echo "next: fill in $DIR/SCRIPT.md, then write scenes; check them with: cd $DIR && ./render.sh lint"
