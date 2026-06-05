# Installation

## 1. Install the Harvia integration

sauna-card reads and controls your heater through the
[`ha-harvia-sauna`](https://github.com/WiesiDeluxe/ha-harvia-sauna) integration.
Install and configure it first (Xenio WiFi via myHarvia, or Fenix via
harvia.io). Once it's set up you'll have a Harvia **device** with a climate
entity and a set of switches/sensors — the card finds it automatically.

## 2. Install the card

### HACS (recommended)

1. HACS → ⋮ → **Custom repositories**.
2. Add `https://github.com/krissen/sauna-card`, category **Dashboard**.
3. Install **sauna-card** and reload your browser.

### Manual

1. Copy `dist/sauna-card.js` to `config/www/community/sauna-card/`.
2. Settings → Dashboards → ⋮ → **Resources** → add:
   `/local/community/sauna-card/sauna-card.js` as a **JavaScript Module**.
3. Reload your browser.

The same file registers both the **card** (`custom:sauna-card`) and the **badge**
(`custom:sauna-badge`).

## 3. Add the card

- **Visual:** Edit dashboard → **Add card** → search "Sauna". On Home Assistant
  2026.6+ the card is also suggested when you pick a Harvia climate entity.
- **YAML:**

  ```yaml
  type: custom:sauna-card
  ```

## 4. Add the badge

- **Visual:** Edit dashboard → **Add badge** → search "Sauna".
- **YAML** (in a view's `badges:` list):

  ```yaml
  badges:
    - type: custom:sauna-badge
  ```

## Next steps

- [Quick start](quick-start.md) — the visual editor walkthrough.
- [Configuration reference](configuration.md) — every option and the value catalog.
