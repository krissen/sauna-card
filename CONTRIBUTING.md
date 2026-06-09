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
```

A pull request should build cleanly and pass `npm run test` and `npm run lint`.
Keep commits focused (one logical change each) and written in English, label
your issue or PR, and describe what you tested against — including any model or
integration you *couldn't* test, so a reviewer knows where to look. Open PRs
against the `dev` branch.

By contributing you agree your work is licensed under the project's
[MIT License](LICENSE).
