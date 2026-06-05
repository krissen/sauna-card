# Quick start

## Prerequisites

- The [`ha-harvia-sauna`](https://github.com/WiesiDeluxe/ha-harvia-sauna)
  integration set up (see [installation](installation.md)).
- sauna-card installed.

## Add your first card

### With the visual editor (recommended)

1. Open a dashboard → **Edit** → **Add card** → search **Sauna**.
2. The card auto-detects your heater. Pick a **layout** (status dashboard,
   thermostat dial, or compact).
3. Tailor what it shows in the editor's content section — reorder tiles with drag
   or ▲▼, add values, or set the compact slots. Each layout keeps its own list,
   and **Reset** restores the defaults.

![card editor](screenshots/editor-card.png)

### With YAML

```yaml
type: custom:sauna-card
```

Then add options as needed — see the
[configuration reference](configuration.md). For example, a thermostat dial with
a couple of extra values below it:

```yaml
type: custom:sauna-card
layout: thermostat-hero
hero_items: [humidity, remaining]
```

## Add your first badge

In a view's badges (Edit → **Add badge** → "Sauna", or YAML):

```yaml
badges:
  - type: custom:sauna-badge          # status + temperature chip
  - type: custom:sauna-badge
    visual: ring_value                # a temperature gauge
```

See the [badge options](configuration.md#badge-options) for the appearances and
content modes.

## Card-picker suggestion (Home Assistant 2026.6+)

When you add a card and pick a Harvia **climate** entity, Home Assistant offers
sauna-card directly — pre-configured for that device.
