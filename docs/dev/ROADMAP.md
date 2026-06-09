# sauna-card — Development Roadmap

Tracks development toward and beyond 0.1.0. Mirrors `CHANGELOG.md` (this file is
the forward-looking plan; the changelog records what shipped). Each increment is
its own feature branch → PR against `dev`, and must pass the full loop
(build + tests green → deploy to `hass-test` → smoke test against the live
`ha-harvia-sauna` integration → code review) before the next one starts.
**We do not oneshot 0.1.0** — it is the target, reached one reviewed increment
at a time.

## Working loop (per increment)

1. Implement one bounded increment (one logical unit).
2. `npm run build` + `npm run test` (Vitest) green locally.
3. Deploy to the test instance and verify against real entities:
   `cp dist/sauna-card.js ../hass-test/config/www/community/sauna-card/ && gzip -kf ../hass-test/config/www/community/sauna-card/sauna-card.js`
   then restart HA and smoke-test (HA serves the `.gz`; without gzip changes are invisible).
4. Commit per logical change `(scope) English message`; PR against `dev` with ≥1 label.
5. Code review on the PR; address findings until the review is clean.
6. Merge → next increment. `dev → master` + tag only at release.

Escalate to the product owner: scope changes, UX-affecting architecture,
releases/version bumps, new npm dependencies.

## Phase 0 — Foundation (`0.0.x`, tag `v0.0.1`)

- [x] **F0 · Repo & team.** `git init`, branch model (`master` default, work via
      feature → `dev`), MIT license, README, `hacs.json`, `.gitignore`.
- [x] **F1 · Tooling skeleton.** TypeScript + Lit 3 + Vite → `dist/sauna-card.js`
      with `__VERSION__` injection; Vitest, ESLint, Prettier; CI (`ci.yml`:
      typecheck/lint/test/build) and `release.yml` (build + enforcing
      `hacs/action` at release time — `hassfest` omitted, this is a frontend
      card). Placeholder `<sauna-card>` registered and deployed to `hass-test`.
      Merged via PR #1 after code review. **Tag `v0.0.1` (tag only, no
      GitHub release).**

> Release policy: `v0.0.1` is an internal tag only. The **first GitHub release is
> `0.1.0`** (which triggers `release.yml`). HACS default-repo submission follows
> once 0.1.0 has seen some use.

## Phase 1 — 0.1.0 increments (each its own branch/PR → `dev`)

- [x] **I1 · i18n core.** `i18n.ts` (IntlMessageFormat, `import.meta.glob`,
      `detectLang`, `t`, English fallback) + `locales/{sv,fi,en,de}.json`.
- [x] **I2 · Adapter contract + registry.** `SaunaCardConfig`/`SaunaState`/adapter
      interfaces, `adapter-registry.ts` keyed by integration, `utils/autodetect.ts`.
      Resolution by **(domain, translation_key)** within a device.
- [x] **I3 · Harvia adapter — readState.** `adapters/harvia.ts` → normalized
      `SaunaState`. Verified against live Xenio entities in `hass-test`.
- [x] **I4 · Fenix model differences.** Handled implicitly: `detectModel` labels
      the device and the card renders only the entities a device exposes (items
      hide when absent), so a Fenix with fewer entities degrades gracefully.
      ⚠️ **Not live-verified against real Fenix hardware** — confirm before 0.1.0.
- [x] **I5 · Card read-only view.** Three theme-first layouts behind `layout`
      (`status-dashboard` default, `thermostat-hero`, `compact`).
      `getCardSize`/`getGridOptions`; door-open-while-heating warning.
- [x] **I6 · Controls (write).** `controls.ts` `callService` wrappers
      (`switch.toggle`, `climate.set_temperature`, `harvia_sauna.set_session`).
