# sauna-card — Development Roadmap

Tracks development toward and beyond 0.1.0. Mirrors `CHANGELOG.md` (this file is
the forward-looking plan; the changelog records what shipped). Each increment is
its own feature branch → PR against `dev`, and must pass the full loop
(build + tests green → deploy to `hass-test` → smoke test against the live
`ha-harvia-sauna` integration → dual-bot review) before the next one starts.
**We do not oneshot 0.1.0** — it is the target, reached one reviewed increment
at a time.

## Working loop (per increment)

1. Implement one bounded increment (one logical unit).
2. `npm run build` + `npm run test` (Vitest) green locally.
3. Deploy to the test instance and verify against real entities:
   `cp dist/sauna-card.js ../hass-test/config/www/community/sauna-card/ && gzip -kf ../hass-test/config/www/community/sauna-card/sauna-card.js`
   then restart HA and smoke-test (HA serves the `.gz`; without gzip changes are invisible).
4. Commit per logical change `(scope) English message`; PR against `dev` with ≥1 label.
5. Review loop, **both bots every round** (Codex + Copilot via `gh_botreview`).
   Break-point: no bot posts new substantive findings. Fallback if both bots are
   down: `/nagelfar` (local human review).
6. Merge → next increment. `dev → master` + tag only at release.

Escalate to the product owner: scope changes, UX-affecting architecture,
releases/version bumps, new npm dependencies.

## Phase 0 — Foundation (`0.0.x`, tag `v0.0.1`)

- [x] **F0 · Repo & team.** `git init`, branch model (`master` default, work via
      feature → `dev`), MIT license, README, `hacs.json`, `.gitignore`, team
      structure, ADRs 0001–0004.
- [x] **F1 · Tooling skeleton.** TypeScript + Lit 3 + Vite → `dist/sauna-card.js`
      with `__VERSION__` injection; Vitest, ESLint, Prettier; CI (`ci.yml`:
      typecheck/lint/test/build) and `release.yml` (build + enforcing
      `hacs/action` at release time — `hassfest` omitted, this is a frontend
      card). Placeholder `<sauna-card>` registered and deployed to `hass-test`.
      Merged via PR #1 after dual-bot review. **Tag `v0.0.1` (tag only, no
      GitHub release).**

> Release policy: `v0.0.1` is an internal tag only. The **first GitHub release
> will be `0.1.0-beta1`** (which triggers `release.yml`). HACS submission follows
> once 0.1.0 is stable.

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
- [ ] **I10 · Docs & release.** README, `docs/*.md`, screenshots, `CHANGELOG.md`
      *(in progress)*. Then merge `dev → master`, tag and cut the **first GitHub
      release `0.1.0-beta1`** (triggers `release.yml`); promote to `0.1.0`.

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

## Current status (2026-06-05)

- **Merged on `dev`:** F0–F1, I1–I9, plus the configurability arc (PRs #10–#15).
  `v0.0.1` tagged on `master` (tag only; the first GitHub release will be
  `0.1.0-beta1`). All passed the dual-bot loop and were live-verified in
  `hass-test` (Xenio device).
- **Remaining for `0.1.0-beta1`:** I10 — docs (this), then the release.
- **Deferred:** Fenix live verification (only a Xenio in `hass-test`); perf —
  cache entity-id resolution in `_state()`; dev-toolchain advisories (own PR);
  HACS default-repo submission at 0.1.0.

## Phase 2+ — Growth (`0.2.x+`)

- More sauna models / integrations (same adapter pattern).
- More languages on demand.
- More badge and theme variants; UX polish.
- Documentation screenshots (reuse the screenshot workflow from pollenprognos-card).
