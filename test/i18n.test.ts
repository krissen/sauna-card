import { describe, it, expect } from "vitest";
import { t, detectLang, SUPPORTED_LOCALES, DEFAULT_LANG } from "../src/i18n";
import en from "../src/locales/en.json";
import sv from "../src/locales/sv.json";
import fi from "../src/locales/fi.json";
import de from "../src/locales/de.json";

describe("i18n / detectLang", () => {
  it("defaults to English", () => {
    expect(detectLang()).toBe("en");
    expect(detectLang({})).toBe("en");
  });

  it("honours an explicit override", () => {
    expect(detectLang({ language: "sv" }, "de")).toBe("de");
  });

  it("reads the Home Assistant locale", () => {
    expect(detectLang({ locale: { language: "sv" } })).toBe("sv");
    expect(detectLang({ language: "fi" })).toBe("fi");
  });

  it("falls back to the 2-letter prefix, then English", () => {
    expect(detectLang({ language: "de-DE" })).toBe("de");
    expect(detectLang({ language: "pt-BR" })).toBe("en");
  });
});

describe("i18n / t", () => {
  it("translates a known key per language", () => {
    expect(t("control.steamer", "en")).toBe("Steamer");
    expect(t("control.steamer", "sv")).toBe("Ånggenerator");
    expect(t("control.steamer", "de")).toBe("Verdampfer");
  });

  it("resolves a regional BCP47 tag to its base locale", () => {
    expect(t("control.steamer", "sv-SE")).toBe("Ånggenerator");
    expect(t("label.humidity", "de-DE")).toBe("Luftfeuchtigkeit");
  });

  it("does not mis-detect a 3-letter tag as a 2-letter prefix", () => {
    // `fil` (Filipino) must not collapse to `fi` (Finnish) → falls back to en.
    expect(t("control.steamer", "fil")).toBe("Steamer");
    expect(detectLang({ language: "fil" })).toBe("en");
  });

  it("falls back to English for a key missing in the target language", () => {
    // Every key currently exists everywhere, so simulate via a fake lang.
    expect(t("label.temperature", "xx")).toBe("Temperature");
  });

  it("returns the raw key when no translation exists anywhere", () => {
    expect(t("nope.missing", "en")).toBe("nope.missing");
  });

  it("still interpolates when the requested lang is unsupported/invalid", () => {
    // Falls back to the English message AND a valid format locale, so ICU vars
    // are still interpolated instead of returning the raw pattern.
    expect(t("common.minutes", "pt_BR", { count: 2 })).toBe("2 minutes");
  });

  it("formats ICU plurals", () => {
    expect(t("common.minutes", "en", { count: 1 })).toBe("1 minute");
    expect(t("common.minutes", "en", { count: 5 })).toBe("5 minutes");
    expect(t("common.minutes", "sv", { count: 1 })).toBe("1 minut");
    expect(t("common.minutes", "sv", { count: 3 })).toBe("3 minuter");
  });
});

describe("i18n / locale coverage", () => {
  it("registers the four initial locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["de", "en", "fi", "sv"]);
    expect(DEFAULT_LANG).toBe("en");
  });

  it("locales contain only known keys (missing keys fall back to English)", () => {
    // Subset policy: a locale may omit keys (English back-fills them at runtime),
    // so a partial translation can be dropped in and ships immediately. But it
    // must not contain unknown/misspelled keys — those would never be read and
    // signal drift from the English source.
    const enKeys = Object.keys(en);
    const enSet = new Set(enKeys);
    for (const [code, data] of Object.entries({ sv, fi, de })) {
      const unknown = Object.keys(data).filter((k) => !enSet.has(k));
      expect(unknown, `${code} has unknown/misspelled keys`).toEqual([]);
      const missing = enKeys.filter((k) => !(k in data));
      if (missing.length) {
        console.info(
          `[i18n] ${code}: ${missing.length}/${enKeys.length} keys untranslated (English back-fills)`,
        );
      }
    }
  });

  it("no locale has an empty string value", () => {
    for (const [code, data] of Object.entries({ en, sv, fi, de })) {
      for (const [key, value] of Object.entries(data)) {
        expect(value, `${code}.${key}`).not.toBe("");
      }
    }
  });
});
