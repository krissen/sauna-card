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
  SaunaLayout,
  ControlsMode,
} from "./types";
import { pickIntegration } from "./adapter-registry";
import {
  STATUS_ICON,
  STATUS_KEY,
  BADGE_ITEMS,
  isBadgeItemKey,
  type BadgeItemKey,
} from "./status";
import { detectLang, t } from "./i18n";
import {
  toggleSwitch,
  setTargetTemperature,
  setActive,
  MIN_TEMP,
  MAX_TEMP,
} from "./controls";

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

const CONTROLS_MODES: ControlsMode[] = ["none", "power", "power+temp"];

// The compact slots shown when the user hasn't customized them.
export const DEFAULT_COMPACT_SLOTS = {
  left: "status",
  mid: "name",
  right: "current_temp",
} as const;

// The status-dashboard tiles shown when the user hasn't customized them.
export const DEFAULT_DASHBOARD_TILES: BadgeItemKey[] = [
  "humidity",
  "power",
  "energy",
  "remaining",
  "door",
  "sessions",
];

// Read-only control chips shown in I5. Interactivity (callService) lands in I6.
const CONTROLS: Array<{ key: string; icon: string; labelKey: string }> = [
  { key: "power", icon: "mdi:power", labelKey: "control.power" },
  { key: "light", icon: "mdi:lightbulb", labelKey: "control.light" },
  { key: "fan", icon: "mdi:fan", labelKey: "control.fan" },
  { key: "steamer", icon: "mdi:pot-steam", labelKey: "control.steamer" },
];

// After a start, the integration optimistically flips power on, then the device
// reverts to off if it refuses (e.g. the door is open). We wait this long before
// concluding a start was blocked, so the optimistic on→off "blink" has settled.
// Observed door/state latency is ~3 s; 5 s leaves margin against a slow but
// genuine start being misreported as failed.
const START_GRACE_MS = 5000;

export class SaunaCard extends LitElement {
  @property({ attribute: false }) hass?: Hass;

  @state() private _config: SaunaCardConfig = { type: "custom:sauna-card" };

  // Optimistic target while the device catches up (it may echo slowly, or not
  // at all in some setups), so rapid stepper clicks accumulate correctly.
  @state() private _pendingTarget?: number;

  // i18n key of a "start didn't take" notice, surfaced when a start attempt
  // hasn't put the sauna into a running state after START_GRACE_MS. Cleared on a
  // new action or once the sauna actually runs.
  @state() private _startFailed?: string;
  private _startTimer?: number;

  static getStubConfig(): Record<string, unknown> {
    return {};
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("sauna-card-editor");
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
    for (const key of ["dashboard_tiles", "hero_items"]) {
      if (config[key] !== undefined && !Array.isArray(config[key])) {
        throw new Error(`sauna-card: "${key}" must be an array`);
      }
    }
    if (
      config.compact_slots !== undefined &&
      !isPlainObject(config.compact_slots)
    ) {
      throw new Error(`sauna-card: "compact_slots" must be an object`);
    }
    if (
      config.controls !== undefined &&
      !CONTROLS_MODES.includes(config.controls as ControlsMode)
    ) {
      throw new Error(
        `sauna-card: invalid controls "${String(config.controls)}"`,
      );
    }
    this._config = config as unknown as SaunaCardConfig;
  }

  getCardSize(): number {
    if (this._layout === "compact") {
      return this._controls === "none" ? 2 : 3;
    }
    return 5;
  }

  getGridOptions(): Record<string, number> {
    if (this._layout === "compact") {
      const rows = this._controls === "none" ? 2 : 3;
      return { rows, columns: 12, min_columns: 6 };
    }
    return { rows: 6, columns: 12, min_columns: 6 };
  }

  private get _layout(): SaunaLayout {
    return this._config.layout ?? "status-dashboard";
  }

  private get _controls(): ControlsMode {
    return this._config.controls ?? "power+temp";
  }

