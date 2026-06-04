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

- [ ] **I1 · i18n core.** `i18n.ts` (IntlMessageFormat, `import.meta.glob`,
      `detectLang`, `t`, English fallback) + `locales/{sv,fi,en,de}.json` skeletons.
- [ ] **I2 · Adapter contract + registry.** TS interfaces (`SaunaConfig`,
      `SaunaState`, adapter contract), `adapter-registry.ts`, `utils/autodetect.ts`
      (`INTEGRATION_PRIORITY = ["harvia_xenio", "fenix"]`, detect/pick/select).
- [ ] **I3 · Harvia Xenio adapter (read).** `adapters/harvia-xenio.ts`:
      `stubConfig`, `readState`, `resolveEntityIds`. Contract tests + fixtures
      captured from the live integration.
- [ ] **I4 · Fenix adapter (read).** `adapters/fenix.ts`, same contract.
- [ ] **I5 · Card read-only view.** Status through adapters + i18n; `getCardSize`/
      `getGridOptions`. Verified in `hass-test`.
- [ ] **I6 · Controls (write).** `controls/` `callService` wrappers
      (`climate.set_temperature`, `switch.turn_on/off`, `number.set_value`,
      `harvia_sauna.set_session`) wired into the card.
- [ ] **I7 · Visual editor.** `editor/base.ts` + `sauna-card-editor.ts`,
      `getConfigElement`/`getStubConfig`.
- [ ] **I8 · Card suggestion (2026.6).** `getEntitySuggestion(hass, entityId)` on
      `window.customCards` for Harvia climate entities.
- [ ] **I9 · Badge.** `sauna-badge.ts` + `sauna-badge-editor.ts`,
      `window.customBadges`, shared status mixin.
- [ ] **I10 · Docs & release.** README, `docs/configuration.md`, finalize locales,
      `CHANGELOG.md`. Merge `dev → master`, tag and cut the **first GitHub release
      `0.1.0-beta1`** (triggers `release.yml`); promote to `0.1.0` once stable.

Dependencies: I1–I2 underpin I3–I4; I3–I4 underpin I5; I5 underpins I6/I7; I9
follows I5; I8 can run in parallel after I2.

## Phase 2+ — Growth (`0.2.x+`)

- More sauna models / integrations (same adapter pattern).
- More languages on demand.
- More badge and theme variants; UX polish.
- Documentation screenshots (reuse the screenshot workflow from pollenprognos-card).
