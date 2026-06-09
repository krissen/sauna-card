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

Want to contribute a translation? You can translate only some keys (the rest
back-fill from English), and it's one of the easiest ways to help. The full,
step-by-step guide for contributors is in the developer docs:
[Adding a language](dev/adding-a-language.md).
