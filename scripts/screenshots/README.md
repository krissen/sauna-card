# Documentation screenshot tooling

Reproducible generator for the images under `docs/screenshots/`. Drives the
local **hass-test** instance with Playwright and shoots element-level crops of
the card, badge and editor — in both light and dark themes.

## Setup

```bash
python3 -m venv tmp/.venv
tmp/.venv/bin/pip install playwright
tmp/.venv/bin/playwright install chromium
```

## Auth

`capture_docs.py` shoots authenticated dashboard views, so it needs a hass-test
long-lived token (the dedicated `bot` user), injected into `localStorage` —
**never committed**. `capture_editors.py` loads the public `/local/` bundle and
needs **no** token.

```bash
export HASS_TOKEN=$(cat tmp/.ha_token)   # or paste the token; capture_docs only
# optional: export HASS_URL=http://localhost:8123
#           export HASS_DIR=../hass-test
```

## Fixtures

Configs live under `docs/screenshots/fixtures/` so the image set is reproducible:

- `cards.json` — one card per layout/feature (`name` → config); shot by index.
- `badges.json` — the badge-variant row.
- `editors.json` — the card editor config. (The badge editor is plain `ha-form`,
  which needs real Home Assistant, so it isn't shot from the standalone page.)
- `diy_sauna.yaml` — a self-contained Home Assistant package of helper entities
  (input_number / input_boolean, template switches/sensors/binary_sensors and a
  `generic_thermostat`) that simulates a DIY / non-Harvia sauna. Drop it into
  `hass-test/config/packages/` (enable `homeassistant: packages: !include_dir_named packages`)
  so the **manual adapter** has real entities to map. Doubles as an example
  manual-mapping setup.

## Capture

`capture_docs.py` writes a throwaway **Docs** view into the `sauna-test`
dashboard, restarts HA, then shoots each `sauna-card` and the badge row:

```bash
tmp/.venv/bin/python scripts/screenshots/capture_docs.py            # setup + restart + shoot
tmp/.venv/bin/python scripts/screenshots/capture_docs.py --no-setup # shoot only
```

`capture_editors.py` shoots the visual editors from a standalone same-origin page
(so HA's SPA can't wipe the injected element); the editor's own configurable
sections render, while the standard `ha-form` fields appear above them in real HA:

```bash
tmp/.venv/bin/python scripts/screenshots/capture_editors.py
```

`capture_manual.py` shoots the **manual adapter** cards from the `Manual / DIY`
view (`/sauna-test/manual`), which maps the `diy_sauna.yaml` helper entities:

```bash
tmp/.venv/bin/python scripts/screenshots/capture_manual.py            # shoot only
tmp/.venv/bin/python scripts/screenshots/capture_manual.py --restart  # restart HA first
```

Both write `<name>.png` (light) and `<name>-dark.png` (dark). The card images
reflect the **live** test device's current state (it exposes only the entities
the integration enables), so a heating-state hero needs the device heating at
capture time.
