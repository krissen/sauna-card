#!/usr/bin/env python3
"""Generate the running-state (heatup) card screenshots from hass-test.

The static layout/badge/editor shots come from `capture_docs.py` (driven by
`fixtures/cards.json`). The temperature-graph shots can't: the graph builds from
a live series of temperature samples, and a running heater isn't something we
start for a screenshot. Instead this drives the card by cloning its live `hass`
object in the browser and overriding entity states — the card only ever *reads*
`hass.states` for display, so this fully drives the visuals without touching the
integration or the real heater.

It writes the heatup shots (status-dashboard + thermostat-hero, light + dark):

    docs/screenshots/graph-heatup-dashboard{,-dark}.png
    docs/screenshots/graph-heatup-thermostat{,-dark}.png

with realistic telemetry (heater load, remaining time, a session in progress) so
the card reads as a genuinely running sauna rather than an empty 0 W / 0 min one.

The cooldown and whole-session (`graph-cooldown-*`, `graph-session-*`) shots are
captured from real recorder data — a live reconstructed cooldown after an actual
session — and are *not* regenerated here (see commits 98e2e32, 758901b).

Auth: the hass-test `bot` long-lived token via HASS_TOKEN (or tmp/.ha_token),
never committed. See scripts/screenshots/README.md.

Usage:
    export HASS_TOKEN=$(cat tmp/.ha_token)
    python scripts/screenshots/capture_states.py
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/screenshots"
URL = os.environ.get("HASS_URL", "http://localhost:8123")
TOKEN = os.environ.get("HASS_TOKEN") or (
    (ROOT / "tmp/.ha_token").read_text().strip()
    if (ROOT / "tmp/.ha_token").exists()
    else ""
)

# The /layouts view lists the three layouts (with markdown headers between them);
# the sauna-card locator skips the markdown, so card 0 is status-dashboard and
# card 1 is thermostat-hero. Card 2 (compact) is not shot here.
NAMES = ["dashboard", "thermostat"]


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


# Deep-walk the shadow DOM for every sauna-card and report each card's ha-card
# bounding box plus which graph phase is currently rendered.
FIND_CARDS = r"""
() => {
  const cards = [];
  const walk = (n) => {
    if (!n) return;
    if (n.tagName && n.tagName.toLowerCase() === 'sauna-card') cards.push(n);
    const kids = [];
    if (n.children) for (const c of n.children) kids.push(c);
    if (n.shadowRoot) for (const c of n.shadowRoot.children) kids.push(c);
    for (const k of kids) walk(k);
  };
  walk(document.body);
  return cards.map((c) => {
    const hc = c.shadowRoot && c.shadowRoot.querySelector('ha-card');
    const r = (hc || c).getBoundingClientRect();
    const sr = c.shadowRoot;
    return {
      x: r.x, y: r.y, w: r.width, h: r.height,
      heatup: !!(sr.querySelector('.graph') && !sr.querySelector('.graph.cooldown')),
      cap: sr.querySelector('.graph figcaption')?.textContent?.trim() || null,
    };
  });
}
"""

# Clone each card's live hass and force a heating state: power on, heating relay
# on, a current temperature of 76 climbing toward 90, plus realistic dashboard
# telemetry (heater load, energy so far, remaining time, one session today). The
# card's live sampler only timestamps with the wall clock, so to get a readable
# multi-minute time axis we then replace the heatup buffer with a synthetic ~25
# min rising series. switch.power and sensor.power share the translation_key
# "power", so entities are keyed by domain + key.
DRIVE_HEATUP = r"""
async () => {
  const cards = [];
  const walk = (n) => { if (!n) return;
    if (n.tagName && n.tagName.toLowerCase() === 'sauna-card') cards.push(n);
    const k = []; if (n.children) for (const c of n.children) k.push(c);
    if (n.shadowRoot) for (const c of n.shadowRoot.children) k.push(c);
    for (const c of k) walk(c); };
  walk(document.body);
  if (!cards.length) return { error: 'no cards' };
  const hass = cards[0].hass;
  const byKey = {};
  for (const [eid, e] of Object.entries(hass.entities || {})) {
    if (e && e.platform === 'harvia_sauna' && e.translation_key)
      byKey[eid.split('.')[0] + '.' + e.translation_key] = eid;
  }
  const fixed = {
    'switch.power': 'on',
    'binary_sensor.heat_on': 'on',
    'sensor.current_temperature': '76',
    'sensor.target_temperature': '90',
    'sensor.power': '6400',
    'sensor.energy': '2.6',
    'sensor.remaining_time': '38',
    'sensor.sessions_today': '1',
  };
  const states = { ...hass.states };
  for (const [k, v] of Object.entries(fixed)) {
    const id = byKey[k];
    if (id) states[id] = { ...states[id], entity_id: id, state: v,
      attributes: { ...(states[id]?.attributes || {}) } };
  }
  // Force English so captions/tiles match the other committed graph shots,
  // independent of the hass-test UI locale.
  const driven = { ...hass, states, language: 'en',
                   locale: { ...(hass.locale || {}), language: 'en' } };

  // A natural ~25 min heatup curve (decelerating rise 41 -> 76), spaced so the
  // start/middle/end clock-time axis reads as distinct minutes.
  const now = Date.now();
  const span = 25 * 60 * 1000, N = 10;
  const series = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    series.push({ t: now - span + f * span,
                  temp: Math.round((41 + 35 * (1 - Math.pow(1 - f, 1.8))) * 10) / 10 });
  }

  for (const c of cards) {
    // It's a doc shot of the feature, so enable the heatup graph regardless of
    // the view's config. Mutating _config directly (not setConfig) keeps state.
    c._config = { ...c._config, show_heatup_graph: true };
    // Apply the driven state once through the normal reactive path so the card
    // enters the heatup phase and renders the graph.
    c.hass = driven;
    await c.updateComplete;
    // Then lock hass to the driven object: Home Assistant re-pushes the real
    // hass every few seconds, which would revert the caption/tiles/status. A
    // no-op setter makes those pushes inert.
    Object.defineProperty(c, 'hass', {
      configurable: true, get: () => driven, set: () => {},
    });
    // Lock the heatup buffer to the synthetic series. The card also backfills the
    // graph from the recorder (an async fetch kicked off on the first update),
    // and that merge would replace the last point with the real room temperature.
    // A getter returning a fresh copy (so internal mutation can't leak back) plus
    // a no-op setter makes the buffer immutable for the screenshot.
    Object.defineProperty(c, '_heatupSamples', {
      configurable: true,
      get: () => series.map((p) => ({ ...p })),
      set: () => {},
    });
    c.requestUpdate();
    await c.updateComplete;
  }
  return { ok: true, resolved: Object.keys(byKey).length, samples: series.length };
}
"""


def shoot(dark):
    suffix = "-dark" if dark else ""
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        # A 1500px viewport puts the cards in masonry columns ~404 CSS px wide,
        # matching the existing 808px (×2) graph shots; the clip crops to each
        # card's ha-card box.
        ctx = b.new_context(
            viewport={"width": 1500, "height": 950}, device_scale_factor=2
        )
        ctx.add_init_script(tokens_init(dark))
        pg = ctx.new_page()
        pg.goto(f"{URL}/sauna-test/layouts", wait_until="domcontentloaded")
        for _ in range(40):
            if pg.locator("sauna-card ha-card").count():
                break
            pg.wait_for_timeout(500)
        # Let the async cooldown reconstruction (these layout cards set
        # cooldown_target_temp) finish before driving heating, so it can't
        # clobber the heatup samples we're about to build.
        pg.wait_for_timeout(7000)
        drive = pg.evaluate(DRIVE_HEATUP)
        pg.wait_for_timeout(500)
        boxes = pg.evaluate(FIND_CARDS)
        for i, name in enumerate(NAMES):
            box = boxes[i]
            out = OUT / f"graph-heatup-{name}{suffix}.png"
            pg.screenshot(
                path=str(out),
                clip={"x": box["x"], "y": box["y"],
                      "width": box["w"], "height": box["h"]},
            )
            print(f"shot {out.name}  heatup={box['heatup']}  cap={box['cap']!r}")
        ctx.close()
        b.close()
        print(f"[{'dark' if dark else 'light'}] drive: {json.dumps(drive)}")


def main():
    if not TOKEN:
        print("ERROR: set HASS_TOKEN (or create tmp/.ha_token)", file=sys.stderr)
        sys.exit(2)
    OUT.mkdir(parents=True, exist_ok=True)
    for dark in (False, True):
        shoot(dark)


if __name__ == "__main__":
    main()
