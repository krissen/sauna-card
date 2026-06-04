import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type {
  Hass,
  SaunaBadgeConfig,
  SaunaState,
  BadgeContent,
  BadgeVisual,
  BadgeLabelPosition,
} from "./types";
import { pickIntegration } from "./adapter-registry";
import {
  STATUS_ICON,
  BADGE_ITEMS,
  isBadgeItemKey,
  type BadgeItemKey,
  type ItemValue,
  type TFn,
} from "./status";
import { detectLang, t } from "./i18n";

const CONTENTS: BadgeContent[] = ["primary", "single", "row"];
const VISUALS: BadgeVisual[] = [
  "chip",
  "icon",
  "value",
  "ring_value",
  "ring_icon",
  "ring",
];
const LABEL_POSITIONS: BadgeLabelPosition[] = ["right", "below"];

/** Items shown by content="row" when the user hasn't picked any. */
const DEFAULT_ITEMS: BadgeItemKey[] = ["status", "current_temp", "humidity"];

/** HA badge base height in px; scaled by config.scale. */
const BASE_SIZE = 36;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** A single rendered value (icon + optional value + gauge progress). */
interface Unit {
  icon: string;
  value: ItemValue | null;
  progress?: number;
  statusTinted: boolean;
  labelKey: string;
}

function unitFromItem(key: BadgeItemKey, s: SaunaState, tr: TFn): Unit {
  const def = BADGE_ITEMS[key];
  return {
    icon: def.icon(s),
    value: def.value(s, tr),
    progress: def.progress?.(s),
    statusTinted: !!def.statusTinted,
    labelKey: def.labelKey,
  };
}

/** The headline pairing: status icon + current temperature. */
function primaryUnit(s: SaunaState, tr: TFn): Unit {
  const u = unitFromItem("current_temp", s, tr);
  // Show the status icon (fire/check/…) rather than a plain thermometer, so the
  // default badge conveys status at a glance — its defining trait.
  u.icon = STATUS_ICON[s.status];
  return u;
}

/**
 * A compact Lovelace badge for Harvia saunas. Reuses the card's adapter pipeline
 * and shared status/item catalog (src/status.ts), and offers the same
 * theme-first look in a small, configurable pill. Registered via
 * window.customBadges in index.ts.
 */
export class SaunaBadge extends LitElement {
  @property({ attribute: false }) hass?: Hass;

  @state() private _config: SaunaBadgeConfig = { type: "custom:sauna-badge" };

  static getStubConfig(): Record<string, unknown> {
    // Empty config → autodetect device + integration, default content/visual.
    return {};
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("sauna-badge-editor");
  }

  setConfig(config: unknown): void {
    if (!isPlainObject(config)) {
      throw new Error("Invalid configuration");
    }
    for (const key of [
      "type",
      "name",
      "integration",
      "device_id",
      "language",
      "single_item",
    ]) {
      if (config[key] !== undefined && typeof config[key] !== "string") {
        throw new Error(`sauna-badge: "${key}" must be a string`);
      }
    }
    if (
      config.content !== undefined &&
      !CONTENTS.includes(config.content as BadgeContent)
    ) {
      throw new Error(
        `sauna-badge: invalid content "${String(config.content)}"`,
      );
    }
    if (
      config.visual !== undefined &&
      !VISUALS.includes(config.visual as BadgeVisual)
    ) {
      throw new Error(`sauna-badge: invalid visual "${String(config.visual)}"`);
    }
    if (
      config.label_position !== undefined &&
      !LABEL_POSITIONS.includes(config.label_position as BadgeLabelPosition)
    ) {
      throw new Error(
        `sauna-badge: invalid label_position "${String(config.label_position)}"`,
      );
    }
    if (config.items !== undefined && !Array.isArray(config.items)) {
      throw new Error(`sauna-badge: "items" must be an array`);
    }
    if (
      config.show_label !== undefined &&
      typeof config.show_label !== "boolean"
    ) {
      throw new Error(`sauna-badge: "show_label" must be a boolean`);
    }
    if (
      config.scale !== undefined &&
      (typeof config.scale !== "number" ||
        !Number.isFinite(config.scale) ||
        config.scale <= 0)
    ) {
      throw new Error(`sauna-badge: "scale" must be a positive number`);
    }
    this._config = config as unknown as SaunaBadgeConfig;
  }

  private get _lang(): string {
    return detectLang(this.hass, this._config.language);
  }

  private get _content(): BadgeContent {
    return this._config.content ?? "primary";
  }

  private get _visual(): BadgeVisual {
    return this._config.visual ?? "chip";
  }

  private get _scale(): number {
    return this._config.scale && this._config.scale > 0
      ? this._config.scale
      : 1;
  }

