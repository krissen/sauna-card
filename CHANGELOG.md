# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed
- **Whole-session graph and cool-down robustness.** The whole-session two-tone
  arc (`cooldown_include_heatup`) is now **on by default**, so a session shows the
  rising heat-up and falling cool-down as one curve. The cool-down now
  **reconstructs after a page reload out of the box**: the target temperature is
  taken from the session's start (ambient) temperature, falling back to 25 °C when
  that isn't known, instead of requiring `cooldown_target_temp`. The editor's
  graph and "tap for more info" toggles now correctly show their **on** defaults
  (they were rendered off when the keys were absent, even though the features were
  active).

### Added
- **Remote-off action** (`remote_off_action`, default `disable_start`). Choose
  what the card does while the mapped "remote control allowed" entity is off (and
  the sauna is off, so a start is what's blocked): `disable_start` (disable just
  the start button), `lock` (disable all controls), `hide_controls` (display-only),
  `compact` (switch to the compact layout, start disabled) or `compact_locked`
  (compact, all controls disabled); `none` opts out. In every active mode the
  status pill swaps its icon for a lock — a visual cue that reads without hover
  (no tooltip or banner). The default only engages when a remote-allowed entity
  exists and reads off (Harvia exposes one; map a `remoteAllowed` binary sensor
  manually), so it's safe out of the box. A tidier alternative to hiding the whole
  card.
- **Advanced editor section: version banner and debug logging.** The card and
  badge editors now have a folded **Advanced** section at the bottom with two
  diagnostics. *Log version to console* (`show_version`, on by default) prints a
  styled version banner (`♨️ Sauna Card: version X.Y.Z`) to the browser console
  once on load; omitting the option keeps it on, so existing cards keep logging.
  *Debug logging* (`debug`, off by default) emits verbose `console.debug` lines
  (prefixed `[sauna-card]`) across integration detection, service calls and
  graph/session computation. For the manual adapter it also flags each entity
  you mapped that can't be used: a non-numeric value where a number is expected
  (e.g. a pollen sensor mapped as temperature), an unavailable entity, or an
  entity_id that no longer exists. The section also shows the running build
  version. See [Configuration → Advanced](docs/configuration.md#advanced).
- **Manual entity mapping — use the card with any sauna, not just Harvia.** A new
  source mode (`integration: "manual"`) lets you point the card at your own Home
  Assistant entities: a `climate` entity plus whatever switches and sensors you
  have. Built for DIY / KNX / non-Harvia saunas. In the visual editor, choose
  **Custom mapping** under *Source*, then tick each type your sauna has and pick
  (or type) the entity for it — the list is foldable and sits right under the
  source picker. The card shows what you map and hides the rest. Controls work
  generically: the temperature stepper uses `climate.set_temperature`, the power
  button switches the mapped power entity (or the `climate` entity itself when no
  separate power switch is mapped, so a single `climate` entity gives you on/off),
  and toggle chips use `homeassistant.toggle`, so a light/fan can be a `switch`,
  `light`, `fan` or `input_boolean` entity. The companion badge supports manual
  mapping too. See
  [Integrations and compatibility](docs/integrations.md#manual-mapping).

## [0.2.0] - 2026-06-08

### Added
- **Tap a value to open more-info.** Read-only displays on the card — the metric
  tiles, the compact slots, the big current-temperature number, the status badge,
  and the static target temperature — are now tappable (and keyboard-operable)
  and open Home Assistant's standard more-info dialog for the underlying entity.
  Interactive controls (power toggle, temperature stepper, switch chips) keep
  their behaviour. Turn it off with `tap_more_info` (on by default).
- **Heatup / cooldown temperature graph.** While the sauna is heating, the main
  temperature area becomes a live curve rising toward the target; after a session
  is switched off it becomes a falling curve cooling back toward room temperature
  (over as long as it takes — up to a day). The graph only appears during these
  transitions and steps aside the rest of the time, so the rest of the card never
  moves. The curve is backfilled from Home Assistant's recorder, so it covers the
  whole session. Two independent toggles (`show_heatup_graph`,
  `show_cooldown_graph`, both on by default) turn each curve on or off.
- **Cooldown target temperature** (`cooldown_target_temp`, °C). The temperature
  the cooldown tracks toward — roughly room temperature. When set it's the
  cooldown baseline, and it lets the cooldown be **reconstructed from the recorder
  after a page reload**: if the sauna is off but still warm and was last switched
  off within the past day, the falling curve is rebuilt and shown.
- **Whole-session arc** (`cooldown_include_heatup`, off by default). Extends the
  cooldown curve back over the heatup so a single two-tone curve shows the entire
  session — the rising part in the heat colour, the falling part in the cooldown
  colour.
- **Time axis** under the graph — start / middle / end clock times — so a
  multi-hour cooldown is easy to read.

### Changed
- **Faster rendering on large installs.** Device detection and entity-id
  resolution are now scanned once per entity-registry change instead of on every
  render, so dashboards with many entities update with noticeably less work each
  state tick. No behaviour change — device renames still show immediately.

### Fixed
- **Even spacing around the controls.** In the thermostat-dial and compact
  layouts the temperature stepper and the control chips sat flush against each
  other; they now get the same breathing room as the status dashboard.

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
