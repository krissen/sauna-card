import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type { Hass, SaunaCardConfig, SaunaLayout, SaunaState } from "./types";
import { detectLang, t, SUPPORTED_LOCALES } from "./i18n";
import {
  BADGE_ITEMS,
  BADGE_ITEM_KEYS,
  isBadgeItemKey,
  type BadgeItemKey,
} from "./status";
import { DEFAULT_DASHBOARD_TILES, DEFAULT_COMPACT_SLOTS } from "./sauna-card";
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
  layout: "editor.layout",
  controls: "editor.controls",
  require_remote_allowed: "editor.require_remote_allowed",
  show_heatup_graph: "editor.show_heatup_graph",
  show_cooldown_graph: "editor.show_cooldown_graph",
  cooldown_target_temp: "editor.cooldown_target_temp",
  cooldown_include_heatup: "editor.cooldown_include_heatup",
  tap_more_info: "editor.tap_more_info",
  language: "editor.language",
};

/** A layout's configurable tile list: which config key, its defaults, its title. */
interface TileSpec {
  configKey: "dashboard_tiles" | "hero_items";
  defaults: readonly BadgeItemKey[];
  titleKey: string;
}

// Only layouts with a configurable tile area appear here (compact uses slots,
// added in a later increment).
const LAYOUT_TILES: Partial<Record<SaunaLayout, TileSpec>> = {
  "status-dashboard": {
    configKey: "dashboard_tiles",
    defaults: DEFAULT_DASHBOARD_TILES,
    titleKey: "editor.tiles_dashboard",
  },
  "thermostat-hero": {
    configKey: "hero_items",
    defaults: [],
    titleKey: "editor.tiles_hero",
  },
};

// Every per-layout content key, for the whole-content reset.
const CONTENT_CONFIG_KEYS = [
  "dashboard_tiles",
  "hero_items",
  "compact_slots",
] as const;

// Compact slot positions, in display order, with their editor label keys.
const COMPACT_SLOTS = [
  { pos: "left", labelKey: "editor.slot_left" },
  { pos: "mid", labelKey: "editor.slot_mid" },
  { pos: "right", labelKey: "editor.slot_right" },
] as const;

// Minimal state to evaluate item icons in the editor (no live hass needed).
const ICON_STATE = {
  integration: "",
  deviceId: "",
  available: false,
  status: "idle",
  entities: {},
} as unknown as SaunaState;

/**
 * Visual config editor for sauna-card. Standard fields run through `ha-form`;
 * the active layout's tile list is edited in a custom section with drag + ▲▼
 * reordering, removal, an add picker, and reset (per section + whole card).
 * Returned by SaunaCard.getConfigElement().
 */
export class SaunaCardEditor extends LitElement {
  @property({ attribute: false }) hass?: Hass;

  @state() private _config: SaunaCardConfig = { type: "custom:sauna-card" };

  setConfig(config: SaunaCardConfig): void {
    this._config = { ...config, type: config.type ?? "custom:sauna-card" };
  }

  private get _lang(): string {
    return detectLang(this.hass, this._config.language);
  }

  private get _manual(): boolean {
    return this._config.integration === "manual";
  }

