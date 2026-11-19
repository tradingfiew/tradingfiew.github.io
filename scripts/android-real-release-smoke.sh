#!/usr/bin/env bash
# Used by reactivecircus/android-emulator-runner. Keep all multi-line logic
# in ONE bash script: the action runs individual YAML 'script:' lines via sh.
set -euo pipefail
mkdir -p release-smoke
capture() {
  adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/window.xml release-smoke/final-ui.xml >/dev/null 2>&1 || true
  adb exec-out screencap -p > release-smoke/final.png || true
  adb shell dumpsys activity activities > release-smoke/activities.txt || true
  adb logcat -d -v time > release-smoke/logcat.txt || true
}
trap capture EXIT
adb wait-for-device
adb install -r release-smoke/tradingfiew-release.apk
adb shell am start -a android.intent.action.VIEW \
   -d 'https://tradingfiew.github.io/?native=1' -p com.android.chrome || true
sleep 7
python3 scripts/android-accept-chrome-first-run.py
adb shell input keyevent KEYCODE_HOME
sleep 2
adb logcat -c
adb shell am start -W -n \
   com.ribhlab.tradingfiew/com.ribhlab.tradingfiew.LauncherActivity \
   > release-smoke/launcher.txt 2>&1
sleep 18
capture
cat release-smoke/launcher.txt
if ! grep -q 'Status: ok' release-smoke/launcher.txt; then
   echo "::error::The signed TradingFiew native launcher did not start"
   exit 1
fi
# Detect ONLY an AndroidRuntime crash specifically for this signed app.
if grep -A 20 'FATAL EXCEPTION' release-smoke/logcat.txt |
   grep -Eq 'Process: com.ribhlab.tradingfiew(,|$)'; then
   echo "::error::The signed TradingFiew release process crashed"
   exit 1
fi
if grep -Eiq 'Welcome to Chrome|Accept &amp; continue' release-smoke/final-ui.xml; then
   echo "::error::Only Chrome first-run is visible; app UI has not loaded"
   exit 1
fi
if ! grep -Eiq 'TradingFiew|USTEC|Market Watch|Auto SMC|Smart Money|Markets' release-smoke/final-ui.xml; then
   echo "::error::Cannot verify real TradingFiew UI; inspect screenshot + logs"
   exit 1
fi
echo 'Signed release reached the real TradingFiew interface without a fatal Android crash.' >> "$GITHUB_STEP_SUMMARY"
