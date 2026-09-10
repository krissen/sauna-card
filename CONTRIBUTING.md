# Contributing to sauna-card

Thanks for considering it. This card was built for one person's sauna and shared
in case it's useful to others, so contributions — especially from people with
hardware and integrations I can't test myself — genuinely move it forward.

## Ways to help

- **Translate it.** Add a language, or finish a partial one. Probably the easiest
  first contribution: locale files are auto-discovered and untranslated keys
  back-fill from English. See
  [docs/dev/adding-a-language.md](docs/dev/adding-a-language.md).
- **Add a sauna integration or model.** The card reads saunas through small
  adapters; supporting another integration means writing one. See
  [docs/dev/adding-an-integration.md](docs/dev/adding-an-integration.md).
- **Report a bug or request a feature** via
  [GitHub Issues](https://github.com/krissen/sauna-card/issues). For a bug,
  include your Home Assistant and integration versions and what the card showed
  versus what you expected.
- **Improve the docs** if something was unclear or wrong.

## Developer docs

The entry point for working on the card is
**[docs/dev/](docs/dev/README.md)** — code layout, the build/test commands, the
adapter contract, and the per-task guides above. It's written for the community,
not just the maintainers.

## Working on a change

```sh
npm install
npm run dev        # Vite dev server with hot reload
npm run build      # production bundle
npm run test       # Vitest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint + prettier --check
npm run check      # the same gate CI runs: prek + lint + typecheck + test + build
```

`npm run check` expects `prek` and `gitleaks` to be resolvable; run `npm run
setup` once first if either is missing (see below).

A pull request should build cleanly and pass `npm run check` (or at least
`npm run test` and `npm run lint`). Keep commits focused (one logical change
each), follow the commit message format below, label your issue or PR, and
describe what you tested against — including any model or integration you
*couldn't* test, so a reviewer knows where to look. Open PRs against the `dev`
branch.

### Local quality gate (pre-commit/pre-push hooks)

`npm run check` runs the same checks CI does, and most of them can also run
automatically as Git hooks from `.pre-commit-config.yaml`. Setup differs
depending on how your machine runs Git hooks:

- **Ordinary clone (most contributors):** run `npm run setup` once. It
  resolves `prek` on demand via `pipx run --spec`/`uv tool run --from`
  (pinned to the exact version this repo's CI uses, regardless of any other
  `prek` on your machine) and checks for `gitleaks`, then runs `prek install`
  / `prek install --hook-type pre-push` to wire the hooks into this clone's
  own `.git/hooks` — the generated hook scripts point straight at the
  resolved, version-pinned binary, so `pipx`/`uv` aren't invoked again on
  every commit. Re-run it any time; it's idempotent.
- **A machine that routes all repos through a global `core.hooksPath`
  dispatcher** (a maintainer convention, not the norm): `prek install`
  refuses to write local hooks there on purpose, since Git would never read
  them. Use `git config prek.enabled true` instead — the dispatcher runs prek
  for any repo that opts in that way. `npm run setup` detects this case
  automatically and tells you which command to run.

On an ordinary clone, `git commit --no-verify` skips the hooks
`npm run setup` installed for one commit. `SKIP_PREK=1 git commit` only
does something on a maintainer machine that routes hooks through a
global `core.hooksPath` dispatcher (the `git config prek.enabled true`
case above) — that dispatcher, not `prek` or Git itself, is what reads
`SKIP_PREK`. Either way, the separate AI-attribution guard is unaffected.

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/) with a
mandatory scope: `type(scope): subject`.

- **type**: one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert`.
- **scope**: required, lowercase, short — a filename without its extension or
  a module/feature name (e.g. `adapters`, `editor`, `i18n`).
- **subject**: imperative mood, lowercase first letter, no trailing period.
- **Breaking change**: `type(scope)!: subject` with a `BREAKING CHANGE:`
  footer.
- Commit messages (and PR titles, which normally become the squash-merge
  commit subject) are written in English.
- One logical change per commit; don't bundle an unrelated fix into a feature
  commit.
- Never add an AI-attribution trailer or co-author line to a commit or PR
  description.

```
feat(adapters): add support for the Fenix integration
fix(editor): keep the target-temperature slider in sync with custom mode
docs(readme): describe the new twice_daily interval
```

PRs must carry at least one label (e.g. `bug`, `enhancement`) before merge.

By contributing you agree your work is licensed under the project's
[MIT License](LICENSE).
