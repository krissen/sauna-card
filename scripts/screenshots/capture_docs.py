#!/usr/bin/env python3
"""Generate the documentation card/badge screenshots from hass-test.

Reads the fixtures under docs/screenshots/fixtures/, writes a throwaway "Docs"
view into the sauna-test Lovelace storage (one card per `cards.json` entry, the
`badges.json` entries as the view's badges), restarts Home Assistant, then
shoots each element crop in both light and dark themes into docs/screenshots/.

Auth: the hass-test `bot` long-lived token via HASS_TOKEN (or tmp/.ha_token),
never committed. See scripts/screenshots/README.md.

Usage:
    export HASS_TOKEN=$(cat tmp/.ha_token)
    python scripts/screenshots/capture_docs.py            # setup + restart + shoot
    python scripts/screenshots/capture_docs.py --no-setup # shoot only (views exist)
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
FIX = ROOT / "docs/screenshots/fixtures"
OUT = ROOT / "docs/screenshots"
HASS_DIR = Path(os.environ.get("HASS_DIR", ROOT.parent / "hass-test"))
STORAGE = HASS_DIR / "config/.storage/lovelace.sauna_test"
URL = os.environ.get("HASS_URL", "http://localhost:8123")
TOKEN = os.environ.get("HASS_TOKEN") or (
    (ROOT / "tmp/.ha_token").read_text().strip()
    if (ROOT / "tmp/.ha_token").exists()
    else ""
)
READY_ENTITY = "climate.bastu_termostat"


def setup_view():
    cards = json.loads((FIX / "cards.json").read_text())
    badges = json.loads((FIX / "badges.json").read_text())
    d = json.loads(STORAGE.read_text())
    views = [v for v in d["data"]["config"]["views"] if v.get("path") != "docs"]
    views.append(
        {
            "title": "Docs",
            "path": "docs",
            "icon": "mdi:camera",
            "badges": badges,
            "cards": [c["config"] for c in cards],
        }
    )
    d["data"]["config"]["views"] = views
    STORAGE.write_text(json.dumps(d, ensure_ascii=False, indent=2))
    print(f"wrote Docs view: {len(cards)} cards, {len(badges)} badges")


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
            if urllib.request.urlopen(req, timeout=5).status == 200:
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
    cards = json.loads((FIX / "cards.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        for dark in (False, True):
            suffix = "-dark" if dark else ""
            ctx = b.new_context(
                viewport={"width": 900, "height": 1400}, device_scale_factor=2
            )
            ctx.add_init_script(tokens_init(dark))
            pg = ctx.new_page()
            pg.goto(f"{URL}/sauna-test/docs", wait_until="networkidle")
            # wait for all cards + badges to render (shadow-pierce)
            n = len(cards)
            for _ in range(40):
                ready_cards = pg.locator("sauna-card .ha-card, sauna-card ha-card").count()
                if pg.locator("sauna-card").count() >= n and ready_cards >= n:
                    break
                pg.wait_for_timeout(500)
            pg.wait_for_timeout(900)
            for i, c in enumerate(cards):
                out = OUT / f"{c['name']}{suffix}.png"
                pg.locator("sauna-card").nth(i).screenshot(path=str(out))
                print("shot", out.name)
            row = pg.locator("hui-view-badges").first
            if row.count():
                out = OUT / f"badge-row{suffix}.png"
                row.screenshot(path=str(out))
                print("shot", out.name)
            ctx.close()
        b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-setup", action="store_true", help="skip storage edit + restart")
    a = ap.parse_args()
    if not TOKEN:
        print("ERROR: set HASS_TOKEN (or create tmp/.ha_token)", file=sys.stderr)
        sys.exit(2)
    if not a.no_setup:
        setup_view()
        restart_and_wait()
    shoot()


if __name__ == "__main__":
    main()