  /** Control chips, unless controls are off. */
  private _chips(s: SaunaState): TemplateResult | typeof nothing {
    return this._controls === "none" ? nothing : this._controlChips(s);
  }

  /** Start/stop CTA, unless controls are off. */
  private _ctaIf(s: SaunaState): TemplateResult | typeof nothing {
    return this._controls === "none" ? nothing : this._cta(s);
  }

  /** Temperature control: the stepper when enabled, else a static target. */
  private _targetControl(s: SaunaState): TemplateResult {
    return this._controls === "power+temp"
      ? this._tempStepper(s)
      : html`<b class="tval">${this._temp(this._effectiveTarget(s))}</b>`;
  }

  private get _lang(): string {
    return detectLang(this.hass, this._config.language);
  }

  private _state(): SaunaState | null {
    if (!this.hass) return null;
    const adapter = pickIntegration(this.hass, this._config.integration);
    return adapter ? adapter.readState(this.hass, this._config) : null;
  }

  // Arrow field so it stays bound when passed as a callback (e.g. to a catalog
  // item's value(s, tr)); a plain method would lose `this` and read _lang of
  // undefined.
  private _t = (key: string, vars?: Record<string, string | number>): string =>
    t(key, this._lang, vars);

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
    // Round to match what setTargetTemperature sends, so the optimistic value
    // shown never disagrees with the value actually requested.
    const next = Math.max(
      MIN_TEMP,
      Math.min(MAX_TEMP, Math.round(base + delta)),
    );
    this._pendingTarget = next;
    setTargetTemperature(this.hass, s, next);
  }

  override disconnectedCallback(): void {
    this._clearStartTimer();
    super.disconnectedCallback();
  }

  // Clear the optimistic target once the device reports the value we set, and
  // drop a stale "start failed" notice once the sauna is actually running.
  protected override updated(changed: PropertyValues): void {
    if (!changed.has("hass") || !this.hass) return;
    const s = this._state();
    if (
      this._pendingTarget !== undefined &&
      s &&
      s.targetTemp === this._pendingTarget
    ) {
      this._pendingTarget = undefined;
    }
    if (this._startFailed && s && (this._powerOn(s) || s.status === "heating")) {
      this._startFailed = undefined;
    }
  }

  private _clearStartTimer(): void {
    if (this._startTimer !== undefined) {
      window.clearTimeout(this._startTimer);
      this._startTimer = undefined;
    }
  }

  private _setActive(s: SaunaState, active: boolean): void {
    if (!this.hass) return;
    // Any fresh start/stop supersedes a prior attempt's pending detection and
    // its notice.
    this._clearStartTimer();
    this._startFailed = undefined;
    if (active) {
      // Evaluate after the grace period: if the sauna still isn't running, the
      // device refused the start — surface why instead of a silent blink.
      this._startTimer = window.setTimeout(() => {
        this._startTimer = undefined;
        const cur = this._state();
        if (cur && !this._powerOn(cur) && cur.status !== "heating") {
          this._startFailed = this._failureReason(cur);
        }
      }, START_GRACE_MS);
    }
    // Honour an in-flight stepper adjustment when starting a session.
    setActive(
      this.hass,
      { ...s, targetTemp: this._effectiveTarget(s) },
      active,
    );
  }

  /** Best-known reason a start was refused, as an i18n key. */
  private _failureReason(s: SaunaState): string {
    if (s.doorOpen) return "warn.start_failed_door";
    return "warn.start_failed";
  }

  /**
   * The notice to show in the dashboard progress slot / hero+compact banner:
   * a fired start failure (error), or a proactive "door open, can't start"
   * (warn) while the sauna is off. Null when there's nothing to say.
   */
  private _startNotice(
    s: SaunaState,
  ): { key: string; kind: "error" | "warn" } | null {
    if (this._startFailed) return { key: this._startFailed, kind: "error" };
    if (s.doorOpen && !this._powerOn(s)) {
      return { key: "warn.cannot_start_door", kind: "warn" };
    }
    return null;
  }

  /** Optimistic pending target if set, otherwise the device's reported target. */
  private _effectiveTarget(s: SaunaState): number | undefined {
    return this._pendingTarget ?? s.targetTemp;
  }

  private _powerOn(s: SaunaState): boolean {
    const id = s.entities.power;
    return id ? this.hass?.states[id]?.state === "on" : false;
  }

  private _tempStepper(s: SaunaState): TemplateResult {
    const thermo = s.entities.thermostat;
    const thermoState = thermo ? this.hass?.states[thermo]?.state : undefined;
    const disabled =
      s.targetTemp === undefined || !thermo || entityUnavailable(thermoState);
    const shown = this._effectiveTarget(s);
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

  /** Render one catalog item as a tile; hides when its datum is absent. */
  private _itemTile(
    s: SaunaState,
    key: BadgeItemKey,
  ): TemplateResult | typeof nothing {
    const def = BADGE_ITEMS[key];
    const v = def.value(s, this._t);
    if (!v) return nothing;
    return this._tile(def.labelKey, `${v.text}${v.unit ? ` ${v.unit}` : ""}`);
  }

  /** A tile grid for a configured, ordered list of item keys (per layout). */
  private _tilesRow(
    s: SaunaState,
    keys: readonly string[],
  ): TemplateResult | typeof nothing {
    // Build the tiles first and drop the container entirely when every
    // configured item is absent, so we never render an empty grid.
    const tiles = keys
      .filter(isBadgeItemKey)
      .map((k) => this._itemTile(s, k))
      .filter((tile) => tile !== nothing);
    if (!tiles.length) return nothing;
    return html`<div class="tiles">${tiles}</div>`;
  }

  // The progress bar and ETA line are always rendered (the bar empty, the ETA
  // blank) so starting/stopping a session doesn't reflow the card height — only
  // their contents change, never the layout. Reserving the space avoids the
  // "jump" when the heating block appears.
  private _heatProgress(s: SaunaState, progress: number): TemplateResult {
    const heating = s.status === "heating";
    const width = heating ? (progress * 100).toFixed(0) : "0";
    const showEta = heating && s.readyEtaMinutes !== undefined;
    // A start failure / "can't start" notice takes over the reserved ETA slot,
    // so a blocked start shows here instead of silently blinking off.
    const notice = this._startNotice(s);
    const etaClass = notice ? `eta ${notice.kind}` : "eta";
    const etaShown = notice || showEta;
    return html`<div class="progress" aria-hidden=${heating ? "false" : "true"}>
        <i style=${`width:${width}%`}></i>
      </div>
      <div
        class=${etaClass}
        role=${notice ? "alert" : nothing}
        aria-hidden=${etaShown ? "false" : "true"}
      >
        ${notice
          ? this._t(notice.key)
          : showEta
            ? html`${this._t("state.ready")}:
              ${this._t("common.minutes", { count: s.readyEtaMinutes! })}`
            : html`&nbsp;`}
      </div>`;
  }

  /**
   * Start failure / "can't start" notice as a standalone banner, for the hero
   * and compact layouts which have no progress-slot to host it.
   */
  private _notices(s: SaunaState): TemplateResult | typeof nothing {
    const notice = this._startNotice(s);
    if (!notice) return nothing;
    const cls = notice.kind === "warn" ? "warn caution" : "warn";
    return html`<div class=${cls} role="alert">
      <ha-icon icon="mdi:alert"></ha-icon>${this._t(notice.key)}
    </div>`;
  }

  // ---- layout: status-dashboard (default) ----

  private _renderDashboard(s: SaunaState): TemplateResult {
    const progress =
      s.currentTemp !== undefined && s.targetTemp && s.targetTemp > 0
        ? Math.max(0, Math.min(1, s.currentTemp / s.targetTemp))
        : 0;
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
            ${this._targetControl(s)}
          </div>
        </div>
        ${this._heatProgress(s, progress)} ${this._doorWarning(s)}
        ${this._tilesRow(
          s,
          this._config.dashboard_tiles ?? DEFAULT_DASHBOARD_TILES,
        )}
        ${this._chips(s)} ${this._ctaIf(s)}
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
            <b>${this._temp(this._effectiveTarget(s))}</b>
          </div>
        </div>
      </div>
      ${this._doorWarning(s)} ${this._notices(s)}
      ${this._controls === "power+temp" ? this._tempStepper(s) : nothing}
      ${this._tilesRow(s, this._config.hero_items ?? [])} ${this._chips(s)}
      ${this._ctaIf(s)}
    </ha-card>`;
  }

  // ---- layout: compact ----

  /** Render one compact slot: an item, the device name, or nothing. */
  private _slot(
    s: SaunaState,
    value: string | undefined,
  ): TemplateResult | typeof nothing {
    if (!value || value === "none") return nothing;
    if (value === "name") {
      return html`<span class="cname">${this._configName(s)}</span>`;
    }
    if (!isBadgeItemKey(value)) return nothing;
    const def = BADGE_ITEMS[value];
    const v = def.value(s, this._t);
    if (!v) return nothing;
    const cls = def.statusTinted ? `status-${s.status}` : "";
    return html`<span class="citem ${cls}">
      <ha-icon icon=${def.icon(s)}></ha-icon>
      <span class="cval"
        >${v.text}${v.unit
          ? html`<span class="cunit">${v.unit}</span>`
          : nothing}</span
      >
    </span>`;
  }

  private _renderCompact(s: SaunaState): TemplateResult {
    // Merge over the defaults so a partial config (e.g. only `left`) still
    // fills the other slots rather than leaving them blank.
    const slots = { ...DEFAULT_COMPACT_SLOTS, ...this._config.compact_slots };
    return html`<ha-card>
      <div class="compact">
        <div class="cslot left">${this._slot(s, slots.left)}</div>
        <div class="cslot mid">${this._slot(s, slots.mid)}</div>
        <div class="cslot right">${this._slot(s, slots.right)}</div>
      </div>
      ${this._controls === "none"
        ? nothing
        : html`<div class="ccontrols">
              ${this._controls === "power+temp"
                ? this._tempStepper(s)
                : nothing}
              ${this._cta(s)}
            </div>
            ${this._controlChips(s)}`}
      ${this._doorWarning(s)} ${this._notices(s)}
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
      /* Reserve one line so the ETA appearing/disappearing never shifts layout. */
      min-height: 1.1em;
    }
    /* A start failure / "can't start" notice borrows the ETA slot; colour the
       text (the slot is plain text, not a filled banner) without reflowing. */
    .eta.error {
      color: var(--error-color, #db4437);
      font-weight: 600;
    }
    .eta.warn {
      color: var(--warning-color, #ffa600);
      font-weight: 600;
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
    /* Proactive "can't start" banner (hero/compact) reads as a caution, not a
       hard error, so it uses the warning colour. */
    .warn.caution {
      background: var(--warning-color, #ffa600);
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
      background: transparent;
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
    /* Applies both inside the stepper and to the static target value shown when
       the temperature control is disabled (_targetControl). */
    .tval {
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
    .cslot {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .cslot.mid {
      flex: 1;
      justify-content: center;
    }
    .cslot.right {
      margin-left: auto;
    }
    .cname {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .citem {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--secondary-text-color);
    }
    .citem ha-icon {
      --mdc-icon-size: 24px;
    }
    .citem .cval {
      font-weight: 600;
      font-size: 1.1rem;
      color: var(--primary-text-color);
    }
    /* status tint (from .status-heating/.status-ready) flows to icon + value */
    .citem.status-heating .cval,
    .citem.status-ready .cval {
      color: inherit;
    }
    .cunit {
      font-size: 0.66em;
      color: var(--secondary-text-color);
      margin-left: 1px;
    }
    .ccontrols {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
    }
    .ccontrols .cta {
      flex: 1;
      margin-top: 0;
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
