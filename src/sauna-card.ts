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
  ControlsMode,
  HassUnsubscribe,
} from "./types";
import {
  graphPhase,
  isCooldownExpired,
  mergeHistory,
  HEATUP_WINDOW_MS,
  COOLDOWN_SAMPLE_INTERVAL_MS,
  COOLDOWN_MAX_MS,
  type TempSample,
  type CooldownAnchor,
} from "./graph-phase";
import { fetchHistory } from "./utils/history";
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

// Ready-ETA rate is computed over this recent sub-window of the sample buffer,
// not the whole buffer: the heat curve is fast-early/slow-late, so a recent
// slope tracks the true remaining time near target instead of skewing optimistic.
const ETA_RATE_WINDOW_MS = 8 * 60000;

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

  // Observed (time, temperature) samples during the current heat-up, used to
  // derive a live ready-ETA when the integration's temp_trend sensor is absent
  // (it's disabled by default). Reset when heating stops or the target changes.
  private _tempSamples: Array<{ t: number; temp: number }> = [];
  private _trendCtx?: string;

  // ---- temperature graph (heatup / cooldown) ----
  // Separate from _tempSamples above: that buffer is coupled to _localEta's
  // reset semantics and capped at ~20 min. The graph needs its own, longer
  // buffers with phase-specific sampling and lifetimes.
  private _heatupSamples: TempSample[] = [];
  private _cooldownSamples: TempSample[] = [];
  // Context key (device|target) the heatup buffer belongs to; a change clears it.
  private _graphCtx?: string;
  // Open cooldown window, if any (set on shutdown after a session).
  private _cooldownAnchor?: CooldownAnchor;
  // Temperature the current/last session started from (≈ room temp), captured at
  // the off/idle → heating transition and reused as the cooldown baseline.
  private _sessionStartTemp?: number;
  // When the current session's heating began (epoch ms) — the start of the
  // recorder window used to backfill the heatup curve (Stage B).
  private _sessionStartAt?: number;
  // Phase keys whose history has already been fetched, so Stage B runs once per
  // window instead of on every update.
  private _historyFetched = new Set<string>();
  // Previous status, for edge detection in _trackGraph.
  private _prevStatus?: SaunaStatus;
  // Event-subscription teardown handles.
  private _unsubStart?: HassUnsubscribe;
  private _unsubEnd?: HassUnsubscribe;

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
    for (const key of ["show_heatup_graph", "show_cooldown_graph"]) {
      if (config[key] !== undefined && typeof config[key] !== "boolean") {
        throw new Error(`sauna-card: "${key}" must be a boolean`);
      }
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

  override connectedCallback(): void {
    super.connectedCallback();
    // hass may not be set yet at connect time; updated() also calls this once it
    // is. Subscribing here covers a re-attach where hass is already present.
    this._ensureSubscribed();
  }

  override disconnectedCallback(): void {
    this._clearStartTimer();
    this._unsubStart?.().catch(() => undefined);
    this._unsubEnd?.().catch(() => undefined);
    this._unsubStart = undefined;
    this._unsubEnd = undefined;
    super.disconnectedCallback();
  }

  // Subscribe to the integration's session events once hass is available. The
  // session-start event gives the most precise pre-heat (≈ room) temperature for
  // the cooldown baseline; phase transitions are still derived from status so
  // the graph works even if an event is missed.
  private _ensureSubscribed(): void {
    if (this._unsubStart || !this.hass?.connection) return;
    const conn = this.hass.connection;
    conn
      .subscribeEvents<{ data?: Record<string, unknown> }>(
        () => this._onSessionStart(),
        "harvia_sauna_session_start",
      )
      .then((unsub) => {
        this._unsubStart = unsub;
      })
      .catch(() => undefined);
    conn
      .subscribeEvents<{ data?: Record<string, unknown> }>(
        () => this._onSessionEnd(),
        "harvia_sauna_session_end",
      )
      .then((unsub) => {
        this._unsubEnd = unsub;
      })
      .catch(() => undefined);
  }

  private _onSessionStart(): void {
    const s = this._state();
    if (s?.currentTemp !== undefined) this._sessionStartTemp = s.currentTemp;
  }

  private _onSessionEnd(): void {
    // The heating|ready → off|idle transition in _trackGraph opens the cooldown
    // window; nudge a re-evaluation so it happens promptly on the event too.
    this.requestUpdate();
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
    if (
      this._startFailed &&
      s &&
      (this._powerOn(s) || s.status === "heating")
    ) {
      this._startFailed = undefined;
    }
    this._trackTemp(s);
    this._ensureSubscribed();
  }

  // Drive the graph buffers BEFORE render (not in updated()), so a sample added
  // this beat is on screen the same beat — no one-frame lag and no extra render.
  protected override willUpdate(changed: PropertyValues): void {
    if (!changed.has("hass") || !this.hass) return;
    this._trackGraph(this._state());
  }

  // Drive the graph phase model and per-phase sample buffers. Kept independent of
  // _trackTemp/_tempSamples above (those serve _localEta and reset on a ~20-min
  // window); the graph needs longer, phase-specific buffers.
  private _trackGraph(s: SaunaState | null): void {
    const now = Date.now();
    const status = s?.status;
    const prev = this._prevStatus;

    // Capture the pre-heat (≈ room) temperature at the moment heating begins —
    // the cooldown baseline. The session-start event refines this when it fires.
    if (
      status === "heating" &&
      prev !== "heating" &&
      prev !== "ready" &&
      s?.currentTemp !== undefined
    ) {
      this._sessionStartTemp = s.currentTemp;
      this._sessionStartAt = now;
    }

    // Open a cooldown window when a running sauna is switched off.
    if (
      (prev === "heating" || prev === "ready") &&
      (status === "off" || status === "idle")
    ) {
      const baseline = this._sessionStartTemp ?? s?.currentTemp;
      if (baseline !== undefined) {
        this._cooldownAnchor = { startedAt: now, baselineTemp: baseline };
        this._cooldownSamples = [];
      }
    }

    // Close an expired cooldown window. A momentary unavailability (!s) only
    // skips sampling — it must not discard an in-progress cooldown.
    if (this._cooldownAnchor && s) {
      if (isCooldownExpired(this._cooldownAnchor, s.currentTemp, now)) {
        this._cooldownAnchor = undefined;
        this._cooldownSamples = [];
      }
    }

    const phase = s
      ? graphPhase(s.status, s.currentTemp, s.targetTemp, this._cooldownAnchor)
      : null;

    if (phase === "heatup" && s?.currentTemp !== undefined) {
      const ctx = `${s.deviceId}|${s.targetTemp ?? ""}`;
      if (ctx !== this._graphCtx) {
        this._graphCtx = ctx;
        this._heatupSamples = [];
      }
      this._pushSample(this._heatupSamples, now, s.currentTemp, {
        onChange: true,
        minGapMs: 60000,
        windowMs: HEATUP_WINDOW_MS,
      });
    } else {
      // Left the heatup window — a later session starts a fresh curve.
      this._graphCtx = undefined;
    }

    if (phase === "cooldown" && s?.currentTemp !== undefined) {
      this._pushSample(this._cooldownSamples, now, s.currentTemp, {
        onChange: false,
        minGapMs: COOLDOWN_SAMPLE_INTERVAL_MS,
        windowMs: COOLDOWN_MAX_MS,
      });
    }

    if (s && phase) this._maybeFetchHistory(s, phase, now);

    this._prevStatus = status;
  }

  /** A stable id for the open window, so history is fetched once per window. */
  private _phaseKey(
    s: SaunaState,
    phase: "heatup" | "cooldown",
  ): string | null {
    if (phase === "heatup") return `heatup|${s.deviceId}|${s.targetTemp ?? ""}`;
    if (this._cooldownAnchor) {
      return `cooldown|${s.deviceId}|${this._cooldownAnchor.startedAt}`;
    }
    return null;
  }

  /**
   * Stage B: once per window, backfill the curve from the HA recorder so it
   * covers the whole session and survives a reload. Fire-and-forget; merges the
   * fetched samples into the live buffer (additive, never clobbering live data)
   * and re-renders. Skipped without recorder access (e.g. in tests).
   */
  private _maybeFetchHistory(
    s: SaunaState,
    phase: "heatup" | "cooldown",
    now: number,
  ): void {
    if (!this.hass?.callWS) return;
    const entityId = s.entities.currentTemperature;
    if (!entityId) return;
    const key = this._phaseKey(s, phase);
    if (!key || this._historyFetched.has(key)) return;
    this._historyFetched.add(key);

    const startMs =
      phase === "heatup"
        ? (this._sessionStartAt ?? now - HEATUP_WINDOW_MS)
        : (this._cooldownAnchor?.startedAt ?? now);

    fetchHistory(this.hass, entityId, new Date(startMs), new Date(now))
      .then((remote) => {
        if (!remote.length) return;
        // The window may have changed while the fetch was in flight; only merge
        // if the same window is still open.
        const cur = this._state();
        const curPhase = cur ? this._graphPhaseFor(cur) : null;
        if (!cur || !curPhase || this._phaseKey(cur, curPhase) !== key) return;
        if (curPhase === "heatup") {
          this._heatupSamples = mergeHistory(this._heatupSamples, remote);
        } else {
          this._cooldownSamples = mergeHistory(this._cooldownSamples, remote);
        }
        this.requestUpdate();
      })
      .catch(() => undefined);
  }

  // Append a sample to a buffer when due, and trim to a trailing time window.
  // `onChange` records on every temperature change (heatup, fast); otherwise the
  // sample is purely time-gated by `minGapMs` (cooldown, slow and sparse).
  private _pushSample(
    buf: TempSample[],
    now: number,
    temp: number,
    opts: { onChange: boolean; minGapMs: number; windowMs: number },
  ): void {
    const last = buf[buf.length - 1];
    const due =
      !last ||
      (opts.onChange && last.temp !== temp) ||
      now - last.t >= opts.minGapMs;
    if (due) buf.push({ t: now, temp });
    const cutoff = now - opts.windowMs;
    while (buf.length && buf[0].t < cutoff) buf.shift();
  }

  // Accumulate temperature samples while heating so _localEta can estimate a
  // countdown. Records on a temperature change (or at most once a minute) and
  // keeps a trailing ~20-minute window; clears on a fresh heat-up / target.
  private _trackTemp(s: SaunaState | null): void {
    if (!s || s.status !== "heating" || s.currentTemp === undefined) {
      this._tempSamples = [];
      this._trendCtx = undefined;
      return;
    }
    const ctx = `${s.deviceId}|${s.targetTemp ?? ""}`;
    if (ctx !== this._trendCtx) {
      this._trendCtx = ctx;
      this._tempSamples = [];
    }
    const now = Date.now();
    const last = this._tempSamples[this._tempSamples.length - 1];
    if (!last || last.temp !== s.currentTemp || now - last.t >= 60000) {
      this._tempSamples.push({ t: now, temp: s.currentTemp });
    }
    const cutoff = now - 20 * 60000;
    this._tempSamples = this._tempSamples.filter((p) => p.t >= cutoff);
  }

  /** Minutes until the sauna reaches target, or undefined when unknown. */
  private _eta(s: SaunaState): number | undefined {
    // Prefer the integration's temp_trend-based estimate (smoother) when the
    // sensor is enabled; otherwise fall back to our own observed trend.
    return s.readyEtaMinutes ?? this._localEta(s);
  }

  /** Ready-ETA derived from our own observed temperature samples. */
  private _localEta(s: SaunaState): number | undefined {
    if (
      s.status !== "heating" ||
      s.currentTemp === undefined ||
      s.targetTemp === undefined ||
      s.currentTemp >= s.targetTemp
    ) {
      return undefined;
    }
    const pts = this._tempSamples;
    if (pts.length < 2) return undefined;
    const last = pts[pts.length - 1];
    // Rate from the recent slope (last ETA_RATE_WINDOW_MS), not the whole buffer.
    const recent = pts.filter((p) => last.t - p.t <= ETA_RATE_WINDOW_MS);
    const first = recent[0];
    const dtMin = (last.t - first.t) / 60000;
    const dTemp = last.temp - first.temp;
    // Need a meaningful, rising span before estimating.
    if (dtMin < 2 || dTemp <= 0) return undefined;
    const rate = dTemp / dtMin; // °C per minute
    const raw = (s.targetTemp - s.currentTemp) / rate;
    if (!isFinite(raw) || raw <= 0) return undefined;
    // Round to the nearest 5 min — it's an estimate, and this curbs flicker.
    return Math.max(5, Math.round(raw / 5) * 5);
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
      // The proactive door notice is part of an actual start attempt only (not
      // shown for an idle sauna resting with the door open): if the door is open
      // now the device will refuse, so say so at once instead of after the grace.
      if (s.doorOpen) this._startFailed = "warn.cannot_start_door";
      // Re-check after the grace period: clear if it actually started, else
      // surface why it didn't — instead of a silent on→off blink.
      this._startTimer = window.setTimeout(() => {
        this._startTimer = undefined;
        const cur = this._state();
        if (!cur) return;
        this._startFailed =
          this._powerOn(cur) || cur.status === "heating"
            ? undefined
            : this._failureReason(cur);
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
    if (s.doorOpen) return "warn.cannot_start_door";
    return "warn.start_failed";
  }

  /**
   * The notice to show in the dashboard progress slot / hero+compact banner for
   * the current/last start attempt: the door-open block reads as a caution
   * (warn), other failures as an error. Null when there's nothing to say — in
   * particular, an idle sauna with the door open shows nothing.
   */
  private _startNotice(): { key: string; kind: "error" | "warn" } | null {
    if (!this._startFailed) return null;
    const kind =
      this._startFailed === "warn.cannot_start_door" ? "warn" : "error";
    return { key: this._startFailed, kind };
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
    const etaMin = s.status === "heating" ? this._eta(s) : undefined;
    const eta =
      etaMin !== undefined
        ? ` · ${this._t("common.minutes", { count: etaMin })}`
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
    const etaMin = heating ? this._eta(s) : undefined;
    const showEta = etaMin !== undefined;
    // A start failure / "can't start" notice takes over the reserved ETA slot,
    // so a blocked start shows here instead of silently blinking off.
    const notice = this._startNotice();
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
              ${this._t("common.minutes", { count: etaMin! })}`
            : html`&nbsp;`}
      </div>`;
  }

  /**
   * Start failure / "can't start" notice as a standalone banner, for the hero
   * and compact layouts which have no progress-slot to host it.
   */
  private _notices(): TemplateResult | typeof nothing {
    const notice = this._startNotice();
    if (!notice) return nothing;
    const cls = notice.kind === "warn" ? "warn caution" : "warn";
    return html`<div class=${cls} role="alert">
      <ha-icon icon="mdi:alert"></ha-icon>${this._t(notice.key)}
    </div>`;
  }

  // ---- temperature graph (heatup / cooldown) ----

  /** The open graph phase, gated by the per-phase config flags. */
  private _graphPhaseFor(s: SaunaState): "heatup" | "cooldown" | null {
    const phase = graphPhase(
      s.status,
      s.currentTemp,
      s.targetTemp,
      this._cooldownAnchor,
    );
    if (phase === "heatup" && this._config.show_heatup_graph === false) {
      return null;
    }
    if (phase === "cooldown" && this._config.show_cooldown_graph === false) {
      return null;
    }
    return phase;
  }

  /**
   * A hand-rolled SVG sparkline of the temperature over the open window — rising
   * toward the target (heatup) or falling toward the baseline (cooldown). Returns
   * `nothing` when no window is open or there aren't yet enough samples, so the
   * caller falls back to the normal temperature display (region-swap, no graph
   * = no change). Colours come entirely from theme variables.
   */
  private _tempGraph(s: SaunaState): TemplateResult | typeof nothing {
    const phase = this._graphPhaseFor(s);
    if (!phase) return nothing;
    const samples =
      phase === "heatup" ? this._heatupSamples : this._cooldownSamples;
    if (samples.length < 2) return nothing;
    const ref =
      phase === "heatup" ? s.targetTemp : this._cooldownAnchor?.baselineTemp;
    if (ref === undefined) return nothing;

    const W = 300;
    const H = 80;
    const PAD = { t: 10, r: 10, b: 8, l: 10 };
    const iW = W - PAD.l - PAD.r;
    const iH = H - PAD.t - PAD.b;

    const temps = samples.map((p) => p.temp);
    const lo = Math.min(ref, ...temps);
    const hi = Math.max(ref, ...temps);
    const padY = Math.max(2, (hi - lo) * 0.12);
    const yMin = lo - padY;
    const yMax = hi + padY;

    const tMin = samples[0].t;
    const tMax = samples[samples.length - 1].t;
    const dt = tMax - tMin || 1;
    const dy = yMax - yMin || 1;
    const x = (t: number): number => PAD.l + ((t - tMin) / dt) * iW;
    const y = (temp: number): number => PAD.t + (1 - (temp - yMin) / dy) * iH;

    const pts = samples
      .map((p) => `${x(p.t).toFixed(1)},${y(p.temp).toFixed(1)}`)
      .join(" ");
    const baseY = (H - PAD.b).toFixed(1);
    const area = `${PAD.l},${baseY} ${pts} ${PAD.l + iW},${baseY}`;
    const refY = y(ref).toFixed(1);
    const last = samples[samples.length - 1];
    const cur = s.currentTemp ?? last.temp;
    const cd = phase === "cooldown" ? "cooldown" : "";

    const aria =
      phase === "heatup"
        ? this._t("graph.aria_heatup", {
            cur: Math.round(cur),
            tgt: Math.round(ref),
          })
        : this._t("graph.aria_cooldown", {
            cur: Math.round(cur),
            base: Math.round(ref),
          });

    return html`<figure class="graph ${cd}" role="img" aria-label=${aria}>
      <figcaption>
        ${this._t(phase === "heatup" ? "graph.heatup" : "graph.cooldown")} ·
        ${this._temp(cur)} → ${this._temp(ref)}
      </figcaption>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <polygon class="graph-area ${cd}" points=${area}></polygon>
        <line
          class="graph-ref ${cd}"
          x1=${PAD.l}
          y1=${refY}
          x2=${PAD.l + iW}
          y2=${refY}
          vector-effect="non-scaling-stroke"
        ></line>
        <polyline
          class="graph-line ${cd}"
          points=${pts}
          vector-effect="non-scaling-stroke"
        ></polyline>
        <circle
          class="graph-dot ${cd}"
          cx=${x(last.t).toFixed(1)}
          cy=${y(last.temp).toFixed(1)}
          r="2.5"
          vector-effect="non-scaling-stroke"
        ></circle>
      </svg>
    </figure>`;
  }

  /** The graph when a window is open, else the layout's normal temp display. */
  private _heroOrGraph(
    s: SaunaState,
    fallback: TemplateResult,
  ): TemplateResult {
    const g = this._tempGraph(s);
    return g === nothing ? fallback : (g as TemplateResult);
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
        ${this._heroOrGraph(
          s,
          html`<div class="hero">
            <div class="cur">${this._heroTemp(s.currentTemp)}</div>
            <div class="tgt">
              <span>${this._t("label.target_temperature")}</span>
              ${this._targetControl(s)}
            </div>
          </div>`,
        )}
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
      ${this._heroOrGraph(
        s,
        html`<div class="dial">
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
              stroke-dasharray="${(ARC * progress).toFixed(1)} ${CIRC.toFixed(
                1,
              )}"
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
        </div>`,
      )}
      ${this._doorWarning(s)} ${this._notices()}
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
      ${this._doorWarning(s)} ${this._notices()}
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
    /* Heatup / cooldown temperature sparkline. Colours are theme variables only;
       a min-height keeps the region-swap from jumping when the graph appears. */
    .graph {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100px;
    }
    .graph figcaption {
      font-size: 0.8rem;
      color: var(--secondary-text-color);
      margin-bottom: 2px;
    }
    .graph svg {
      display: block;
      width: 100%;
      height: 80px;
      overflow: visible;
    }
    .graph-area {
      fill: var(--sauna-heat-color);
      opacity: 0.12;
      stroke: none;
    }
    .graph-area.cooldown {
      fill: var(--info-color, #039be5);
    }
    .graph-line {
      fill: none;
      stroke: var(--sauna-heat-color);
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .graph-line.cooldown {
      stroke: var(--info-color, #039be5);
    }
    .graph-ref {
      stroke: var(--sauna-heat-color);
      stroke-width: 1;
      stroke-dasharray: 4 3;
      opacity: 0.45;
    }
    .graph-ref.cooldown {
      stroke: var(--secondary-text-color);
    }
    .graph-dot {
      fill: var(--sauna-heat-color);
      stroke: var(--card-background-color, #fff);
      stroke-width: 1;
    }
    .graph-dot.cooldown {
      fill: var(--info-color, #039be5);
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
