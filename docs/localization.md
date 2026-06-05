# Localization

sauna-card ships with **Swedish, Finnish, English and German** and follows Home
Assistant's language. English is the source and the fallback.

## Language selection

For each card/badge the language is chosen as:

1. the `language` option, if set;
2. otherwise the Home Assistant locale;
3. otherwise English.

A tag is resolved by exact match first, then its 2-letter prefix (so `sv-SE` →
`sv`), then English. Set a per-card override in the editor or in YAML:

```yaml
type: custom:sauna-card
language: fi
```

## Provided locales

`sv`, `fi`, `en`, `de`. Missing keys in any locale fall back to English, so a
partial translation is fine — it just back-fills from `en.json`.

## Adding a language

1. Copy `src/locales/en.json` to `src/locales/<code>.json` (e.g. `no.json`).
2. Translate the values — you can translate only some keys; the rest back-fill
   from English. Unknown keys are not allowed.
3. Open a pull request. Locales are auto-discovered (`import.meta.glob`), so no
   registration is needed.
