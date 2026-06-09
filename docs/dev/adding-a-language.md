# Adding a language

sauna-card is multilingual and English is the source and fallback. Adding a
translation is one of the easiest ways to contribute, and a partial translation
is fine — any key you leave out back-fills from English at runtime.

If you just want to *select* a language, that's in the user docs:
[Localization](../localization.md). This page is for contributing a new one.

## How locales work

- Locale files live in [`src/locales/`](../../src/locales/) as `<code>.json`,
  one flat `key → text` object each.
- They are auto-discovered at build time (`import.meta.glob` in
  [`src/i18n.ts`](../../src/i18n.ts)) — there is no runtime registry to edit.
- A language tag is resolved by exact match first, then its two-letter prefix
  (so `sv-SE` → `sv`), then English.
- Missing keys fall back to English per-key, so you can ship a subset.

## Steps

1. **Copy the source file.** Copy `src/locales/en.json` to
   `src/locales/<code>.json`, where `<code>` is the locale code Home Assistant
   uses — usually a two-letter [ISO 639-1] code (`no`, `nl`, `pl`, `fr` …), or a
   regional tag (`pt-BR`) when a base language isn't enough.

2. **Translate the values, keep the keys.** Translate the right-hand strings
   only; never rename or invent keys. Keys that don't exist in `en.json` are
   rejected by the test suite (they'd never be read and signal drift from the
   source). Translating only some keys is fine — the rest back-fill from English.
   Don't leave a key with an empty string; omit it instead.

3. **Leave the placeholders alone.** Some messages use [ICU MessageFormat] —
   interpolated values like `graph.aria_heatup`
   (`"…{cur}° heating toward {tgt}°"`) and plurals like `common.minutes`. Keep
   the `{...}` placeholders and the plural structure intact; translate the words
   around them. For plurals, use the categories your language needs.

4. **Register the locale in the coverage test.** The card finds the file on its
   own, but [`test/i18n.test.ts`](../../test/i18n.test.ts) pins the exact set of
   shipped locales and checks each one for stray keys. Add your code there:
   - add it to the `SUPPORTED_LOCALES` expectation
     (`["de", "en", "fi", "sv"]` → include your code, kept sorted);
   - import your JSON and add it to the object the unknown-key / empty-string
     loops iterate over.

5. **Verify locally.** Run `npm run test`, `npm run build`, and `npm run lint`.
   The i18n test prints how many keys are still untranslated (English will
   back-fill them) — that's informational, not a failure.

6. **Open a pull request.** Label it `localization` / `new language`. Mention
   how complete the translation is; partial is welcome and can be finished later.

[ISO 639-1]: https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes
[ICU MessageFormat]: https://formatjs.github.io/docs/core-concepts/icu-syntax/
