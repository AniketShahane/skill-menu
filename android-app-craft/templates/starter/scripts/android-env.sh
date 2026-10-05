#!/usr/bin/env bash
# Finds the JDK, the Android SDK and the personal phone for every other script.
#
#   source scripts/android-env.sh    from bash or zsh, before ./gradlew or adb in a fresh shell
#   scripts/android-env.sh           run it: prints what it found and changes nothing
#
# Values already set win. JDK: 21, else 17. The system default JDK is often too new for this
# AGP/Gradle pair, and the Gradle *launcher* needs JAVA_HOME even when org.gradle.java.home is
# set (flick:CLAUDE.md:14-19).
#
# The phone: set APP_PHONE_SERIAL to its adb id or to its hardware serial
# (`adb shell getprop ro.serialno`) in your shell profile, never in this repository. The match
# works over USB (adb id = serial) and over Wireless debugging (adb id = a network name or
# address). With APP_PHONE_SERIAL unset, a lone attached non-emulator device is used. The result
# is exported as APP_PHONE, the id to pass to `adb -s`. An emulator is never picked.
# Finding it runs `adb shell getprop` on each attached non-emulator device, so it is skipped when
# APP_SERIAL is already set (the scripts then use that device) or when APP_ENV_SKIP_PHONE=1
# (start-emulator.sh and test-emulator.sh set it: emulator-only work never talks to a phone).
#
# Sourced, this file does not change your shell's options, so it does not `set -euo pipefail`
# itself; run directly, it does.

app_env_executed=0
if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  app_env_executed=1
  if [[ "${1:-}" == -h || "${1:-}" == --help ]]; then
    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
    exit 0
  fi
fi

if [[ -z "${JAVA_HOME:-}" ]]; then
  for app_jdk in \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    "$( [[ -x /usr/libexec/java_home ]] && /usr/libexec/java_home -v 21 2>/dev/null || true )" \
    /usr/lib/jvm/java-21-openjdk-amd64 /usr/lib/jvm/java-21-openjdk \
    /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
    /usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
    "$( [[ -x /usr/libexec/java_home ]] && /usr/libexec/java_home -v 17 2>/dev/null || true )" \
    /usr/lib/jvm/java-17-openjdk-amd64 /usr/lib/jvm/java-17-openjdk; do
    if [[ -n "$app_jdk" && -x "$app_jdk/bin/java" ]]; then
      export JAVA_HOME="$app_jdk"
      break
    fi
  done
  unset app_jdk
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  for app_sdk in \
    "${ANDROID_SDK_ROOT:-}" \
    "$HOME/Library/Android/sdk" \
    "$HOME/Android/Sdk" \
    /opt/homebrew/share/android-commandlinetools \
    /usr/local/share/android-commandlinetools; do
    if [[ -n "$app_sdk" && -x "$app_sdk/platform-tools/adb" ]]; then
      export ANDROID_HOME="$app_sdk"
      break
    fi
  done
  unset app_sdk
fi

if [[ -n "${JAVA_HOME:-}" ]]; then export PATH="$JAVA_HOME/bin:$PATH"; fi
if [[ -n "${ANDROID_HOME:-}" ]]; then
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
fi

# True when the adb id names an emulator: by name, or by the emulator's hardware property
# (ranchu/goldfish, the same test Dash's requireEmulator() makes on the device side).
app_is_emulator() {
  if [[ "$1" == emulator-* ]]; then return 0; fi
  case "$(adb -s "$1" shell getprop ro.hardware </dev/null 2>/dev/null | tr -d '\r')" in
    ranchu | goldfish) return 0 ;;
  esac
  return 1
}

if [[ -z "${APP_PHONE:-}" && -z "${APP_SERIAL:-}" && "${APP_ENV_SKIP_PHONE:-0}" != 1 ]] &&
  command -v adb >/dev/null 2>&1; then
  app_want="${APP_PHONE_SERIAL:-}"
  app_seen=0
  app_only=""
  for app_device in $(adb devices 2>/dev/null | awk 'NR > 1 && $2 == "device" { print $1 }'); do
    if app_is_emulator "$app_device"; then continue; fi
    if [[ -n "$app_want" ]]; then
      if [[ "$app_device" == *"$app_want"* ]] ||
        [[ "$(adb -s "$app_device" shell getprop ro.serialno </dev/null 2>/dev/null | tr -d '\r')" == "$app_want" ]]; then
        export APP_PHONE="$app_device"
        break
      fi
    else
      app_seen=$((app_seen + 1))
      app_only="$app_device"
    fi
  done
  if [[ -z "$app_want" && "$app_seen" -eq 1 ]]; then export APP_PHONE="$app_only"; fi
  unset app_want app_seen app_only app_device
fi

if [[ "$app_env_executed" -eq 1 ]]; then
  echo "JAVA_HOME=${JAVA_HOME:-<not found: install JDK 21, e.g. brew install openjdk@21>}"
  if [[ -n "${JAVA_HOME:-}" ]]; then "$JAVA_HOME/bin/java" -version 2>&1 | head -n 1; fi
  echo "ANDROID_HOME=${ANDROID_HOME:-<not found: install the SDK or brew install --cask android-commandlinetools>}"
  if [[ -n "${APP_PHONE:-}" ]]; then
    echo "APP_PHONE=$APP_PHONE"
  elif [[ -n "${APP_SERIAL:-}" || "${APP_ENV_SKIP_PHONE:-0}" == 1 ]]; then
    echo "APP_PHONE: not looked for (APP_SERIAL or APP_ENV_SKIP_PHONE is set)"
  elif [[ -n "${APP_PHONE_SERIAL:-}" ]]; then
    echo "APP_PHONE: no attached device matches APP_PHONE_SERIAL (is the phone connected and authorised?)"
  else
    echo "APP_PHONE: not chosen. Set APP_PHONE_SERIAL, or attach exactly one phone. adb devices:"
    if command -v adb >/dev/null 2>&1; then adb devices -l | sed 1d; fi
  fi
fi
unset app_env_executed
