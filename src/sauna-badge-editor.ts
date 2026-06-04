import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { Hass, SaunaBadgeConfig } from "./types";
import { BADGE_ITEM_KEYS, BADGE_ITEMS } from "./status";
import { detectLang, t, SUPPORTED_LOCALES } from "./i18n";

interface SchemaItem {
  name: string;
  selector: Record<string, unknown>;
}

// Field name → i18n label key.
const LABEL_KEY: Record<string, string> = {
  name: "editor.name",
  device_id: "editor.device",
  content: "editor.content",
  visual: "editor.visual",
  single_item: "editor.item",
  items: "editor.items",
  show_label: "editor.show_label",
  label_position: "editor.label_position",
  scale: "editor.scale",
  language: "editor.language",
};

const CONTENT_OPTIONS = ["primary", "single", "row"] as const;
const VISUAL_OPTIONS = [
  "chip",
  "icon",
  "value",
  "ring_value",
  "ring_icon",
  "ring",
] as const;

/**
 * Visual config editor for sauna-badge, built on `ha-form`. The schema is built
 * from the current config so content-dependent fields (single item, row items,
 * label position) appear only when relevant. Returned by
 * SaunaBadge.getConfigElement().
 */
export class SaunaBadgeEditor extends LitElement {
  @property({ attribute: false }) hass?: Hass;

  @state() private _config: SaunaBadgeConfig = { type: "custom:sauna-badge" };

  setConfig(config: SaunaBadgeConfig): void {
    this._config = { ...config, type: config.type ?? "custom:sauna-badge" };
  }

  private get _lang(): string {
    return detectLang(this.hass, this._config.language);
  }

  /** Item-key dropdown options, labelled from the shared item catalog. */
  private _itemOptions(): Array<{ value: string; label: string }> {
    return BADGE_ITEM_KEYS.map((k) => ({
      value: k,
      label: t(BADGE_ITEMS[k].labelKey, this._lang),
    }));
  }

  private _schema(): SchemaItem[] {
    const lang = this._lang;
    const content = this._config.content ?? "primary";
    const schema: SchemaItem[] = [
      { name: "name", selector: { text: {} } },
      {
        name: "device_id",
        selector: { device: { integration: "harvia_sauna" } },
      },
      {
        name: "content",
        selector: {
          select: {
            mode: "dropdown",
            options: CONTENT_OPTIONS.map((v) => ({
              value: v,
              label: t(`editor.content_${v}`, lang),
            })),
          },
        },
      },
      {
        name: "visual",
        selector: {
          select: {
            mode: "dropdown",
            options: VISUAL_OPTIONS.map((v) => ({
              value: v,
              label: t(`editor.visual_${v}`, lang),
            })),
          },
        },
      },
    ];

    if (content === "single") {
      schema.push({
        name: "single_item",
        selector: {
          select: { mode: "dropdown", options: this._itemOptions() },
        },
      });
    }
    if (content === "row") {
      schema.push({
        name: "items",
        selector: { select: { multiple: true, options: this._itemOptions() } },
      });
    }

    schema.push({ name: "show_label", selector: { boolean: {} } });
    if (this._config.show_label) {
      schema.push({
        name: "label_position",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "right", label: t("editor.label_right", lang) },
              { value: "below", label: t("editor.label_below", lang) },
            ],
          },
        },
      });
    }

    schema.push({
      name: "scale",
      selector: { number: { min: 0.5, max: 3, step: 0.1, mode: "slider" } },
    });
    schema.push({
      name: "language",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "", label: t("editor.auto", lang) },
            ...this._languageCodes().map((l) => ({
              value: l,
              label: this._languageLabel(l, lang),
            })),
          ],
        },
      },
    });

    return schema;
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
    // ha-form only round-trips the keys it knows from the current schema, so
    // merge over the config to preserve everything else (`type`, `integration`,
    // and fields hidden by the current content mode).
    const changed = (ev.detail as { value: Partial<SaunaBadgeConfig> }).value;
    const next = { ...this._config, ...changed } as SaunaBadgeConfig;
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

if (!customElements.get("sauna-badge-editor")) {
  customElements.define("sauna-badge-editor", SaunaBadgeEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    "sauna-badge-editor": SaunaBadgeEditor;
  }
}
