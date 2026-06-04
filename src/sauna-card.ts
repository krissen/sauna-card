import {
  LitElement,
  html,
  css,
  nothing,
  type TemplateResult,
  type PropertyValues,
} from "lit";
import { property, state } from "lit/decorators.js";
import type {
  Hass,
  SaunaCardConfig,
  SaunaState,
  SaunaStatus,
  SaunaLayout,
} from "./types";
import { pickIntegration } from "./adapter-registry";
import { detectLang, t } from "./i18n";
import { toggleSwitch, setTargetTemperature, setActive } from "./controls";

const TEMP_STEP = 5;

// HA states that mean "no usable value" — mirrors the adapter's handling.
const UNAVAILABLE_STATES = new Set(["unavailable", "unknown", "none", ""]);

function entityUnavailable(state: string | undefined): boolean {
  return state === undefined || UNAVAILABLE_STATES.has(state);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const LAYOUTS: SaunaLayout[] = [
  "status-dashboard",
  "thermostat-hero",
  "compact",
];

const STATUS_ICON: Record<SaunaStatus, string> = {
  off: "mdi:power",
  heating: "mdi:fire",
  ready: "mdi:check-circle",
  idle: "mdi:timer-sand-empty",
  unknown: "mdi:help-circle",
};

const STATUS_KEY: Record<SaunaStatus, string> = {
  off: "state.off",
  heating: "state.heating",
  ready: "state.ready",
  idle: "state.idle",
  unknown: "common.unknown",
};

// Read-only control chips shown in I5. Interactivity (callService) lands in I6.
const CONTROLS: Array<{ key: string; icon: string; labelKey: string }> = [
  { key: "power", icon: "mdi:power", labelKey: "control.power" },
  { key: "light", icon: "mdi:lightbulb", labelKey: "control.light" },
  { key: "fan", icon: "mdi:fan", labelKey: "control.fan" },
  { key: "steamer", icon: "mdi:pot-steam", labelKey: "control.steamer" },
];

export class SaunaCard extends LitElement {
  @property({ attribute: false }) hass?: Hass;

  @state() private _config: SaunaCardConfig = { type: "custom:sauna-card" };

  // Optimistic target while the device catches up (it may echo slowly, or not
  // at all in some setups), so rapid stepper clicks accumulate correctly.
  @state() private _pendingTarget?: number;

  static getStubConfig(): Record<string, unknown> {
    return {};
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
    ]) {
      if (config[key] !== undefined && typeof config[key] !== "string") {
        throw new Error(`sauna-card: "${key}" must be a string`);
      }
    }
    if (
      config.layout !== undefined &&
      !LAYOUTS.includes(config.layout as SaunaLayout)
    ) {
      throw new Error(`sauna-card: invalid layout "${String(config.layout)}"`);
    }
    this._config = config as unknown as SaunaCardConfig;
  }

  getCardSize(): number {
    return this._layout === "compact" ? 2 : 5;
  }

  getGridOptions(): Record<string, number> {
    if (this._layout === "compact") {
      return { rows: 2, columns: 12, min_columns: 6 };
    }
    return { rows: 6, columns: 12, min_columns: 6 };
  }

  private get _layout(): SaunaLayout {
    return this._config.layout ?? "status-dashboard";
  }

  private get _lang(): string {
    return detectLang(this.hass, this._config.language);
  }

  private _state(): SaunaState | null {
    if (!this.hass) return null;
    const adapter = pickIntegration(this.hass, this._config.integration);
    return adapter ? adapter.readState(this.hass, this._config) : null;
  }

  private _t(key: string, vars?: Record<string, string | number>): string {
    return t(key, this._lang, vars);
  }

  private _temp(value: number | undefined): string {
    return value === undefined ? "—" : `${Math.round(value)}°`;
  }

  // Big hero temperature: the "C" unit is only shown when a value exists, so a
  // missing reading renders as just "—" rather than "—C".
  private _heroTemp(value: number | undefined): TemplateResult {
    return value === undefined
      ? html`—`
      : html`${Math.round(value)}°<span>C</span>`;
  }

  // ---- control handlers (I6) ----

  private _toggle(s: SaunaState, key: string): void {
    const id = s.entities[key];
    if (id && this.hass) toggleSwitch(this.hass, id);
  }

  private _step(s: SaunaState, delta: number): void {
    if (!this.hass) return;
    const base = this._pendingTarget ?? s.targetTemp;
    if (base === undefined) return;
    const next = Math.max(40, Math.min(110, base + delta));
    this._pendingTarget = next;
    setTargetTemperature(this.hass, s, next);
  }

  // Clear the optimistic target once the device reports the value we set.
  protected override updated(changed: PropertyValues): void {
    if (changed.has("hass") && this._pendingTarget !== undefined && this.hass) {
      const s = this._state();
      if (s && s.targetTemp === this._pendingTarget) {
        this._pendingTarget = undefined;
      }
    }
  }

  private _setActive(s: SaunaState, active: boolean): void {
    if (!this.hass) return;
    // Honour an in-flight stepper adjustment when starting a session.
    const target = this._pendingTarget ?? s.targetTemp;
    setActive(this.hass, { ...s, targetTemp: target }, active);
  }

  private _powerOn(s: SaunaState): boolean {
    return this.hass?.states[s.entities.power]?.state === "on";
  }

  private _tempStepper(s: SaunaState): TemplateResult {
    const thermo = s.entities.thermostat;
    const thermoState = thermo ? this.hass?.states[thermo]?.state : undefined;
    const disabled =
      s.targetTemp === undefined || !thermo || entityUnavailable(thermoState);
    const shown = this._pendingTarget ?? s.targetTemp;
    const tt = this._t("label.target_temperature");
    return html`<div class="stepper">
      <button
        type="button"
        class="step"
        ?disabled=${disabled}
        @click=${() => this._step(s, -TEMP_STEP)}
        aria-label="${tt} −${TEMP_STEP}°"
      >
        −
      </button>
      <span class="tval">${this._temp(shown)}</span>
      <button
        type="button"
        class="step"
        ?disabled=${disabled}
        @click=${() => this._step(s, TEMP_STEP)}
        aria-label="${tt} +${TEMP_STEP}°"
      >
        +
      </button>
    </div>`;
  }

  private _cta(s: SaunaState): TemplateResult {
    const powerState = s.entities.power
      ? this.hass?.states[s.entities.power]?.state
      : undefined;
    const unavailable = !s.entities.power || entityUnavailable(powerState);
    const on = this._powerOn(s);
    return html`<div class="cta">
      <button
        type="button"
        class="btn ${on ? "" : "primary"}"
        ?disabled=${unavailable}
        @click=${() => this._setActive(s, !on)}
      >
        ${on ? this._t("action.turn_off") : this._t("action.start_session")}
      </button>
    </div>`;
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    const s = this._state();
    if (!s) {
      return html`<ha-card>
        <div class="empty">${this._t("card.no_device")}</div>
      </ha-card>`;
    }
    switch (this._layout) {
      case "thermostat-hero":
        return this._renderHero(s);
      case "compact":
        return this._renderCompact(s);
      default:
        return this._renderDashboard(s);
    }
  }

  // ---- shared partials ----

  private _statusBadge(s: SaunaState): TemplateResult {
    const eta =
      s.status === "heating" && s.readyEtaMinutes !== undefined
        ? ` · ${this._t("common.minutes", { count: s.readyEtaMinutes })}`
        : "";
    return html`<span class="badge status-${s.status}">
      <ha-icon icon=${STATUS_ICON[s.status]}></ha-icon>
      ${this._t(STATUS_KEY[s.status])}${eta}
    </span>`;
  }

  private _doorWarning(s: SaunaState): TemplateResult | typeof nothing {
    if (!(s.doorOpen && s.heatingActive)) return nothing;
    return html`<div class="warn" role="alert">
      <ha-icon icon="mdi:alert"></ha-icon>${this._t("label.door")}:
      ${this._t("door.open")}
    </div>`;
  }

  private _controlChips(s: SaunaState): TemplateResult {
    return html`<div class="chips">
      ${CONTROLS.filter((c) => s.entities[c.key]).map((c) => {
        const st = this.hass?.states[s.entities[c.key]]?.state;
        const unavailable = entityUnavailable(st);
        const on = st === "on";
        const label = this._t(c.labelKey);
        const stateText = this._t(
          unavailable ? "common.unavailable" : on ? "common.on" : "common.off",
        );
        // State is exposed in text (aria-label), not by colour alone (a11y).
        // Interactive toggle (switch.toggle); keyboard-operable.
        const toggle = () => this._toggle(s, c.key);
        return html`<button
          type="button"
          class="chip ${on ? "on" : ""} ${unavailable ? "unavailable" : ""}"
          ?disabled=${unavailable}
          aria-pressed=${on}
          aria-label="${label}: ${stateText}"
          title="${label}: ${stateText}"
          @click=${toggle}
        >
          <ha-icon icon=${c.icon}></ha-icon>${label}
        </button>`;
      })}
    </div>`;
  }

  private _tile(
    labelKey: string,
    value: string | typeof nothing,
  ): TemplateResult | typeof nothing {
    if (value === nothing) return nothing;
    return html`<div class="tile">
      <div class="k">${this._t(labelKey)}</div>
      <div class="v">${value}</div>
    </div>`;
  }

  // ---- layout: status-dashboard (default) ----

  private _renderDashboard(s: SaunaState): TemplateResult {
    const progress =
      s.currentTemp !== undefined && s.targetTemp && s.targetTemp > 0
        ? Math.max(0, Math.min(1, s.currentTemp / s.targetTemp))
        : 0;
    const fmt = (v: number | undefined, unit: string, dec = 0) =>
      v === undefined ? nothing : `${v.toFixed(dec)} ${unit}`;
    return html`<ha-card>
      <div class="head">
        <span class="title">${this._configName(s)}</span>
        ${this._statusBadge(s)}
      </div>
      <div class="body">
        <div class="hero">
          <div class="cur">${this._heroTemp(s.currentTemp)}</div>
          <div class="tgt">
            <span>${this._t("label.target_temperature")}</span>
            ${this._tempStepper(s)}
          </div>
        </div>
        ${s.status === "heating"
          ? html`<div class="progress">
                <i style=${`width:${(progress * 100).toFixed(0)}%`}></i>
              </div>
              ${s.readyEtaMinutes !== undefined
                ? html`<div class="eta">
                    ${this._t("state.ready")}:
                    ${this._t("common.minutes", { count: s.readyEtaMinutes })}
                  </div>`
                : nothing}`
          : nothing}
        ${this._doorWarning(s)}
        <div class="tiles">
          ${this._tile("label.humidity", fmt(s.humidity, "%"))}
          ${this._tile("label.power", fmt(s.power, "W"))}
          ${this._tile("label.energy", fmt(s.energy, "kWh", 1))}
          ${this._tile(
            "label.remaining_time",
            s.remainingMinutes === undefined
              ? nothing
              : this._t("common.minutes", { count: s.remainingMinutes }),
          )}
          ${this._tile(
            "label.door",
            s.doorOpen === undefined
              ? nothing
              : this._t(s.doorOpen ? "door.open" : "door.closed"),
          )}
          ${this._tile(
            "label.sessions_today",
            s.sessionsToday === undefined ? nothing : `${s.sessionsToday}`,
          )}
        </div>
        ${this._controlChips(s)} ${this._cta(s)}
      </div>
    </ha-card>`;
  }

  // ---- layout: thermostat-hero ----

  private _renderHero(s: SaunaState): TemplateResult {
    // 270° gauge, rotated so the 90° gap sits at the bottom.
    const progress =
      s.currentTemp !== undefined && s.targetTemp && s.targetTemp > 0
        ? Math.max(0, Math.min(1, s.currentTemp / s.targetTemp))
        : 0;
    // r=100 → circumference ≈ 628.3; a 270° gauge shows 0.75 of it.
    const CIRC = 2 * Math.PI * 100;
    const ARC = CIRC * 0.75;
    const arcColor =
      s.status === "ready"
        ? "var(--success-color, #43a047)"
        : "var(--sauna-heat-color, #ff7a18)";
    return html`<ha-card>
      <div class="head">
        <span class="title">${this._configName(s)}</span>
        ${this._statusBadge(s)}
      </div>
      <div class="dial">
        <svg viewBox="0 0 240 240">
          <circle
            class="track"
            cx="120"
            cy="120"
            r="100"
            stroke-dasharray="${ARC.toFixed(1)} ${CIRC.toFixed(1)}"
            transform="rotate(135 120 120)"
          />
          <circle
            cx="120"
            cy="120"
            r="100"
            stroke=${arcColor}
            stroke-dasharray="${(ARC * progress).toFixed(1)} ${CIRC.toFixed(1)}"
            transform="rotate(135 120 120)"
          />
        </svg>
        <div class="center">
          <div class="cur">${this._heroTemp(s.currentTemp)}</div>
          <div class="tgt">
            ${this._t("label.target_temperature")}
            <b>${this._temp(s.targetTemp)}</b>
          </div>
        </div>
      </div>
      ${this._doorWarning(s)} ${this._tempStepper(s)} ${this._controlChips(s)}
      ${this._cta(s)}
    </ha-card>`;
  }

  // ---- layout: compact ----

  private _renderCompact(s: SaunaState): TemplateResult {
    const detail =
      s.status === "heating" && s.readyEtaMinutes !== undefined
        ? `${this._temp(s.currentTemp)} → ${this._temp(s.targetTemp)} · ${this._t(
            "common.minutes",
            { count: s.readyEtaMinutes },
          )}`
        : `${this._temp(s.currentTemp)}`;
    return html`<ha-card>
      <div class="compact">
        <div class="ic status-${s.status}">
          <ha-icon icon=${STATUS_ICON[s.status]}></ha-icon>
        </div>
        <div class="txt">
          <div class="name">${this._configName(s)}</div>
          <div class="sub">${this._t(STATUS_KEY[s.status])} · ${detail}</div>
        </div>
        <div class="big">${this._temp(s.currentTemp)}</div>
      </div>
      ${this._doorWarning(s)}
    </ha-card>`;
  }

  private _configName(s: SaunaState): string {
    if (this._config.name) return this._config.name;
    const dev = this.hass?.devices?.[s.deviceId];
    return dev?.name_by_user ?? dev?.name ?? this._t("card.name");
  }

  static override styles = css`
    :host {
      --sauna-heat-color: #ff7a18;
    }
    ha-card {
      padding: 16px;
      color: var(--primary-text-color);
    }
    .empty {
      padding: 8px;
      color: var(--secondary-text-color);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .title {
      font-weight: 600;
      font-size: 1.05rem;
    }
    .head .badge {
      margin-left: auto;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
    }
    .badge ha-icon {
      --mdc-icon-size: 16px;
    }
    .status-heating {
      color: var(--sauna-heat-color);
    }
    .status-ready {
      color: var(--success-color, #43a047);
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .hero {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .hero .cur {
      font-size: 3rem;
      font-weight: 300;
      line-height: 1;
    }
    .hero .cur span {
      font-size: 1.2rem;
      color: var(--secondary-text-color);
      margin-left: 2px;
    }
    .tgt {
      display: flex;
      flex-direction: column;
      font-size: 0.8rem;
      color: var(--secondary-text-color);
    }
    .tgt b {
      color: var(--sauna-heat-color);
      font-size: 1rem;
    }
    .progress {
      height: 8px;
      border-radius: 999px;
      background: var(--divider-color);
      overflow: hidden;
    }
    .progress > i {
      display: block;
      height: 100%;
      background: var(--sauna-heat-color);
    }
    .eta {
      font-size: 0.8rem;
      color: var(--secondary-text-color);
    }
    .warn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 11px;
      border-radius: 10px;
      font-size: 0.85rem;
      font-weight: 600;
      /* --text-primary-color is HA's "text on a coloured background" var
         (defaults to white), distinct from --primary-text-color (body text). */
      color: var(--text-primary-color, #fff);
      background: var(--error-color, #db4437);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .tile {
      background: var(--secondary-background-color);
      border-radius: 12px;
      padding: 10px;
    }
    .tile .k {
      font-size: 0.7rem;
      color: var(--secondary-text-color);
    }
    .tile .v {
      font-size: 1.05rem;
      font-weight: 600;
      margin-top: 2px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      font-weight: 550;
      padding: 6px 11px;
      border-radius: 999px;
      border: 1px solid var(--divider-color);
      color: var(--secondary-text-color);
    }
    .chip.on {
      color: var(--primary-text-color);
      border-color: var(--primary-color);
      background: var(--secondary-background-color);
    }
    .chip {
      cursor: pointer;
      font-family: inherit;
      appearance: none;
      -webkit-appearance: none;
    }
    .chip:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .stepper {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .stepper .tval {
      font-weight: 650;
      color: var(--sauna-heat-color);
      min-width: 2.6em;
      text-align: center;
    }
    .step {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
    }
    .step:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .cta {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    .btn {
      flex: 1;
      padding: 11px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.85rem;
      font-family: inherit;
      appearance: none;
      -webkit-appearance: none;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      cursor: pointer;
    }
    .btn.primary {
      background: var(--sauna-heat-color);
      border: none;
      color: var(--text-primary-color, #fff);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .chip ha-icon {
      --mdc-icon-size: 18px;
    }
    .dial {
      position: relative;
      width: 220px;
      height: 220px;
      margin: 4px auto 12px;
    }
    .dial svg {
      width: 100%;
      height: 100%;
    }
    .dial circle {
      fill: none;
      stroke-width: 14;
      stroke-linecap: round;
    }
    .dial .track {
      stroke: var(--divider-color);
    }
    .dial .center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .dial .cur {
      font-size: 2.6rem;
      font-weight: 300;
    }
    .dial .cur span {
      font-size: 1rem;
      color: var(--secondary-text-color);
    }
    .dial .tgt {
      flex-direction: row;
      gap: 5px;
      margin-top: 4px;
    }
    .compact {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .compact .ic {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--secondary-background-color);
    }
    .compact .ic ha-icon {
      --mdc-icon-size: 24px;
    }
    .compact .name {
      font-weight: 600;
    }
    .compact .sub {
      font-size: 0.85rem;
      color: var(--secondary-text-color);
    }
    .compact .big {
      margin-left: auto;
      font-size: 1.8rem;
      font-weight: 300;
    }
    @media (prefers-reduced-motion: reduce) {
      .progress > i {
        transition: none;
      }
    }
  `;
}

if (!customElements.get("sauna-card")) {
  customElements.define("sauna-card", SaunaCard);
}

declare global {
  interface HTMLElementTagNameMap {
    "sauna-card": SaunaCard;
  }
}
