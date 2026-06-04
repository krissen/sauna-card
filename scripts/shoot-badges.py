#!/usr/bin/env python3
"""Capture a screenshot of the sauna-badge variant row from hass-test.

Auth via the hass-test long-lived token in the HASS_TOKEN env var (kept out of
git). Waits for the sauna-badge custom elements to be present and rendered (a
.b pill in the shadow root) before shooting, so a slow integration right after
an HA restart doesn't produce an empty image.

Usage:
    export HASS_TOKEN=<long-lived token>
    python scripts/shoot-badges.py --view sauna_test/badges --out tmp/badges-live.png
"""
import argparse, json, os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get("HASS_URL", "http://localhost:8123")
TOKEN = os.environ.get("HASS_TOKEN", "")


def tokens_init(dark):
    t = {
        "access_token": TOKEN,
        "token_type": "Bearer",
        "expires_in": 315360000,
        "hassUrl": URL,
        "clientId": None,
        "expires": 2095679825000,
        "refresh_token": "",
    }
    theme = {"dark": dark}
    return (
        "window.localStorage.setItem('hassTokens', %s);"
        "window.localStorage.setItem('selectedTheme', %s);"
        % (json.dumps(json.dumps(t)), json.dumps(json.dumps(theme)))
    )


def wait_ready(page, timeout_s=40):
    start = time.time()
    while time.time() - start < timeout_s:
        n = page.locator("sauna-badge").count()
        rendered = page.evaluate(
            "() => [...document.querySelectorAll('sauna-badge')]"
            ".filter(b=>b.shadowRoot && b.shadowRoot.querySelector('.b')).length"
        )
        if n and rendered >= n:
            return round(time.time() - start, 1)
        page.wait_for_timeout(500)
    return round(time.time() - start, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--view", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--timeout", type=int, default=40)
    a = ap.parse_args()
    if not TOKEN:
        print("ERROR: set HASS_TOKEN", file=sys.stderr)
        sys.exit(2)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(
            viewport={"width": 1400, "height": 600}, device_scale_factor=2
        )
        ctx.add_init_script(tokens_init(a.dark))
        pg = ctx.new_page()
        pg.goto(f"{URL}/{a.view}", wait_until="networkidle")
        waited = wait_ready(pg, a.timeout)
        # The badge row sits in hui-view-badges at the top of the view.
        row = pg.locator("hui-view-badges").first
        if row.count():
            row.screenshot(path=a.out)
        else:
            pg.screenshot(path=a.out, full_page=False)
        print(f"shot {a.out} (waited {waited}s, badges={pg.locator('sauna-badge').count()})")
        b.close()


if __name__ == "__main__":
    main()