  private get _showLabel(): boolean {
    return this._config.show_label === true;
  }

  private get _labelPos(): BadgeLabelPosition {
    return this._config.label_position ?? "right";
  }

  private _t = (key: string, vars?: Record<string, string | number>): string =>
    t(key, this._lang, vars);

  private _state(): SaunaState | null {
    if (!this.hass) return null;
    const adapter = pickIntegration(this.hass, this._config.integration);
    return adapter ? adapter.readState(this.hass, this._config) : null;
  }

  private _units(s: SaunaState): Unit[] {
    if (this._content === "single") {
      const raw = this._config.single_item;
      const key: BadgeItemKey = isBadgeItemKey(raw) ? raw : "current_temp";
      return [unitFromItem(key, s, this._t)];
    }
    if (this._content === "row") {
      const configured = (this._config.items ?? []).filter(isBadgeItemKey);
      const keys = configured.length ? configured : DEFAULT_ITEMS;
      const units = keys
        .map((k) => unitFromItem(k, s, this._t))
        .filter((u) => u.value !== null);
      // If nothing in the selection has a value, fall back to status so the
      // badge never renders as an empty pill.
      return units.length ? units : [unitFromItem("status", s, this._t)];
    }
    return [primaryUnit(s, this._t)];
  }

  // ---- rendering ----

  private _ring(
    u: Unit,
    s: SaunaState,
    center: TemplateResult | typeof nothing,
  ): TemplateResult {
    const p = u.progress ?? 0;
    // 270° gauge, mirroring the card's thermostat-hero dial.
    const CIRC = 2 * Math.PI * 44;
    const ARC = CIRC * 0.75;
    const col =
      s.status === "ready"
        ? "var(--success-color, #43a047)"
        : "var(--sauna-heat-color)";
    return html`<span class="ring">
      <svg viewBox="0 0 120 120">
        <circle
          class="track"
          cx="60"
          cy="60"
          r="44"
          stroke-dasharray="${ARC.toFixed(1)} ${CIRC.toFixed(1)}"
          transform="rotate(135 60 60)"
        ></circle>
        <circle
          class="arc"
          cx="60"
          cy="60"
          r="44"
          stroke=${col}
          stroke-dasharray="${(ARC * p).toFixed(1)} ${CIRC.toFixed(1)}"
          transform="rotate(135 60 60)"
        ></circle>
      </svg>
      <span class="center">${center}</span>
    </span>`;
  }

  private _icon(u: Unit, cls: string): TemplateResult {
    return html`<span class="ic ${cls}"
      ><ha-icon icon=${u.icon}></ha-icon
    ></span>`;
  }

  private _value(u: Unit, cls: string): TemplateResult {
    const v = u.value;
    if (!v) return html`<span class="val">—</span>`;
    return html`<span class="val ${cls}"
      >${v.text}${v.unit
        ? html`<span class="unit">${v.unit}</span>`
        : nothing}</span
    >`;
  }

  private _renderUnit(u: Unit, s: SaunaState): TemplateResult {
    const cls = u.statusTinted ? `status-${s.status}` : "";
    let core: TemplateResult;
    switch (this._visual) {
      case "icon":
        core = this._icon(u, cls);
        break;
      case "value":
        core = this._value(u, cls);
        break;
      case "ring":
        core = this._ring(u, s, nothing);
        break;
      case "ring_icon":
        core = this._ring(u, s, this._icon(u, cls));
        break;
      case "ring_value":
        // Keep the unit in the gauge centre (e.g. "35%"), don't drop it.
        core = this._ring(
          u,
          s,
          u.value ? html`${u.value.text}${u.value.unit ?? ""}` : html`—`,
        );
        break;
      case "chip":
      default:
        core = html`${this._icon(u, cls)}${this._value(u, cls)}`;
    }
    const label = this._showLabel
      ? html`<span class="lbl">${this._t(u.labelKey)}</span>`
      : nothing;
    // Keep icon+value together on one line; only the label moves below it.
    return html`<span class="seg"
      ><span class="core">${core}</span>${label}</span
    >`;
  }

  private _doorWarn(): TemplateResult {
    // Name what is open (matches the card's "Door: Open"), not just "Open".
    return html`<span class="seg"
      ><span class="ic"><ha-icon icon="mdi:alert"></ha-icon></span
      ><span class="val"
        >${this._t("label.door")}: ${this._t("door.open")}</span
      ></span
    >`;
  }

  private _title(s: SaunaState): string {
    if (this._config.name) return this._config.name;
    const dev = this.hass?.devices?.[s.deviceId];
    return dev?.name_by_user ?? dev?.name ?? this._t("card.name");
  }

