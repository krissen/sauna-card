# sauna-card

[![License][license-shield]](LICENSE)
[![hacs][hacsbadge]][hacs]

A Lovelace custom card **and badge** for Home Assistant that show and control
**Harvia sauna heaters**. Built for the
[`ha-harvia-sauna`](https://github.com/WiesiDeluxe/ha-harvia-sauna) integration
(Xenio WiFi via myHarvia, Fenix via harvia.io), with a modular adapter design so
more sauna models and integrations can be added over time. Theme-first,
multilingual (sv/fi/en/de), and configurable down to which value sits in which
slot.

| Light | Dark |
|:---:|:---:|
| ![Status dashboard, English (light)](docs/screenshots/hero-dashboard.png) | ![Status dashboard, German (dark)](docs/screenshots/hero-dashboard-de-dark.png) |

| Status dashboard | Thermostat dial | Compact |
|:---:|:---:|:---:|
| ![status-dashboard](docs/screenshots/hero-dashboard.png) | ![thermostat-hero](docs/screenshots/hero-thermostat.png) | ![compact](docs/screenshots/hero-compact.png) |

The companion **badge**, in several appearances:

![badge variants](docs/screenshots/badge-row.png)

> Screenshots are shown across the supported languages — English, German, Swedish
> and Finnish; the card follows your Home Assistant locale (with a per-card
> override).

## Features

- **Show and control in one card** — current/target temperature with a stepper,
  start/stop a session, and toggle power, light, fan and steamer.
- **Three theme-first layouts** — `status-dashboard` (default), `thermostat-hero`
  (a 270° dial) and `compact` — all styled with Home Assistant CSS variables, no
  hard-coded colours.
- **Configure what each layout shows.** Pick from **every** value the integration
  exposes (44 of them): temperatures, humidity, remaining time, power, energy,
  sessions, door/heating/steam, the auxiliary switches, and diagnostics. Each
  layout keeps its own selection.
- **Reorderable tiles** (dashboard/thermostat) and **left/middle/right slots**
  (compact), edited in the visual editor — drag or ▲▼, add/remove, reset.
- **A companion badge** for dashboard badge rows, with the same value catalog and
  six appearances (chip, icon, value, and three gauge variants).
- **Auto-detection** — finds your Harvia device automatically; no entity IDs to
  type. Resolves entities by their translation key, so localized entity IDs don't
  matter.
- **Multilingual** — Swedish, Finnish, English, German out of the box (more on
  request), following Home Assistant's locale, with a per-card override.
- **Visual editor** and **card-picker suggestion** on Home Assistant 2026.6+.

## In action

While the sauna runs, the main area turns into a live **temperature graph** — a
rising heat-up curve toward the target, a falling cool-down afterwards, or the
whole session as one two-tone arc. The tiles track the session as it goes.

| Heating up | Whole session |
|:---:|:---:|
| ![Heating-up graph (light)](docs/screenshots/graph-heatup-dashboard.png) | ![Two-tone session graph (light)](docs/screenshots/graph-session-dashboard.png) |
| ![Heating-up graph (dark)](docs/screenshots/graph-heatup-dashboard-dark.png) | ![Two-tone session graph (dark)](docs/screenshots/graph-session-dashboard-dark.png) |

See [Configuration → Temperature graph](docs/configuration.md#temperature-graph)
for the heat-up, cool-down and whole-session options.

## Requirements

The [`ha-harvia-sauna`](https://github.com/WiesiDeluxe/ha-harvia-sauna)
integration, installed and set up for your heater (Harvia **Xenio WiFi** or
**Fenix**). The card auto-detects the device it controls.

## Installation

### HACS (recommended)

1. HACS → ⋮ → **Custom repositories**.
2. Add `https://github.com/krissen/sauna-card` with category **Dashboard**.
3. Install **sauna-card**, then reload your browser.

### Manual

Download `sauna-card.js` from the
[latest release](https://github.com/krissen/sauna-card/releases) (or build it
yourself with `npm run build`), copy it to `config/www/community/sauna-card/`,
and add a dashboard resource (Settings → Dashboards → ⋮ → Resources):

```
/local/community/sauna-card/sauna-card.js   (type: JavaScript Module)
```

## Basic usage

The card and badge **auto-detect** your Harvia device — there are no entity IDs to
type. Adding the card is enough to get a working dashboard.

### In the UI (recommended)

1. Open a dashboard → **Edit dashboard** → **Add card**, and search for **Sauna**.
   On Home Assistant 2026.6+, picking a Harvia climate entity in the card picker
   also suggests sauna-card directly, pre-configured for that device.
2. The card detects your heater automatically. Choose a **layout** — status
   dashboard, thermostat dial, or compact.
3. Tailor what each layout shows in the **visual editor**: reorder tiles by drag
   or ▲▼, add or remove values from the full catalog, or set the compact
   left/middle/right slots. Each layout keeps its own selection, and **Reset**
   restores the defaults.

<p align="center">
  <img src="docs/screenshots/editor-card.png" width="420" alt="The card's visual editor">
</p>

Add the companion **badge** the same way from a view's badge row
(**Add badge** → search **Sauna**).

### In YAML

The minimal card and badge are just:

```yaml
type: custom:sauna-card
```

```yaml
type: custom:sauna-badge
```

Everything the editor sets is plain YAML too. For example, a thermostat dial with
two extra values below it, controls limited to power, and tap-to-more-info turned
off:

```yaml
type: custom:sauna-card
layout: thermostat-hero
hero_items: [humidity, remaining]
controls: power
tap_more_info: false
```

See the [configuration reference](docs/configuration.md) for every option and the
full value catalog, or the [quick start](docs/quick-start.md) for a guided walk-through.

## Documentation

- [Installation](docs/installation.md)
- [Quick start](docs/quick-start.md)
- [Configuration reference](docs/configuration.md) — every card and badge option,
  the value catalog, and examples
- [Localization](docs/localization.md)
- [Troubleshooting](docs/troubleshooting.md)

## Support

- **Bugs:** [GitHub Issues](https://github.com/krissen/sauna-card/issues)
- **Docs:** the [`docs/`](docs/) folder

## License

[MIT](LICENSE) © Kristian Niemi

[license-shield]: https://img.shields.io/github/license/krissen/sauna-card.svg
[hacs]: https://github.com/hacs/integration
[hacsbadge]: https://img.shields.io/badge/HACS-Custom-orange.svg
