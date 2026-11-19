#!/usr/bin/env python3
"""Complete Chrome first-run on an isolated Android CI emulator.

Used ONLY to verify that the installed TradingFiew app reaches its page.
Browser onboarding must not be mistaken for successful app startup.
"""
import re
import subprocess
import time
import xml.etree.ElementTree as ET

CHOICES = (
    "Accept & continue", "Accept and continue", "Use without an account",
    "No thanks", "Not now", "Continue without an account",
    "Continue as guest", "Got it", "Skip", "Decline", "Turn off",
)


def capture_ui():
    subprocess.run(
        ["adb", "shell", "uiautomator", "dump", "/sdcard/window.xml"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=50,
        check=False,
    )
    result = subprocess.run(
        ["adb", "exec-out", "cat", "/sdcard/window.xml"],
        capture_output=True,
        timeout=20,
        check=False,
    )
    try:
        return ET.fromstring(result.stdout)
    except ET.ParseError:
        return None


for attempt in range(7):
    root = capture_ui()
    if root is None:
        time.sleep(3)
        continue
    pressed = False
    for item in root.iter("node"):
        label = (
            item.attrib.get("text", "") + " " + item.attrib.get("content-desc", "")
        ).lower()
        if not any(word.lower() in label for word in CHOICES):
            continue
        bounds = re.search(
            r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",
            item.attrib.get("bounds", ""),
        )
        if bounds is None:
            continue
        left, top, right, bottom = [int(value) for value in bounds.groups()]
        subprocess.run(
            ["adb", "shell", "input", "tap",
             str((left + right) // 2), str((top + bottom) // 2)],
            check=True,
            timeout=20,
        )
        print("Completed Chrome onboarding step", attempt + 1, flush=True)
        pressed = True
        time.sleep(5)
        break
    if not pressed:
        print("Chrome onboarding no longer has a recognized dialog.", flush=True)
        break
