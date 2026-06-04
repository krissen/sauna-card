import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { Hass, SaunaCardConfig } from "./types";
import { detectLang, t, SUPPORTED_LOCALES } from "./i18n";

interface SchemaItem {
  name: string;
  selector: Record<string, unknown>;
}

// Field name → i18n label key.
const LABEL_KEY: Record<string, string> = {
  name: "editor.name",
  device_id: "editor.device",
  layout: "editor.layout",
  language: "editor.language",
};

/**
 * Visual config editor for sauna-card, built on Home Assistant's `ha-form` so it
 * is fully themed and trivially extensible — add a schema entry to expose a new
 * option. Returned by SaunaCard.getConfigElement().
 */
export class SaunaCardEditor extends LitElement {
  @property({ attribute: false }) hass?: Hass;

  @state() private _config: SaunaCardConfig = { type: "custom:sauna-card" };

  setConfig(config: SaunaCardConfig): void {
    // Back-fill the required `type` so emissions can never produce an invalid
    // card config, even if a config without it is ever passed at runtime.
    this._config = { ...config, type: config.type ?? "custom:sauna-card" };
  }

  private get _lang(): string {
    return detectLang(this.hass, this._config.language);
  }

  private _schema(): SchemaItem[] {
    const lang = this._lang;
    return [
      { name: "name", selector: { text: {} } },
      {
        name: "device_id",
        selector: { device: { integration: "harvia_sauna" } },
      },
      {
        name: "layout",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              {
                value: "status-dashboard",
                label: t("editor.layout_status_dashboard", lang),
              },
              {
                value: "thermostat-hero",
                label: t("editor.layout_thermostat_hero", lang),
              },
              { value: "compact", label: t("editor.layout_compact", lang) },
            ],
          },
        },
      },
      {
        name: "language",
        selector: {
          select: {
            mode: "dropdown",
            // Include any language already in the config (e.g. authored in YAML)
            // that isn't one of ours, so editing never silently drops it.
            options: [
              { value: "", label: t("editor.auto", lang) },
              ...this._languageCodes().map((l) => ({
                value: l,
                label: this._languageLabel(l, lang),
              })),
            ],
          },
        },
      },
    ];
  }

  private _languageCodes(): string[] {
    const current = this._config.language;
    if (current && !SUPPORTED_LOCALES.includes(current)) {
      return [...SUPPORTED_LOCALES, current];
    }
    return SUPPORTED_LOCALES;
  }

  /** Native language name in the UI language (e.g. "Svenska"), falling back to the code. */
  private _languageLabel(code: string, uiLang: string): string {
    try {
      return (
        new Intl.DisplayNames([uiLang], { type: "language" }).of(code) ?? code
      );
    } catch {
      return code;
    }
  }

  private _computeLabel = (schema: { name: string }): string =>
    t(LABEL_KEY[schema.name] ?? schema.name, this._lang);

  private _valueChanged(ev: CustomEvent): void {
    // ha-form only round-trips the keys it knows from the schema, so merge over
    // the current config to preserve everything else (`type`, `integration`,
    // and any future keys). Keep the editor's own copy in sync too.
    const changed = (ev.detail as { value: Partial<SaunaCardConfig> }).value;
    const next = { ...this._config, ...changed } as SaunaCardConfig;
    this._config = next;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    return html`<ha-form
      .hass=${this.hass}
      .data=${this._config}
      .schema=${this._schema()}
      .computeLabel=${this._computeLabel}
      @value-changed=${this._valueChanged}
    ></ha-form>`;
  }
}

if (!customElements.get("sauna-card-editor")) {
  customElements.define("sauna-card-editor", SaunaCardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    "sauna-card-editor": SaunaCardEditor;
  }
}