  private _schema(): SchemaItem[] {
    const lang = this._lang;
    return [
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
      // The device picker is Harvia-specific; manual mapping uses its own
      // entity-map section instead (rendered between the two form halves).
      ...(this._manual
        ? []
        : [
            {
              name: "device_id",
              selector: { device: { integration: "harvia_sauna" } },
            },
          ]),
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
        name: "controls",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "none", label: t("editor.controls_none", lang) },
              { value: "power", label: t("editor.controls_power", lang) },
              {
                value: "power+temp",
                label: t("editor.controls_power_temp", lang),
              },
            ],
          },
        },
      },
      { name: "require_remote_allowed", selector: { boolean: {} } },
      { name: "show_heatup_graph", selector: { boolean: {} } },
      { name: "show_cooldown_graph", selector: { boolean: {} } },
      {
        name: "cooldown_target_temp",
        selector: {
          number: { mode: "box", step: 1, unit_of_measurement: "°C" },
        },
      },
      { name: "cooldown_include_heatup", selector: { boolean: {} } },
      { name: "tap_more_info", selector: { boolean: {} } },
      {
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

  /** Merge a patch over the config and emit it; keys set to undefined are dropped. */
  private _emit(patch: Partial<SaunaCardConfig>): void {
    const next = { ...this._config, ...patch } as SaunaCardConfig;
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
    // ha-form round-trips only its schema keys; merge over config to preserve
    // everything else (the per-layout tile lists, the entity map).
    const value = (ev.detail as { value: Partial<SaunaCardConfig> }).value;
    const patch: Partial<SaunaCardConfig> = { ...value };
    const was = this._config.integration;
    if (value.integration === "manual" && was !== "manual") {
      // Switching to manual: seed an (empty) map and drop the Harvia device id.
      patch.entity_map = this._config.entity_map ?? {};
      patch.device_id = undefined;
    } else if (
      value.integration &&
      value.integration !== "manual" &&
      was === "manual"
    ) {
      // Switching back to an auto integration: the manual map no longer applies.
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
    if (entityId) map[key] = entityId;
    else map[key] = "";
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
    // Foldable, open by default. Native <details> keeps its own open state, so a
    // collapse survives re-renders without tracking it in component state.
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

  // ---- tile list section ----

  private get _activeSpec(): TileSpec | undefined {
    const layout = (this._config.layout ?? "status-dashboard") as SaunaLayout;
    return LAYOUT_TILES[layout];
  }

  private _list(spec: TileSpec): BadgeItemKey[] {
    const raw = this._config[spec.configKey] ?? spec.defaults;
    return raw.filter(isBadgeItemKey);
  }

  private _setList(spec: TileSpec, list: BadgeItemKey[]): void {
    this._emit({ [spec.configKey]: list } as Partial<SaunaCardConfig>);
  }

  private _move(spec: TileSpec, i: number, dir: -1 | 1): void {
    const list = [...this._list(spec)];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this._setList(spec, list);
  }

  private _remove(spec: TileSpec, i: number): void {
    const list = [...this._list(spec)];
    list.splice(i, 1);
    this._setList(spec, list);
  }

  private _add(spec: TileSpec, key: string): void {
    if (!isBadgeItemKey(key)) return;
    this._setList(spec, [...this._list(spec), key]);
  }

  private _itemMoved(spec: TileSpec, ev: CustomEvent): void {
    const { oldIndex, newIndex } = ev.detail as {
      oldIndex: number;
      newIndex: number;
    };
    const list = [...this._list(spec)];
    const [moved] = list.splice(oldIndex, 1);
    list.splice(newIndex, 0, moved);
    this._setList(spec, list);
  }

  private _resetSection(spec: TileSpec): void {
    this._emit({ [spec.configKey]: undefined } as Partial<SaunaCardConfig>);
  }

  private _resetAll(): void {
    const patch: Record<string, undefined> = {};
    for (const k of CONTENT_CONFIG_KEYS) patch[k] = undefined;
    this._emit(patch as Partial<SaunaCardConfig>);
  }

  // ---- compact slots section ----

  private _setSlot(pos: "left" | "mid" | "right", value: string): void {
    const slots = { ...DEFAULT_COMPACT_SLOTS, ...this._config.compact_slots };
    slots[pos] = value;
    this._emit({ compact_slots: slots });
  }

  private _resetCompact(): void {
    this._emit({ compact_slots: undefined });
  }

  private _slotsSection(): TemplateResult | typeof nothing {
    if ((this._config.layout ?? "status-dashboard") !== "compact") {
      return nothing;
    }
    const lang = this._lang;
    const slots = { ...DEFAULT_COMPACT_SLOTS, ...this._config.compact_slots };
    return html`<div class="section">
      <div class="sec-head">
        <span class="title">${t("editor.tiles_compact", lang)}</span>
        <button
          type="button"
          class="reset"
          @click=${() => this._resetCompact()}
        >
          <ha-icon icon="mdi:restore"></ha-icon>${t("editor.reset", lang)}
        </button>
      </div>
      ${COMPACT_SLOTS.map((slot) => {
        const cur = slots[slot.pos] || "none";
        return html`<div class="slotrow">
          <span class="slotlabel">${t(slot.labelKey, lang)}</span>
          <select
            aria-label=${t(slot.labelKey, lang)}
            @change=${(e: Event) =>
              this._setSlot(slot.pos, (e.target as HTMLSelectElement).value)}
          >
            <option value="none" ?selected=${cur === "none"}>
              ${t("editor.slot_none", lang)}
            </option>
            <option value="name" ?selected=${cur === "name"}>
              ${t("editor.slot_name", lang)}
            </option>
            ${BADGE_ITEM_KEYS.map(
              (k) =>
                html`<option value=${k} ?selected=${cur === k}>
                  ${t(BADGE_ITEMS[k].labelKey, lang)}
                </option>`,
            )}
          </select>
        </div>`;
      })}
    </div>`;
  }

  private _tilesSection(): TemplateResult | typeof nothing {
    const spec = this._activeSpec;
    if (!spec) return nothing;
    const lang = this._lang;
    const list = this._list(spec);
    const available = BADGE_ITEM_KEYS.filter((k) => !list.includes(k));
    return html`<div class="section">
      <div class="sec-head">
        <span class="title">${t(spec.titleKey, lang)}</span>
        <button
          type="button"
          class="reset"
          @click=${() => this._resetSection(spec)}
        >
          <ha-icon icon="mdi:restore"></ha-icon>${t("editor.reset", lang)}
        </button>
      </div>
      <ha-sortable
        handle-selector=".handle"
        @item-moved=${(e: CustomEvent) => this._itemMoved(spec, e)}
      >
        <div class="rows">
          ${repeat(
            list,
            (k) => k,
            (k, i) =>
              html`<div class="row">
                <ha-icon class="handle" icon="mdi:drag"></ha-icon>
                <ha-icon
                  class="ic"
                  icon=${BADGE_ITEMS[k].icon(ICON_STATE)}
                ></ha-icon>
                <span class="name">${t(BADGE_ITEMS[k].labelKey, lang)}</span>
                <button
                  type="button"
                  class="iconbtn"
                  ?disabled=${i === 0}
                  aria-label=${t("editor.move_up", lang)}
                  @click=${() => this._move(spec, i, -1)}
                >
                  <ha-icon icon="mdi:chevron-up"></ha-icon>
                </button>
                <button
                  type="button"
                  class="iconbtn"
                  ?disabled=${i === list.length - 1}
                  aria-label=${t("editor.move_down", lang)}
                  @click=${() => this._move(spec, i, 1)}
                >
                  <ha-icon icon="mdi:chevron-down"></ha-icon>
                </button>
                <button
                  type="button"
                  class="iconbtn del"
                  aria-label=${t("editor.remove", lang)}
                  @click=${() => this._remove(spec, i)}
                >
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>`,
          )}
        </div>
      </ha-sortable>
      ${list.length === 0
        ? html`<div class="empty">${t("editor.tiles_empty", lang)}</div>`
        : nothing}
      <select
        class="add"
        aria-label=${t("editor.tiles_add", lang)}
        @change=${(e: Event) => {
          const el = e.target as HTMLSelectElement;
          this._add(spec, el.value);
          el.value = "";
        }}
      >
        <option value="">${t("editor.tiles_add", lang)}</option>
        ${available.map(
          (k) =>
            html`<option value=${k}>
              ${t(BADGE_ITEMS[k].labelKey, lang)}
            </option>`,
        )}
      </select>
      <div class="hint">${t("editor.tiles_hint", lang)}</div>
    </div>`;
  }

  // ---- advanced section ----

  /** Folded-by-default section with the version banner toggle, debug toggle and
   * the build-version readout. Reuses the manual-section fold styling. */
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
        ${t("editor.card_version", lang)}: ${__VERSION__}
      </div>
    </details>`;
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    // Pre-select Harvia in the source dropdown when no integration is set yet
    // (auto-detected configs omit it), so the select never shows blank.
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
      ${this._tilesSection()}${this._slotsSection()}${this._advancedSection()}
      <div class="foot">
        <button type="button" class="reset-all" @click=${this._resetAll}>
          ${t("editor.reset_all", this._lang)}
        </button>
      </div>`;
  }

  static override styles = css`
    .section {
      margin-top: 16px;
    }
    .sec-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .sec-head .title {
      flex: 1;
      font-weight: 600;
    }
    .reset {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font: inherit;
      font-size: 0.72rem;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--divider-color);
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
    }
    .reset:hover {
      color: var(--primary-text-color);
      border-color: var(--primary-color);
    }
    .reset ha-icon {
      --mdc-icon-size: 16px;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color);
    }
    .row .handle {
      cursor: grab;
      color: var(--secondary-text-color);
      --mdc-icon-size: 20px;
    }
    .row .ic {
      color: var(--secondary-text-color);
      --mdc-icon-size: 20px;
    }
    .row .name {
      flex: 1;
      font-size: 0.9rem;
    }
    .iconbtn {
      width: 30px;
      height: 30px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .iconbtn ha-icon {
      --mdc-icon-size: 20px;
    }
    .iconbtn:hover {
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
    }
    .iconbtn.del:hover {
      color: var(--error-color);
    }
    .iconbtn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .empty {
      font-size: 0.8rem;
      color: var(--secondary-text-color);
      padding: 6px 2px;
    }
    .add {
      margin-top: 8px;
      width: 100%;
      box-sizing: border-box;
      background: var(--secondary-background-color);
      border: 1px dashed var(--divider-color);
      border-radius: 8px;
      padding: 9px 11px;
      color: var(--secondary-text-color);
      font: inherit;
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
    .maprows {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
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
    .mapcheck input {
      cursor: pointer;
    }
    .maplabel {
      font-size: 0.9rem;
    }
    .maprow ha-entity-picker {
      flex: 1;
      min-width: 14em;
    }
    .slotrow {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 6px 0;
    }
    .slotrow .slotlabel {
      width: 5.5em;
      font-size: 0.85rem;
      color: var(--secondary-text-color);
    }
    .slotrow select {
      flex: 1;
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 8px 10px;
      color: var(--primary-text-color);
      font: inherit;
    }
    .hint {
      font-size: 0.72rem;
      color: var(--secondary-text-color);
      margin-top: 6px;
    }
    .foot {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
    .reset-all {
      font: inherit;
      font-weight: 600;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--error-color);
      background: transparent;
      color: var(--error-color);
      cursor: pointer;
    }
  `;
}

if (!customElements.get("sauna-card-editor")) {
  customElements.define("sauna-card-editor", SaunaCardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    "sauna-card-editor": SaunaCardEditor;
  }
}
