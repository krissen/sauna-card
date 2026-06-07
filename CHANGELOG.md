# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **Heatup / cooldown temperature graph.** While the sauna is heating, the main
  temperature area becomes a live curve rising toward the target; after a session
  is switched off it becomes a falling curve cooling back toward the temperature
  the session started from (over as long as it takes — up to a day). The graph
  only appears during these transitions and steps aside the rest of the time, so
  the rest of the card never moves. The curve is backfilled from Home Assistant's
  recorder, so it covers the whole session and survives a page reload. Two
  independent toggles (`show_heatup_graph`, `show_cooldown_graph`, both on by
  default) turn each curve on or off.

## [0.1.1] - 2026-06-06

### Added
- **Start feedback when a session can't start.** If a start is refused — most
  often because the door is open — the card now says so instead of the controls
  silently blinking back to off: a notice appears the moment you press start with
  the door open, and a short grace later if the start otherwise didn't take.
- **The card is offered for every Harvia entity in the card picker**, not just
  the thermostat — sensors, binary sensors, numbers, and the integration's update
  entity. This includes the HACS update entity (the one that shows when you search
  "harvia"), which now pre-fills the right sauna device.

### Fixed
- **Heating "ready in" estimate now counts down.** It previously showed the
  integration's `heat_up_time` sensor, which is a static value (unchanged even
  while the sauna is off), so it never decreased. The estimate is now derived from
  the temperature trend — the `temp_trend` sensor when enabled, otherwise from the
  card's own observed temperature — and shrinks as the sauna heats.

## [0.1.0] - 2026-06-05

First release — the card and badge show and control Harvia sauna heaters,
theme-first, multilingual (sv/fi/en/de) and fully configurable.

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
