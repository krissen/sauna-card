# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

Work toward the first release, `0.1.0-beta1`.

### Added
- **Multilingual core** — Swedish, Finnish, English and German, with English as
  the source and per-key fallback; language auto-detected from Home Assistant
  (overridable). New locales can be dropped in as partial files.
- **Modular adapter architecture** — an integration-keyed registry with a Harvia
  adapter that resolves entities by `(domain, translation_key)` within the device
  (robust to localized entity ids) and exposes a normalized sauna state. Xenio and
  Fenix are device models of the one integration.
- **Three card layouts** behind a `layout` option — `status-dashboard` (default),
  `thermostat-hero`, and `compact` — styled with Home Assistant theme variables
  so the card inherits any theme. Shows temperature, target, status, heat-up
  ready-ETA, humidity, power, energy, sessions, door, and a door-open-while-heating
  warning.
- **Controls** — power/light/fan/steamer toggles, a target-temperature stepper,
  and Start/Stop session via the `harvia_sauna.set_session` service.
- **Visual editor** (`getConfigElement`) — name, device, layout and language,
  built on `ha-form`.
- **Card-picker suggestion** (Home Assistant 2026.6) — offers the card,
  pre-configured, when a Harvia climate entity is picked.

## [0.0.1] - 2026-06-04

Internal bootstrap milestone (tag only — the first GitHub release will be
`0.1.0-beta1`). No sauna functionality yet.

### Added
- Project scaffold: repository, MIT license, HACS manifest, and development roadmap.
- Build toolchain: TypeScript (strict) + Lit 3 + Vite, single-file bundle
  (`dist/sauna-card.js`) with git-tag version injection.
- Quality tooling: Vitest (jsdom), ESLint (typescript-eslint), Prettier.
- CI (`ci.yml`): typecheck, lint, test and build. Release workflow (`release.yml`)
  builds, attaches the bundle, and enforces HACS plugin validation at release time.
- Placeholder `<sauna-card>` element registered with Home Assistant's card picker.
