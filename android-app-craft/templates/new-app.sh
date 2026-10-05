#!/usr/bin/env bash
# Starts a new Android app from templates/starter: copies it, moves the package directories and
# renames the package, namespace, applicationId, class names, theme, app name and emulator.
#
#   templates/new-app.sh <dest-dir> <AppName> <package.name>
#   templates/new-app.sh ~/Workspace/tides Tides com.example.tides
#
# AppName: a Kotlin identifier starting with a capital (Tides, TrailLog). It becomes the class
# prefix (StarterApp -> TidesApp, StarterTestRunner -> TidesTestRunner), the theme
# (Theme.Starter -> Theme.Tides), the app_name string and the Gradle project name.
# package.name: lower-case, dotted, two parts or more, no Java keywords (com.example.tides).
# The emulator becomes <appname>_phone on a port derived from the name, so two projects made
# with this script do not collide on one machine.
#
# It writes only under <dest-dir>, which must not exist or must be empty. It never runs Gradle.
# It writes <dest-dir>/local.properties (gitignored) with sdk.dir set to the SDK that
# scripts/android-env.sh finds, so Gradle finds the SDK even from a shell that did not source it.
set -euo pipefail
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
if [[ "${1:-}" == -h || "${1:-}" == --help ]]; then usage; exit 0; fi
if [[ $# -ne 3 ]]; then usage >&2; exit 2; fi

dest="$1"
app="$2"
package="$3"
starter="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/starter"
old_package="com.example.starter"
old_path="com/example/starter"

[[ -d "$starter/app" ]] || { echo "No starter project at $starter." >&2; exit 1; }
if [[ ! "$app" =~ ^[A-Z][A-Za-z0-9]*$ ]]; then
  echo "AppName must be a Kotlin identifier starting with a capital letter (got '$app')." >&2
  exit 2
fi
if [[ ! "$package" =~ ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$ ]]; then
  echo "package.name must be lower-case and dotted, like com.example.tides (got '$package')." >&2
  exit 2
fi
if [[ "$package" == "$old_package" || "$package" == "$old_package".* ]]; then
  echo "Choose a package outside $old_package." >&2
  exit 2
fi
for part in ${package//./ }; do
  case "$part" in
    abstract | boolean | byte | case | catch | char | class | const | continue | default | do | double | else | enum | extends | final | finally | float | for | goto | if | implements | import | instanceof | int | interface | long | native | new | package | private | protected | public | return | short | static | super | switch | synchronized | this | throw | throws | transient | try | void | volatile | while | as | fun | in | is | object | typealias | val | var | when | null | true | false)
      echo "'$part' is a Java or Kotlin keyword and cannot be a package segment." >&2
      exit 2 ;;
  esac
done
if [[ -e "$dest" && -n "$(ls -A "$dest" 2>/dev/null)" ]]; then
  echo "$dest exists and is not empty. Pick a new directory." >&2
  exit 1
fi

new_path="${package//.//}"
lower="$(printf '%s' "$app" | tr '[:upper:]' '[:lower:]')"
# An even port in the emulator console range (5554-5682), spread by the name, and clear of the
# low ports an emulator started without -port takes first (5554, 5556, ...).
sum="$(printf '%s' "$app" | cksum | awk '{ print $1 }')"
port=$((5600 + 2 * (sum % 40)))

mkdir -p "$dest"
dest="$(cd "$dest" && pwd)"
# Machine-local and generated state never travels with the template.
(cd "$starter" && tar -cf - \
  --exclude './build' --exclude '*/build' --exclude './.gradle' --exclude './.kotlin' \
  --exclude './.tools' --exclude './local.properties' --exclude '.DS_Store' .) | (cd "$dest" && tar -xf -)

# Move every source root's com/example/starter to the new package path. Through a temporary
# directory, so a new package that shares a prefix with the old one cannot nest into itself.
moved=()
while IFS= read -r dir; do moved+=("$dir"); done < <(find "$dest" -type d -path "*/$old_path" | sort)
for dir in ${moved[@]+"${moved[@]}"}; do
  root="${dir%/"$old_path"}"
  staging="$root/.new-app-move"
  mv "$dir" "$staging"
  rmdir -p "$(dirname "$dir")" 2>/dev/null || true
  mkdir -p "$(dirname "$root/$new_path")"
  mv "$staging" "$root/$new_path"
done

# Files named after the template (StarterApp.kt, StarterTestRunner.kt, ...).
renamed=()
while IFS= read -r file; do renamed+=("$file"); done < <(find "$dest" -type f -name '*Starter*' | sort)
for file in ${renamed[@]+"${renamed[@]}"}; do
  base="$(basename "$file")"
  mv "$file" "$(dirname "$file")/${base//Starter/$app}"
done

# Text: package first (dotted and as a path, as in proguard and ART-profile rules), then every
# word that starts with Starter, then lower-case identifiers (starter_phone, starter-shots) and
# the emulator port. Prose such as "the starter's sample data" is left alone.
texts=()
while IFS= read -r file; do texts+=("$file"); done < <(find "$dest" -type f \( \
  -name '*.kt' -o -name '*.kts' -o -name '*.xml' -o -name '*.pro' -o -name '*.toml' -o \
  -name '*.sh' -o -name '*.py' -o -name '*.pbtxt' -o -name '*.md' -o -name '*.txt' -o \
  -name '*.properties' -o -name '*.example' -o -name '*.json' -o -name '.gitignore' \) | sort)
for file in ${texts[@]+"${texts[@]}"}; do
  OLD_PKG="$old_package" NEW_PKG="$package" OLD_PATH="$old_path" NEW_PATH="$new_path" \
    APP="$app" LOWER="$lower" PORT="$port" perl -pi -e '
      s/\Q$ENV{OLD_PKG}\E/$ENV{NEW_PKG}/g;
      s/\Q$ENV{OLD_PATH}\E/$ENV{NEW_PATH}/g;
      s/(?<![A-Za-z0-9])Starter/$ENV{APP}/g;   # also R.style.Theme_Starter
      s/(?<![A-Za-z0-9])starter(?=[-_])/$ENV{LOWER}/g;   # starter_phone, starter-shots
      s/\b5584\b/$ENV{PORT}/g;
    ' "$file"
done

chmod +x "$dest/gradlew"
find "$dest/scripts" -type f \( -name '*.sh' -o -name '*.py' \) -exec chmod +x {} +

# local.properties from the example, with sdk.dir filled in when an SDK can be found. The env
# script is sourced in a subshell with phone discovery off: this needs no device.
sdk="$(APP_ENV_SKIP_PHONE=1 && source "$dest/scripts/android-env.sh" >/dev/null 2>&1 && printf '%s' "${ANDROID_HOME:-}" || true)"
if [[ -n "$sdk" ]]; then
  SDK="$sdk" perl -pe 's/^sdk\.dir=.*$/"sdk.dir=" . ($ENV{SDK} =~ s{\\}{\\\\}gr)/e' \
    "$dest/local.properties.example" >"$dest/local.properties"
  sdk_note="  local.properties: sdk.dir=$sdk"
else
  sdk_note="  local.properties: not written, no Android SDK found. Install one, then:
    cp local.properties.example local.properties   # and set sdk.dir"
fi

# The old package only as a whole name, so a new one that extends it (com.example.starterkit)
# is not reported as a leftover in every file.
leftovers="$(grep -rIlE -e "${old_package//./\\.}([^A-Za-z0-9_]|\$)" -e "$old_path([^A-Za-z0-9_]|\$)" \
  -e 'Starter' -e 'starter[-_]' "$dest" 2>/dev/null || true)"
echo "Created $app ($package) in $dest"
echo "  emulator: ${lower}_phone on port $port (scripts/start-emulator.sh)"
echo "$sdk_note"
if [[ -n "$leftovers" ]]; then
  echo "  Still mentions the template (check by hand):"
  printf '%s\n' "$leftovers" | sed "s|^$dest/|    |"
fi
cat <<EOF

Next (one line each: an agent's shell forgets JAVA_HOME between calls):
  cd "$dest" && git init
  source scripts/android-env.sh && ./gradlew :app:assembleDebug :app:testDebugUnitTest   # online the first time
Then fill in CLAUDE.md's What it is / Thesis / Hero moments and README.md.
EOF
