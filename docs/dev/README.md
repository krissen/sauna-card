# Developer documentation

This is the entry point for **extending sauna-card** — translations, new sauna
integrations, and the project's direction. It's written for the community, not
just the maintainers: most of what's here is exactly what an outside contributor
needs.

> Using the card rather than working on it? The **user documentation** lives one
> level up in [`docs/`](../) — [installation](../installation.md),
> [quick start](../quick-start.md),
> [configuration reference](../configuration.md),
> [localization](../localization.md) and [troubleshooting](../troubleshooting.md).
> Start at [CONTRIBUTING.md](../../CONTRIBUTING.md) for how to get set up.

## Extend it

- **[Add a language](adding-a-language.md)** — translate the card into another
  language. Locale files are auto-discovered and partial translations are fine
  (English back-fills). The easiest first contribution.
- **[Add a sauna model or integration](adding-an-integration.md)** — write an
  adapter that maps another integration's entities into the card's normalized
  state. The card, editor and badge then work unchanged.

## How the code is laid out

A LitElement card (TypeScript + Lit 3 + Vite) built around an adapter pattern:

- `src/index.ts` — registers the card, editor and badge.
- `src/sauna-card.ts`, `src/sauna-card-editor.ts`, `src/sauna-badge.ts`,
  `src/sauna-badge-editor.ts` — the elements.
- `src/adapter-registry.ts` + `src/adapters/` — integration adapters
  (`id → SaunaAdapter`).
- `src/utils/autodetect.ts` — device/integration detection.
- `src/controls/` — `hass.callService` wrappers (the control side).
- `src/i18n.ts` + `src/locales/` — translations.
- `src/types.ts` — the shared types, including `SaunaAdapter` and `SaunaState`.

## Build and test

```sh
npm install
npm run dev        # Vite dev server with hot reload
npm run build      # production bundle to dist/sauna-card.js
npm run test       # Vitest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint + prettier --check
```

A pull request should build cleanly and pass `npm run test` and `npm run lint`.

## Direction

[ROADMAP.md](ROADMAP.md) is the forward-looking plan — what's planned and what's
shipped.
