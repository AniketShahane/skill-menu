#!/usr/bin/env bash
# new-app.sh: starts a new SwiftUI app from this kit: a building project with a kept tab pager, a
# card that flies apart into its page, UI tests, and the motion check.
#
#   templates/scripts/new-app.sh NAME DEST_DIR [--bundle-id ID] [--no-sim]
#
# It copies templates/starter (the app-specific skeleton) plus the kit's shared files
# (app/*.swift and app/CardFlight/*.swift into NAME/Kit, CardFlight's README into
# docs/CardFlight.md, uitests/*.swift, scripts/*, project.yml, Config/, motion-budgets.json unless
# the starter has its own, Secrets.example.xcconfig and a Secrets.xcconfig from it), renames MyApp to NAME in file names and contents (myapp to name,
# com.example.myapp to the bundle id), and runs XcodeGen. Unless --no-sim, it then creates a
# private simulator "NAME Dev" from the newest iPhone Pro and iOS runtime, prints its UDID, builds,
# and runs SmokeTests through scripts/run-ui-tests.sh.
#
# Lessons it encodes (references/setup-and-tooling.md):
# - The project is generated (XcodeGen); the .xcodeproj is gitignored and never merged.
# - A simulator of your own, targeted by UDID: shared ones get apps and permissions changed under you.
# - DEVELOPER_DIR points at Xcode: xcode-select often points at the Command Line Tools.
# - bash 3.2 (macOS /bin/bash) and BSD tools: perl for in-place edits, no sed -i quirks.
set -euo pipefail

usage() {
  cat <<'EOF'
usage: new-app.sh NAME DEST_DIR [--bundle-id ID] [--no-sim]

  NAME            the app's name, a Swift identifier starting with a capital (e.g. Sample, TrailLog)
  DEST_DIR        where the project goes; must not exist, or be empty
  --bundle-id ID  default com.example.<name in lower case>
  --no-sim        only generate the project: no simulator, build or tests
EOF
}

fail() { echo "new-app: $*" >&2; exit 2; }

NAME= DEST= BUNDLE= SIM=1
while (( $# )); do
  case $1 in
    -h|--help) usage; exit 0 ;;
    --no-sim) SIM=0; shift ;;
    --bundle-id) [[ -n ${2:-} ]] || fail "--bundle-id needs a value"; BUNDLE=$2; shift 2 ;;
    -*) usage >&2; fail "unknown option $1" ;;
    *)
      if [[ -z $NAME ]]; then NAME=$1
      elif [[ -z $DEST ]]; then DEST=$1
      else usage >&2; fail "unexpected argument $1"; fi
      shift ;;
  esac
done
[[ -n $NAME && -n $DEST ]] || { usage >&2; exit 2; }
[[ $NAME =~ ^[A-Z][A-Za-z0-9]*$ ]] || fail "NAME must be a Swift identifier starting with a capital letter: $NAME"
[[ $NAME != MyApp ]] || fail "pick a name of your own (MyApp is the placeholder)"
LOWER=$(echo "$NAME" | tr '[:upper:]' '[:lower:]')
BUNDLE=${BUNDLE:-com.example.$LOWER}
[[ $BUNDLE =~ ^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$ ]] || fail "not a bundle id: $BUNDLE"
if [[ -e $DEST ]]; then
  [[ -d $DEST ]] || fail "$DEST exists and is not a folder"
  [[ -z $(ls -A "$DEST") ]] || fail "$DEST is not empty; refusing to overwrite it"
fi

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
KIT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
STARTER=$KIT/starter
[[ -d $STARTER ]] || fail "no starter at $STARTER"
command -v xcodegen >/dev/null || fail "XcodeGen is needed: brew install xcodegen"

mkdir -p "$DEST"
DEST=$(cd "$DEST" && pwd)

