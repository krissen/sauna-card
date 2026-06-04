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
 * Pick the best language: an explicit override, then the Home Assistant locale,
 * then its 2-letter prefix, then English. Always returns a code that exists.
 */
export function detectLang(hass?: HassLike, userLocale?: string): string {
  const tag =
    userLocale || hass?.locale?.language || hass?.language || DEFAULT_LANG;
  if (LOCALES[tag]) return tag;
  const short = tag.slice(0, 2).toLowerCase();
  if (LOCALES[short]) return short;
  return DEFAULT_LANG;
}

/**
 * Translate `key` into `lang`, formatting any ICU variables. Falls back to the
 * English string, then to the raw key, so a missing translation never throws.
 */
export function t(
  key: string,
  lang: string,
  vars: Record<string, string | number> = {},
): string {
  const hasLang = LOCALES[lang] !== undefined;
  const localeData = hasLang ? LOCALES[lang] : (LOCALES[DEFAULT_LANG] ?? {});
  const msg = localeData[key] ?? LOCALES[DEFAULT_LANG]?.[key] ?? key;
  // Format with a supported locale. An unsupported/invalid BCP47 tag would make
  // IntlMessageFormat throw, dropping variable interpolation.
  const formatLang = hasLang ? lang : DEFAULT_LANG;
  try {
    const out = new IntlMessageFormat(msg, formatLang).format(vars);
    return typeof out === "string" ? out : String(out);
  } catch (err) {
    console.warn(`[sauna-card] translation failed for key: ${key}`, err);
    return msg;
  }
}