  private _tap(s: SaunaState): void {
    const id =
      s.entities.thermostat ?? s.entities.power ?? Object.values(s.entities)[0];
    if (!id) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId: id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderHost(
    inner: TemplateResult,
    s: SaunaState,
    warn = false,
  ): TemplateResult {
    const size = BASE_SIZE * this._scale;
    const cls = [
      "b",
      this._content === "row" ? "multi" : "",
      this._showLabel && this._labelPos === "below" ? "below" : "",
      warn ? "warn" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return html`<div
      class=${cls}
      style="--s:${size}px"
      role="button"
      tabindex="0"
      aria-haspopup="dialog"
      aria-label=${this._title(s)}
      title=${this._title(s)}
      @click=${() => this._tap(s)}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this._tap(s);
        }
      }}
    >
      ${inner}
    </div>`;
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    const s = this._state();
    if (!s) return nothing;
    // Safety: door open while heating is surfaced over everything else.
    if (s.doorOpen && s.heatingActive) {
      return this._renderHost(this._doorWarn(), s, true);
    }
    const units = this._units(s);
    if (units.length === 0) return nothing;
    return this._renderHost(
      html`${units.map((u) => this._renderUnit(u, s))}`,
      s,
    );
  }

  static override styles = css`
    :host {
      --sauna-heat-color: #ff7a18;
      display: inline-flex;
    }
    .b {
      --s: 36px;
      display: inline-flex;
      align-items: center;
      gap: calc(var(--s) * 0.18);
      height: var(--s);
      padding: 0 calc(var(--s) * 0.3);
      border-radius: 999px;
      background: var(--ha-card-background, var(--card-background-color, #fff));
      border: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      font-size: calc(var(--s) * 0.4);
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
      box-sizing: border-box;
      cursor: pointer;
    }
    .b:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    /* Label below: the pill stays a single horizontal row of segments; only
       each segment stacks its label under the icon+value (never wraps). */
    .b.below {
      height: auto;
      padding: calc(var(--s) * 0.18) calc(var(--s) * 0.3);
      border-radius: calc(var(--s) * 0.5);
    }
    .b.multi {
      gap: calc(var(--s) * 0.3);
    }
    .seg {
      display: inline-flex;
      align-items: center;
      gap: calc(var(--s) * 0.16);
    }
    .core {
      display: inline-flex;
      align-items: center;
      gap: calc(var(--s) * 0.16);
    }
    .b.below .seg {
      flex-direction: column;
      gap: 2px;
    }
    .b.multi .seg + .seg {
      border-left: 1px solid var(--divider-color);
      padding-left: calc(var(--s) * 0.3);
    }
    .ic {
      display: inline-flex;
      width: calc(var(--s) * 0.62);
      height: calc(var(--s) * 0.62);
    }
    .ic ha-icon {
      --mdc-icon-size: calc(var(--s) * 0.62);
      width: calc(var(--s) * 0.62);
      height: calc(var(--s) * 0.62);
    }
    .val {
      font-variant-numeric: tabular-nums;
    }
    .unit {
      font-size: 0.66em;
      color: var(--secondary-text-color);
      margin-left: 1px;
    }
    .lbl {
      font-size: 0.72em;
      font-weight: 550;
      color: var(--secondary-text-color);
    }
    .b.below .lbl {
      font-size: 0.6em;
    }
    /* status tint (shared vocabulary with the card) */
    .status-heating {
      color: var(--sauna-heat-color);
    }
    .status-ready {
      color: var(--success-color, #43a047);
    }
    /* ring gauge */
    .ring {
      position: relative;
      display: inline-flex;
      width: calc(var(--s) * 0.86);
      height: calc(var(--s) * 0.86);
    }
    .ring svg {
      width: 100%;
      height: 100%;
    }
    .ring circle {
      fill: none;
      stroke-width: 12;
      stroke-linecap: round;
    }
    .ring .track {
      stroke: var(--divider-color);
    }
    .ring .center {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: calc(var(--s) * 0.3);
      font-weight: 700;
    }
    .ring .center .ic {
      width: calc(var(--s) * 0.46);
      height: calc(var(--s) * 0.46);
    }
    .ring .center .ic ha-icon {
      --mdc-icon-size: calc(var(--s) * 0.46);
      width: calc(var(--s) * 0.46);
      height: calc(var(--s) * 0.46);
    }
    /* door-open-while-heating warning */
    .b.warn {
      background: var(--error-color, #db4437);
      border-color: transparent;
      color: var(--text-primary-color, #fff);
    }
    .b.warn .unit {
      color: inherit;
    }
  `;
}

if (!customElements.get("sauna-badge")) {
  customElements.define("sauna-badge", SaunaBadge);
}

declare global {
  interface HTMLElementTagNameMap {
    "sauna-badge": SaunaBadge;
  }
}