# 1. The starter, then the kit's shared files around it.
cp -R "$STARTER/." "$DEST/"
mkdir -p "$DEST/MyApp/Kit" "$DEST/MyAppUITests" "$DEST/scripts"
cp "$KIT"/app/*.swift "$DEST/MyApp/Kit/"
mkdir -p "$DEST/MyApp/Kit/CardFlight" "$DEST/docs"
cp "$KIT"/app/CardFlight/*.swift "$DEST/MyApp/Kit/CardFlight/"
# Outside the app folder: XcodeGen would bundle a .md in MyApp/ as a resource.
cp "$KIT/app/CardFlight/README.md" "$DEST/docs/CardFlight.md"
cp "$KIT"/uitests/*.swift "$DEST/MyAppUITests/"
for f in "$KIT"/scripts/*; do
  base=$(basename "$f")
  [[ -f $f && $base != new-app.sh ]] || continue
  cp "$f" "$DEST/scripts/"
done
[[ -f $DEST/project.yml ]] || cp "$KIT/project.yml" "$DEST/"
[[ -f $DEST/motion-budgets.json ]] || cp "$KIT/motion-budgets.json" "$DEST/"
cp -R "$KIT/Config" "$DEST/"
cp "$KIT/Secrets.example.xcconfig" "$DEST/"
cp "$KIT/Secrets.example.xcconfig" "$DEST/Secrets.xcconfig"
chmod +x "$DEST"/scripts/*.sh "$DEST"/scripts/*.py 2>/dev/null || true

# 2. MyApp -> NAME in contents (text files only), then in file and folder names, deepest first.
export NAME LOWER BUNDLE
find "$DEST" -type f ! -name '*.png' ! -name '.DS_Store' -print0 | while IFS= read -r -d '' f; do
  if LC_ALL=C grep -Iq . "$f" && LC_ALL=C grep -q -i 'myapp' "$f"; then
    perl -pi -e 's/com\.example\.myapp/$ENV{BUNDLE}/g; s/MyApp/$ENV{NAME}/g; s/myapp/$ENV{LOWER}/g' "$f"
  fi
done
find "$DEST" -depth -name '*MyApp*' -print0 | while IFS= read -r -d '' p; do
  dir=$(dirname "$p"); base=$(basename "$p")
  mv "$p" "$dir/${base//MyApp/$NAME}"
done
if grep -rIl 'MyApp' "$DEST" >/dev/null 2>&1; then
  echo "new-app: warning: MyApp is still in: $(grep -rIl 'MyApp' "$DEST" | tr '\n' ' ')" >&2
fi

# 3. The project.
(cd "$DEST" && xcodegen generate --quiet)
echo "created $DEST ($NAME, $BUNDLE)"

if (( ! SIM )); then
  cat <<EOF
next:
  cd "$DEST"
  xcrun simctl create "$NAME Dev" "iPhone 18 Pro"      # a simulator of your own; note its UDID
  scripts/run-ui-tests.sh <udid> SmokeTests
EOF
  exit 0
fi

# 4. A private simulator: the newest iOS runtime, and the newest iPhone Pro (not Max) it supports.
read -r RUNTIME DEVTYPE <<<"$(xcrun simctl list runtimes -j | python3 -c '
import json, re, sys
best = None
for r in json.load(sys.stdin)["runtimes"]:
    if r.get("platform", "iOS") != "iOS" or not r.get("isAvailable", False):
        continue
    version = tuple(int(x) for x in r["version"].split("."))
    phones = []
    for d in r.get("supportedDeviceTypes", []):
        m = re.fullmatch(r"iPhone (\d+) Pro", d["name"])
        if m:
            phones.append((int(m.group(1)), d["identifier"]))
    if phones and (best is None or version > best[0]):
        best = (version, r["identifier"], max(phones)[1])
if best:
    print(best[1], best[2])
')"
[[ -n ${RUNTIME:-} && -n ${DEVTYPE:-} ]] || fail "no available iOS runtime with an iPhone Pro (xcodebuild -downloadPlatform iOS)"
UDID=$(xcrun simctl create "$NAME Dev" "$DEVTYPE" "$RUNTIME")
echo "simulator: \"$NAME Dev\" $UDID (${DEVTYPE##*.} on ${RUNTIME##*.})"
echo "  it is yours: target it with id=$UDID; delete it with: xcrun simctl delete $UDID"

# 5. Build and run the smoke tests. The starter needs no permissions.
cd "$DEST"
PRIVACY="" scripts/run-ui-tests.sh "$UDID" SmokeTests
