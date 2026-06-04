# sauna-card

[![License][license-shield]](LICENSE)
[![hacs][hacsbadge]][hacs]

A Lovelace custom card for Home Assistant that shows and controls **Harvia sauna
heaters**. Built for the [`ha-harvia-sauna`](https://github.com/WiesiDeluxe/ha-harvia-sauna)
integration, with a modular adapter design so more sauna models and integrations
can be added over time.

> **Status: early development (pre-0.1.0).** Not yet usable. See
> [`docs/dev/ROADMAP.md`](docs/dev/ROADMAP.md) for what is planned and where we are.

## Planned for 0.1.0

- **Show and control in one card**: thermostat (current/target temperature,
  heating state), power, light, fan, steamer, aroma, dehumidifier, humidity,
  remaining time, energy, sessions, door and steam state, Wi-Fi signal, and
  session start.
- **Two sauna models from day one** via the adapter pattern: Harvia **Xenio
  WiFi** and **Fenix** — the models the underlying integration supports.
- **Multilingual** from the start: Swedish, Finnish, English, German (more on
  request), following Home Assistant's locale.
- **Visual editor** (Home Assistant's card editor).
- **Badge** companion for dashboard badge rows.
- **Card picker suggestions** on Home Assistant 2026.6+ (the card offers itself
  when you pick a Harvia climate entity).

## Supported integration

- [Harvia Sauna (`ha-harvia-sauna`)](https://github.com/WiesiDeluxe/ha-harvia-sauna)
  — Xenio WiFi (myHarvia) and Fenix (harvia.io).

## Installation

Will be published via [HACS](https://hacs.xyz/) once 0.1.0 is released.

## License

[MIT](LICENSE) © Kristian Niemi

[license-shield]: https://img.shields.io/github/license/krissen/sauna-card.svg
[hacs]: https://github.com/hacs/integration
[hacsbadge]: https://img.shields.io/badge/HACS-Custom-orange.svg
