import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { Hass, SaunaBadgeConfig } from "./types";
import { BADGE_ITEM_KEYS, BADGE_ITEMS } from "./status";
import { detectLang, t, SUPPORTED_LOCALES } from "./i18n";
import { MANUAL_ENTITY_CATALOG } from "./adapters/manual";

interface SchemaItem {
  name: string;
  selector: Record<string, unknown>;
}

// Field name → i18n label key.
const LABEL_KEY: Record<string, string> = {
  name: "editor.name",
  integration: "editor.integration",
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

  private get _manual(): boolean {
    return this._config.integration === "manual";
  }

  private _schema(): SchemaItem[] {
    const lang = this._lang;
    const content = this._config.content ?? "primary";
    const schema: SchemaItem[] = [
      { name: "name", selector: { text: {} } },
      {
        name: "integration",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              {
                value: "harvia_sauna",
                label: t("editor.integration_harvia", lang),
              },
              {
                value: "manual",
                label: t("editor.integration_manual", lang),
              },
            ],
          },
        },
      },
      ...(this._manual
        ? []
        : [
            {
              name: "device_id",
              selector: { device: { integration: "harvia_sauna" } },
            },
          ]),
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

  /** Merge a patch over the config and emit it; keys set to undefined are dropped. */
  private _emit(patch: Partial<SaunaBadgeConfig>): void {
    const next = { ...this._config, ...patch } as SaunaBadgeConfig;
    const patchRec = patch as Record<string, unknown>;
    const nextRec = next as unknown as Record<string, unknown>;
    for (const k of Object.keys(patch)) {
      if (patchRec[k] === undefined) delete nextRec[k];
    }
    this._config = next;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _valueChanged(ev: CustomEvent): void {
    // ha-form only round-trips the keys it knows from the current schema, so
    // merge over the config to preserve everything else (the entity map and
    // fields hidden by the current content mode).
    const value = (ev.detail as { value: Partial<SaunaBadgeConfig> }).value;
    const patch: Partial<SaunaBadgeConfig> = { ...value };
    const was = this._config.integration;
    if (value.integration === "manual" && was !== "manual") {
      patch.entity_map = this._config.entity_map ?? {};
      patch.device_id = undefined;
    } else if (
      value.integration &&
      value.integration !== "manual" &&
      was === "manual"
    ) {
      patch.entity_map = undefined;
    }
    this._emit(patch);
  }

  // ---- manual entity-map section ----

  private get _entityMap(): Record<string, string> {
    return this._config.entity_map ?? {};
  }

  private _setMapEntity(key: string, entityId: string): void {
    const map = { ...this._entityMap };
    map[key] = entityId || "";
    this._emit({ entity_map: map });
  }

  private _toggleMapKey(key: string, checked: boolean): void {
    const map = { ...this._entityMap };
    if (checked) {
      if (!(key in map)) map[key] = "";
    } else {
      delete map[key];
    }
    this._emit({ entity_map: map });
  }

  private _manualSection(): TemplateResult | typeof nothing {
    if (!this._manual) return nothing;
    const lang = this._lang;
    const map = this._entityMap;
    // Foldable, open by default. Native <details> keeps its own open state.
    return html`<details class="section mapfold" open>
      <summary class="mapsummary">${t("editor.entity_map", lang)}</summary>
      <div class="hint">${t("editor.entity_map_hint", lang)}</div>
      <div class="maprows">
        ${MANUAL_ENTITY_CATALOG.map((spec) => {
          const checked = spec.key in map;
          return html`<div class="maprow">
            <label class="mapcheck">
              <input
                type="checkbox"
                .checked=${checked}
                @change=${(e: Event) =>
                  this._toggleMapKey(
                    spec.key,
                    (e.target as HTMLInputElement).checked,
                  )}
              />
              <span class="maplabel">${t(spec.labelKey, lang)}</span>
            </label>
            ${checked
              ? html`<ha-entity-picker
                  .hass=${this.hass}
                  .value=${map[spec.key] || ""}
                  .includeDomains=${spec.domains}
                  .allowCustomEntity=${true}
                  allow-custom-entity
                  @value-changed=${(e: CustomEvent) =>
                    this._setMapEntity(
                      spec.key,
                      (e.detail as { value: string }).value,
                    )}
                ></ha-entity-picker>`
              : nothing}
          </div>`;
        })}
      </div>
    </details>`;
  }

  // ---- advanced section ----

  /** Folded-by-default section with the version banner toggle, debug toggle and
   * the build-version readout. */
  private _advancedSection(): TemplateResult {
    const lang = this._lang;
    const cfg = this._config;
    return html`<details class="section advfold">
      <summary>${t("editor.advanced", lang)}</summary>
      <div class="hint">${t("editor.advanced_hint", lang)}</div>
      <ha-formfield .label=${t("editor.show_version", lang)}>
        <ha-switch
          .checked=${cfg.show_version !== false}
          @change=${(e: Event) =>
            this._emit({
              show_version: (e.target as HTMLInputElement).checked
                ? undefined
                : false,
            })}
        ></ha-switch>
      </ha-formfield>
      <ha-formfield .label=${t("editor.debug", lang)}>
        <ha-switch
          .checked=${cfg.debug === true}
          @change=${(e: Event) =>
            this._emit({
              debug: (e.target as HTMLInputElement).checked || undefined,
            })}
        ></ha-switch>
      </ha-formfield>
      <div class="version-info">
        ${t("editor.badge_version", lang)}: ${__VERSION__}
      </div>
    </details>`;
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    const data = {
      ...this._config,
      integration: this._config.integration || "harvia_sauna",
    };
    // Split the form at the source picker so the manual entity-map section can
    // sit directly under it (ha-form renders its schema as one contiguous block).
    const schema = this._schema();
    const cut = schema.findIndex((s) => s.name === "integration") + 1;
    const top = schema.slice(0, cut);
    const rest = schema.slice(cut);
    return html`<ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${top}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
      ${this._manualSection()}
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${rest}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
      ${this._advancedSection()}`;
  }

  static override styles = css`
    .section {
      margin-top: 16px;
    }
    .section .title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .mapfold {
      /* Space before the next form half, kept whether expanded or folded. */
      margin-bottom: 16px;
    }
    .mapfold > summary,
    .advfold > summary {
      font-weight: 600;
      cursor: pointer;
      list-style-position: inside;
      user-select: none;
      padding: 2px 0;
      margin-bottom: 4px;
    }
    .advfold ha-formfield {
      display: block;
      margin-top: 6px;
    }
    .version-info {
      font-size: 0.72rem;
      color: var(--secondary-text-color);
      margin-top: 10px;
    }
    .hint {
      font-size: 0.72rem;
      color: var(--secondary-text-color);
      margin-bottom: 8px;
    }
    .maprows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .maprow {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .mapcheck {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: 11em;
      flex-shrink: 0;
      cursor: pointer;
    }
    .maplabel {
      font-size: 0.9rem;
    }
    .maprow ha-entity-picker {
      flex: 1;
      min-width: 14em;
    }
  `;
}

if (!customElements.get("sauna-badge-editor")) {
  customElements.define("sauna-badge-editor", SaunaBadgeEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    "sauna-badge-editor": SaunaBadgeEditor;
  }
}
