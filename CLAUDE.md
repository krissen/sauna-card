# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project

`sauna-card` — a Lovelace custom card for Home Assistant that **shows and
controls Harvia sauna heaters**. Built against the
[`ha-harvia-sauna`](https://github.com/WiesiDeluxe/ha-harvia-sauna) integration
(Xenio WiFi via myHarvia, Fenix via harvia.io). Modular adapter design so more
sauna models/integrations can be added over time. TypeScript + Lit 3 + Vite.
Multilingual from the start (sv, fi, en, de). MIT-licensed, public.

**Product owner:** Kristian Niemi (https://github.com/krissen) — communicate in **Swedish**.
**Code, commits, docs, comments:** English, always.

## Build and Development Commands

- `npm run dev` — Vite dev server with hot reload
- `npm run build` — production bundle to `dist/sauna-card.js`
- `npm run test` — Vitest
- `npm run update-version` — sync version from git tags (runs before build)

## Test Environment — use it actively, do not develop blind

The `ha-harvia-sauna` integration runs **live** in the local test instance, so we
test every increment against real entities — not mocks alone.

- Location: `../hass-test/` (Docker HA)
- Card path: `../hass-test/config/www/community/sauna-card/`
- Deploy: `cp dist/sauna-card.js ../hass-test/config/www/community/sauna-card/ && gzip -kf ../hass-test/config/www/community/sauna-card/sauna-card.js`
  — **HA serves the `.gz`; without gzip, changes won't be visible.**
- Restart/logs via `../hass-test/scripts/dev_init.sh` (`ha-start`, `ha-restart`, `ha-logs`).
- The integration lives in `../hass-test/config/custom_components/harvia_sauna/`.
- Capture fixtures for adapter tests from the live entity states (Developer Tools → States).
- Reuse the screenshot tooling from `../pollenprognos-card` for both documentation
  and visual regression testing.

## Architecture (target)

A LitElement card using the **adapter pattern**, ported from the mature
`../pollenprognos-card` (read it for reference — port, don't copy: that project
is plain JS, we are TypeScript + Lit 3).

- **Entry** (`src/index.ts`) — registers card, editor, badge; advertises via
  `window.customCards` (with `getEntitySuggestion`) and `window.customBadges`.
- **Card** (`src/sauna-card.ts`), **editor** (`src/sauna-card-editor.ts`),
  **badge** (`src/sauna-badge.ts` + `src/sauna-badge-editor.ts`).
- **Adapter registry** (`src/adapter-registry.ts`) — id → `{ module, stub }`.
- **Adapters** (`src/adapters/{harvia-xenio,fenix}.ts`) — each exports
  `stubConfig`, `readState(hass, cfg)`, `resolveEntityIds(cfg, hass)`.
- **Autodetect** (`src/utils/autodetect.ts`) — `INTEGRATION_PRIORITY`, detect
  Harvia devices, pick model + device; shared by card, editor, badge.
- **Controls** (`src/controls/`) — `hass.callService` wrappers
  (`climate.set_temperature`, `switch.turn_on/off`, `number.set_value`,
  `harvia_sauna.set_session`). This is the dimension pollenprognos-card lacks:
  saunas are control + status, not read-only.
- **i18n** (`src/i18n.ts` + `src/locales/*.json`) — IntlMessageFormat, HA-locale
  detection, English fallback.
- **Editor base** (`src/editor/base.ts`) — shared editor sections.

### Harvia entity model (from `ha-harvia-sauna`)

- **climate** — thermostat (target temp, mode)
- **switch** — power, light, fan, steamer, aroma, auto light, auto fan, dehumidifier
- **sensor** — current temp, humidity, target temp, remaining time, power (W),
  energy (kWh), last session duration/max temp, sessions today, temp trend,
  Wi-Fi RSSI, status codes, relay counters
- **binary_sensor** — door, heating active, steam active
- **number** — target humidity, aroma level, session time (1–720 min)
- **service** — `harvia_sauna.set_session` (target_temp 40–110 °C, duration, active)
- **events** — `harvia_sauna_session_start`, `harvia_sauna_session_end`

## Adding a new sauna model / integration

1. Create `src/adapters/<model>.ts` exporting `stubConfig`, `readState`, `resolveEntityIds`.
2. Register it in `src/adapter-registry.ts`.
3. Add its detection to `INTEGRATION_PRIORITY` + `detectIntegrationStates` in `src/utils/autodetect.ts`.
4. Add locale keys to `src/locales/*.json` (edit `en.json`; others follow).
5. Add contract tests in `test/adapters/<model>.test.ts`, with fixtures captured live.
6. Handle model-specific config fields in the editor.

## Review loop (mandatory per PR)

Every PR is reviewed by **both Codex and Copilot each round** — they have
different blind spots; skipping one means trusting a single reviewer. Driven by
`~/bin/scripts/gh_botreview` (`poll` / `resolve` / `react`). Break-point: neither
bot posts new substantive findings. **Fallback when a bot can't run:**
`/nagelfar` (local independent review, anchor `NF_PROTOCOL`) substitutes for it.
When one bot is out of quota it is replaced *per-bot* (review stays dual:
surviving bot + Nagelfararna); when **both** are down, Nagelfararna alone are the
review. Don't run Nagelfar when both bots are up. See `GUIDELINES.md` for the
full workflow, commit format, and permissions.

## Subagents

Roles in `.claude/agents/` (auto-discovered via YAML frontmatter):

| Role | File | Responsibility |
|------|------|----------------|
| HR | `hr.md` | Team composition, role profiles |
| HA Domain Expert | `ha-domain-expert.md` | HA conventions, card/badge API, card suggestions, HACS |
| Card/Frontend Dev | `card-frontend-dev.md` | Card, editor, badge, adapter registry, TS build |
| i18n / Localization | `i18n-localization.md` | Translations, locale files, locale detection |
| QA & Release/DevOps | `qa-release-devops.md` | Vitest, hass-test verification, CI, HACS, tagging |

### Delegation

**Without approval:** delegate to subagents, technical decisions within scope,
read docs/research. **Requires product-owner approval:** scope changes,
UX-affecting architecture, releases/version bumps, new npm dependencies.
