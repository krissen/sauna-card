import { IntlMessageFormat } from "intl-messageformat";

export type Translations = Record<string, string>;

/** Minimal shape of the Home Assistant object needed for locale detection. */
export interface HassLike {
  locale?: { language?: string };
  language?: string;
}

/** Language used when no suitable locale is found. English is the source/fallback. */
export const DEFAULT_LANG = "en";

// Eagerly load every locale file. Vite (and Vitest) inline the JSON at build time.
const localeModules = import.meta.glob<{ default: Translations }>(
  "./locales/*.json",
  { eager: true },
);

const LOCALES: Record<string, Translations> = {};
for (const filePath in localeModules) {
  const match = filePath.match(/\/locales\/([\w-]+)\.json$/);
  if (match) {
    LOCALES[match[1]] = localeModules[filePath].default;
  }
}

/** Locale codes that have a translation file (e.g. ["de", "en", "fi", "sv"]). */
export const SUPPORTED_LOCALES = Object.keys(LOCALES).sort();

/**
 * Resolve any language tag to a supported locale code: an exact match first,
 * then the 2-letter prefix (so `sv-SE` → `sv`), then English.
 */
function resolveLocale(lang: string): string {
  if (LOCALES[lang]) return lang;
  const short = lang.slice(0, 2).toLowerCase();
  if (LOCALES[short]) return short;
  return DEFAULT_LANG;
}

/**
 * Pick the best language: an explicit config override, then the Home Assistant
 * locale, then English. Always returns a supported code.
 */
export function detectLang(hass?: HassLike, override?: string): string {
  const tag =
    override || hass?.locale?.language || hass?.language || DEFAULT_LANG;
  return resolveLocale(tag);
}

/**
 * Translate `key` into `lang` (any BCP47 tag), formatting ICU variables. Falls
 * back to the English string, then to the raw key, so it never throws. Both the
 * lookup and the ICU formatter use the resolved, supported locale.
 */
export function t(
  key: string,
  lang: string,
  vars: Record<string, string | number> = {},
): string {
  const code = resolveLocale(lang);
  const msg = LOCALES[code]?.[key] ?? LOCALES[DEFAULT_LANG]?.[key] ?? key;
  try {
    const out = new IntlMessageFormat(msg, code).format(vars);
    return typeof out === "string" ? out : String(out);
  } catch (err) {
    console.warn(`[sauna-card] translation failed for key: ${key}`, err);
    return msg;
  }
}