- [x] **I7 · Visual editor.** `sauna-card-editor.ts` on `ha-form`.
- [x] **I8 · Card suggestion (2026.6).** `getEntitySuggestion` on `window.customCards`.
- [x] **I9 · Badge.** `sauna-badge.ts` + `sauna-badge-editor.ts`,
      `window.customBadges`; six visuals × three content modes, ring gauge,
      label, scale, door warning, tap→more-info. (PR #9.)
- [x] **I10 · Docs & release.** README, `docs/*.md`, screenshots, `CHANGELOG.md`
      (PR #16); CI/release workflows bumped to the Node 24 action runtime (PR #17).
      `dev → master` merged and the **first GitHub release `0.1.0`** cut —
      `release.yml` green (build + asset + HACS validation).

### Configurable content (shipped on `dev` beyond I9, PRs #10–#15)

- [x] **Layout-jump fix** (PR #10) — the status-dashboard reserves the progress
      bar / ETA space so starting a session no longer reflows the card.
- [x] **Full item catalog** (PRs #11–#12) — `src/status.ts` normalizes **every**
      value the `harvia_sauna` integration exposes (44 items, diagnostics
      included) into a shared catalog used by the card and badge.
- [x] **Configurable tiles** (PR #13) — `dashboard_tiles` / `hero_items` ordered,
      reorderable lists with a custom editor (drag + ▲▼, add/remove, reset per
      section + whole-content).
- [x] **Compact slots** (PR #14) — `compact_slots` left/middle/right (item / name
      / none).
- [x] **Controls option** (PR #15) — `controls: none | power | power+temp`
      (default `power+temp`); makes the compact layout interactive.

## Current status (2026-06-08)

- **Shipped:** F0–F1, I1–I10, the configurability arc (PRs #10–#15), and the
  `0.1.x` releases. **`0.2.0` released** on `master`: the heatup/cooldown
  temperature graph, tap-to-more-info on read-only displays, the entity-resolution
  cache, and the control-row spacing fix — plus refreshed multilingual docs.
  All passed code review and were live-verified in `hass-test` (Xenio device).
- **Next:** gather feedback, then HACS default-repo submission.
- **Deferred:** Fenix live verification (only a Xenio in `hass-test`);
  dev-toolchain advisories (own PR). **Done:** perf — entity-id resolution and
  device detection are cached per entity-registry change (WeakMap on
  `hass.entities`) in `src/utils/autodetect.ts`, branch
  `perf/cache-entity-resolution`.
- **Release note:** a plain stable `0.1.0` (not a `-beta` prerelease) — the HACS
  validator ignores prereleases and our `dist/` is gitignored, so a prerelease
  had no resolvable asset.

## Next release (`0.1.x`)

- [x] **Tap sensor displays → more-info.** Sensor/value readouts on the card
  become clickable and open the standard HA more-info dialog for the underlying
  entity (e.g. tapping the power readout opens more-info for the power sensor) —
  same `tap→more-info` affordance the badge already has. Tiles/slots that
  **already carry their own interaction** (power toggle, temperature control, and
  other controls) keep that behaviour unchanged; only the read-only displays gain
  the more-info tap. **Shipped** (branch `feature/tap-more-info`): a shared
  `fireMoreInfo` helper (card + badge), per-item `entityKey` in the catalog, a
  `_readout` wrapper across tiles/slots/hero number/status badge/static target,
  and a `tap_more_info` toggle (on by default).

## Phase 2+ — Growth (`0.2.x+`)

- More sauna models / integrations (same adapter pattern).
- More languages on demand.
- More badge and theme variants; UX polish.
- Documentation screenshots (reuse the screenshot workflow from pollenprognos-card).
- [x] **Heatup/cooldown graph.** A temperature-over-time curve that takes over the
  "main region" in `status-dashboard`/`thermostat-hero` **only in the in-between
  state** — a rising curve while `status === "heating"`, a falling curve during a
  derived cooldown phase after shutdown. **Shipped** (branch
  `feature/heatup-cooldown-graph`, increments I-G1–I-G6) as Option A region-swap
  with Stage A live samples + Stage B recorder backfill, and two independent
  toggles (`show_heatup_graph` / `show_cooldown_graph`, both default on). Design
  record: [`plans/heatup-cooldown-graph.md`](plans/heatup-cooldown-graph.md).
