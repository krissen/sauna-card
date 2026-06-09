#!/usr/bin/env python3
"""Generate documentation screenshots of the manual adapter (DIY sauna fixture).

Shoots the "Manual / DIY" view in the sauna-test dashboard (path: /sauna-test/manual),
which points at the diy_ helper entities defined in hass-test/config/packages/diy_sauna.yaml.
Produces four screenshots in docs/screenshots/ (light + dark, two layouts):

    manual-dashboard{,-dark}.png   — status-dashboard card
    manual-thermostat{,-dark}.png  — thermostat-hero card
    manual-compact{,-dark}.png     — compact card
    manual-tiles{,-dark}.png       — status-dashboard with tiles card

Auth: hass-test `bot` long-lived token via HASS_TOKEN (or tmp/.ha_token).
Never committed — see scripts/screenshots/README.md.

Usage:
    export HASS_TOKEN=$(cat tmp/.ha_token)
    python scripts/screenshots/capture_manual.py            # shoot only (view already in storage)
    python scripts/screenshots/capture_manual.py --restart  # force HA restart before shooting
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/screenshots"
HASS_DIR = Path(os.environ.get("HASS_DIR", ROOT.parent / "hass-test"))
URL = os.environ.get("HASS_URL", "http://localhost:8123")
TOKEN = os.environ.get("HASS_TOKEN") or (
    (ROOT / "tmp/.ha_token").read_text().strip()
    if (ROOT / "tmp/.ha_token").exists()
    else ""
)

# Card index in the /sauna-test/manual view (skipping markdown cards):
# 0 = status-dashboard, 1 = thermostat-hero, 2 = compact, 3 = tiles
SHOTS = [
    ("manual-dashboard", 0),
    ("manual-thermostat", 1),
    ("manual-compact", 2),
    ("manual-tiles", 3),
]

READY_ENTITY = "climate.diy_sauna"


def restart_and_wait():
    subprocess.run(
        ["docker", "compose", "restart"], cwd=HASS_DIR, check=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        try:
            req = urllib.request.Request(
                f"{URL}/api/states/{READY_ENTITY}",
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    print("HA ready")
                    return
        except Exception:
            pass
        time.sleep(3)
    print("WARNING: HA did not report ready in time", file=sys.stderr)


def tokens_init(dark):
    t = {
        "access_token": TOKEN, "token_type": "Bearer", "expires_in": 315360000,
        "hassUrl": URL, "clientId": None, "expires": 2095679825000, "refresh_token": "",
    }
    return (
        "window.localStorage.setItem('hassTokens', %s);"
        "window.localStorage.setItem('selectedTheme', %s);"
        % (json.dumps(json.dumps(t)), json.dumps(json.dumps({"dark": dark})))
    )


def shoot():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        for dark in (False, True):
            suffix = "-dark" if dark else ""
            ctx = b.new_context(
                viewport={"width": 520, "height": 1800}, device_scale_factor=2
            )
            ctx.add_init_script(tokens_init(dark))
            pg = ctx.new_page()
            pg.goto(f"{URL}/sauna-test/manual", wait_until="networkidle")
            # Wait for at least 4 sauna-cards to render.
            for _ in range(40):
                if pg.locator("sauna-card ha-card").count() >= 4:
                    break
                pg.wait_for_timeout(500)
            pg.wait_for_timeout(900)
            n_cards = pg.locator("sauna-card").count()
            print(f"[{'dark' if dark else 'light'}] found {n_cards} sauna-card elements")
            for name, idx in SHOTS:
                out = OUT / f"{name}{suffix}.png"
                card = pg.locator("sauna-card").nth(idx)
                if card.count():
                    card.screenshot(path=str(out))
                    print(f"  shot {out.name}")
                else:
                    print(f"  WARNING: sauna-card #{idx} not found, skipping {out.name}",
                          file=sys.stderr)
            ctx.close()
        b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--restart", action="store_true",
                    help="restart HA before shooting")
    a = ap.parse_args()
    if not TOKEN:
        print("ERROR: set HASS_TOKEN (or create tmp/.ha_token)", file=sys.stderr)
        sys.exit(2)
    if a.restart:
        restart_and_wait()
    shoot()


if __name__ == "__main__":
    main()
