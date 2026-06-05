#!/usr/bin/env python3
"""Generate the visual-editor screenshots (card + badge), light and dark.

Loads the deployed bundle on a standalone same-origin page (so Home Assistant's
SPA can't wipe the injected element), stubs `ha-icon`, and renders each editor
from docs/screenshots/fixtures/editors.json. The standalone page shows the
card/badge's own configurable sections (tile list / slots / badge options); the
standard `ha-form` fields (name/device/layout/language/controls) render above
them inside real Home Assistant.

No auth: the bundle is served publicly at `/local/...`, so this script needs no
token. A temp HTML file is written under hass-test's www and removed afterwards.

Usage:
    python scripts/screenshots/capture_editors.py
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "docs/screenshots/fixtures"
OUT = ROOT / "docs/screenshots"
HASS_DIR = Path(os.environ.get("HASS_DIR", ROOT.parent / "hass-test"))
WWW = HASS_DIR / "config/www/community/sauna-card"
URL = os.environ.get("HASS_URL", "http://localhost:8123")

LIGHT = {
    "--primary-text-color": "#212121", "--secondary-text-color": "#727272",
    "--card-background-color": "#fff", "--secondary-background-color": "#e9e9e9",
    "--divider-color": "#cfcfcf", "--primary-color": "#03a9f4", "--error-color": "#db4437",
    "bg": "#f3f3f3",
}
DARK = {
    "--primary-text-color": "#e1e1e1", "--secondary-text-color": "#9b9b9b",
    "--card-background-color": "#1c1c1c", "--secondary-background-color": "#2b2b2b",
    "--divider-color": "#3f3f3f", "--primary-color": "#2196f3", "--error-color": "#e15b4c",
    "bg": "#111",
}


def page_html(tag, config, theme):
    vars_css = ";".join(f"{k}:{v}" for k, v in theme.items() if k.startswith("--"))
    return f"""<!doctype html><html lang="sv"><head><meta charset="utf-8"/>
<style>
 body{{background:{theme['bg']};margin:0;font-family:-apple-system,Roboto,sans-serif;{vars_css};color:var(--primary-text-color)}}
 #host{{max-width:520px;padding:16px}}
 ha-icon{{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--secondary-text-color)}}
</style>
<script type="module" src="./sauna-card.js"></script></head><body>
<div id="host"></div>
<script>
 customElements.define('ha-icon', class extends HTMLElement{{
   static get observedAttributes(){{return['icon'];}}
   attributeChangedCallback(){{this._r();}}
   connectedCallback(){{this._r();}}
   _r(){{const m={{'mdi:drag':'\\u283f','mdi:chevron-up':'\\u25b2','mdi:chevron-down':'\\u25bc','mdi:close':'\\u2715','mdi:restore':'\\u21ba'}};this.textContent=m[this.getAttribute('icon')||'']||'\\u2022';}}
 }});
 customElements.whenDefined('{tag}').then(()=>{{
   const ed=document.createElement('{tag}');
   ed.hass={{states:{{}},entities:{{}},devices:{{}},language:'sv',locale:{{language:'sv'}}}};
   ed.setConfig({json.dumps(config)});
   document.getElementById('host').appendChild(ed);
 }});
</script></body></html>"""


def main():
    editors = json.loads((FIX / "editors.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    WWW.mkdir(parents=True, exist_ok=True)
    tmp = WWW / "_doc-editor.html"
    tags = {"editor-card": "sauna-card-editor", "editor-badge": "sauna-badge-editor"}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True)
            for name, config in editors.items():
                for dark in (False, True):
                    theme = DARK if dark else LIGHT
                    tmp.write_text(page_html(tags[name], config, theme))
                    ctx = b.new_context(
                        viewport={"width": 560, "height": 720}, device_scale_factor=2
                    )
                    pg = ctx.new_page()
                    pg.goto(
                        f"{URL}/local/community/sauna-card/_doc-editor.html",
                        wait_until="networkidle",
                    )
                    pg.wait_for_timeout(1200)
                    out = OUT / f"{name}{'-dark' if dark else ''}.png"
                    pg.locator("#host").screenshot(path=str(out))
                    print("shot", out.name)
                    ctx.close()
            b.close()
    finally:
        if tmp.exists():
            tmp.unlink()


if __name__ == "__main__":
    main()
