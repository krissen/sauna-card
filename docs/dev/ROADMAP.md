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
      `detectLang`, `t`, English fallback) + `locales/{sv,fi,en,de}.json` skeletons.
- [x] **I2 · Adapter contract + registry.** TS interfaces (`SaunaCardConfig`,
      `SaunaState`, adapter contract), `adapter-registry.ts` keyed by
      **integration**, `utils/autodetect.ts` (`INTEGRATION_PRIORITY =
      ["harvia_sauna"]`; detect entities via `hass.entities` platform, group by
      device, pick device). Resolution by **(domain, translation_key)** within
      the device. Contract tests with fixtures from the live entity model.
      (Xenio/Fenix are device *models* of one integration, not separate adapters.)
- [x] **I3 · Harvia adapter — readState.** `adapters/harvia.ts`: full
      `stubConfig` + `resolveEntityIds` + `readState` → normalized `SaunaState`.
      Verified against live Xenio entities in `hass-test`.
- [x] **I4 · Fenix model differences.** Handled implicitly: `detectModel` labels
      the device (xenio/fenix) and the card renders only the entities a device
      actually exposes (chips/tiles hide when absent), so a Fenix with fewer
      entities degrades gracefully — no explicit per-model gating needed.
      ⚠️ **Not live-verified against real Fenix hardware** (only a Xenio device in
      `hass-test`); confirm before promoting 0.1.0 out of beta.
- [x] **I5 · Card read-only view.** Status through adapters + i18n. Three layouts
      behind a `layout` option sharing one token system — `status-dashboard`
      (default), `thermostat-hero`, `compact` — styled **theme-first** (HA CSS
      vars, no hard-coded theme colors). `getCardSize`/`getGridOptions`.
      Door-open-while-heating warning. Verified in `hass-test`.
- [x] **I6 · Controls (write).** `controls.ts` `callService` wrappers
      (`switch.toggle`, `climate.set_temperature`, `harvia_sauna.set_session`)
      wired into the card: toggle chips, target stepper (optimistic), Start/Stop
      session CTA. Live-verified the correct service calls are sent.
- [x] **I7 · Visual editor.** `sauna-card-editor.ts` built on `ha-form`
      (name/device/layout/language); `getConfigElement`. Live-verified in HA.
- [x] **I8 · Card suggestion (2026.6).** `getEntitySuggestion(hass, entityId)` on
      `window.customCards` for Harvia climate entities.
- [ ] **I9 · Badge.** `sauna-badge.ts` + `sauna-badge-editor.ts`,
      `window.customBadges`, shared status mixin.
- [ ] **I10 · Docs & release.** README, `docs/configuration.md`, finalize locales,
      `CHANGELOG.md`. Merge `dev → master`, tag and cut the **first GitHub release
      `0.1.0-beta1`** (triggers `release.yml`); promote to `0.1.0` once stable.

Dependencies: I1–I2 underpin I3–I4; I3–I4 underpin I5; I5 underpins I6/I7; I9
follows I5; I8 can run in parallel after I2.

## Current status (2026-06-04)

- **Merged on `dev`:** F0, F1, I1–I8. `v0.0.1` tagged on `master` (tag only; the
  first GitHub release will be `0.1.0-beta1`). All increments passed the dual-bot
  review loop and were live-verified in `hass-test` (Xenio device).
- **Remaining for `0.1.0-beta1`:** I9 (badge), I10 (docs + first release).
- The card shows + controls the heater in three theme-first layouts, has a visual
  editor, suggests itself in the 2026.6 picker, and is localized (sv/fi/en/de).

## Deferred / follow-ups (tracked here, not just in a session task list)

- **perf — cache entity-id resolution.** `_state()` re-scans `hass.entities` each
  render; cache the resolved device + entity-id map keyed by the `hass.entities`
  reference. Correctness is fine; matters on large installs. (Flagged on PR #4.)
- **chore — dev-toolchain audit.** A few advisories in dev-only deps
  (vite/vitest/esbuild). Fix needs breaking major bumps; own PR, product-owner
  sign-off. None ship in `dist/`.
- **HACS default-repo submission.** At 0.1.0: cut the release with the asset,
  confirm `hacs/action` green, then PR `hacs/default` (plugins). hacs.json,
  topics, README, MIT already in place.
- **Fenix live verification.** Only a Xenio device exists in `hass-test`; verify
  Fenix behaviour on real hardware before promoting 0.1.0 out of beta.
- **Editor dialog live test.** The editor element was probed in the frontend; the
  full add/edit-card dialog flow is a manual spot-check.

## Phase 2+ — Growth (`0.2.x+`)

- More sauna models / integrations (same adapter pattern).
- More languages on demand.
- More badge and theme variants; UX polish.
- Documentation screenshots (reuse the screenshot workflow from pollenprognos-card).
