# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.1.0-beta1] - 2026-06-05

First public beta — the card and badge are functional, theme-first, multilingual
(sv/fi/en/de) and fully configurable.

### Added
- **Badge** (`sauna-badge` + editor, `window.customBadges`). A compact companion
  for dashboard badge rows: six appearances (icon+value chip, icon, value, and
  three gauge variants), three content modes (status+temperature, a single
  chosen value, or several), an optional label, a size scale, the door-open
  warning, and tap-to-more-info. Built on the card's adapter pipeline.
- **Full value catalog** — every value the `ha-harvia-sauna` integration exposes
  is normalized into `SaunaState` and offered as a selectable item (44 in total,
  including diagnostics such as relay counters, probe temperatures, totals,
  status codes and the safety/screen-lock binaries). Items hide when their
  entity is absent or disabled.
- **Configurable content per layout.** Choose what each layout shows, saved per
  layout:
  - `dashboard_tiles` / `hero_items` — ordered, reorderable tile lists (drag or
    ▲▼) edited in a custom editor section, with reset per section and a
    whole-content reset.
  - `compact_slots` — left / middle / right, each an item, the device name, or
    nothing.
- **`controls` option** (`none` / `power` / `power+temp`, default `power+temp`)
  governing the interactive elements across layouts; makes the compact layout
  controllable.
- **Visual editor** for the card and badge (`ha-form` plus the custom tile/slot
  sections); localized in sv/fi/en/de.
- **Card-picker suggestion** on Home Assistant 2026.6+ for Harvia climate entities.

### Changed
- The `harvia_sauna` ready-ETA now prefers the integration's native
  `heat_up_time` sensor (enabled by default), falling back to a
  temperature-trend estimate; a zero reading is treated as "not yet known".

### Fixed
- The status-dashboard reserves the progress-bar and ETA space, so starting or
  stopping a session no longer makes the card jump.

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
