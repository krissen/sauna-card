import {
  LitElement,
  html,
  svg,
  css,
  nothing,
  type TemplateResult,
  type SVGTemplateResult,
  type PropertyValues,
} from "lit";
import { property, state } from "lit/decorators.js";
import { html as staticHtml, literal } from "lit/static-html.js";
import type {
  Hass,
  SaunaCardConfig,
  SaunaState,
  SaunaStatus,
  SaunaLayout,
  ControlsMode,
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
import { fetchHistory, fetchLastSession } from "./utils/history";
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
import { fireMoreInfo } from "./utils/more-info";
import { logVersionBanner, dlog } from "./log";

const TEMP_STEP = 5;

// Tag literals for the more-info readout wrapper (static-html needs a `literal`
// to vary the element; div for block readouts, span/b for inline ones).
const MI_TAG = {
  div: literal`div`,
  span: literal`span`,
  b: literal`b`,
} as const;

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
  // Last graph phase, so debug logging fires only on a phase change (not every update).
  private _prevGraphPhase?: "heatup" | "cooldown" | null;
  // Open cooldown window, if any (set on shutdown after a session).
  private _cooldownAnchor?: CooldownAnchor;
  // Temperature the current/last session started from (≈ room temp), captured at
  // the off/idle → heating transition and reused as the cooldown baseline.
  private _sessionStartTemp?: number;
  // When the current session powered on (epoch ms) — the start of the recorder
  // window used to backfill the heatup curve (Stage B).
  private _sessionStartAt?: number;
  // Phase keys whose history has already been fetched, so Stage B runs once per
  // window instead of on every update.
  private _historyFetched = new Set<string>();
  // Previous status, for edge detection in _trackGraph.
  private _prevStatus?: SaunaStatus;
  // Whether we've already tried to reconstruct a cooldown for the current
  // off-episode from the recorder (so we attempt it once, not every update).
  // Reset when the sauna is powered on again.
  private _cooldownReconstructAttempted = false;

  // Set once the version banner has been printed, so re-renders don't spam it.
  private _versionLogged = false;

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
    if (config.entity_map !== undefined && !isPlainObject(config.entity_map)) {
      throw new Error(`sauna-card: "entity_map" must be an object`);
    }
    if (
      config.controls !== undefined &&
      !CONTROLS_MODES.includes(config.controls as ControlsMode)
    ) {
      throw new Error(
        `sauna-card: invalid controls "${String(config.controls)}"`,
      );
    }
    for (const key of [
      "show_heatup_graph",
      "show_cooldown_graph",
      "cooldown_include_heatup",
      "tap_more_info",
      "show_version",
      "debug",
    ]) {
      if (config[key] !== undefined && typeof config[key] !== "boolean") {
        throw new Error(`sauna-card: "${key}" must be a boolean`);
      }
    }
    if (
      config.cooldown_target_temp !== undefined &&
      (typeof config.cooldown_target_temp !== "number" ||
        !Number.isFinite(config.cooldown_target_temp))
    ) {
      throw new Error('sauna-card: "cooldown_target_temp" must be a number');
    }
    this._config = config as unknown as SaunaCardConfig;
    // Log the version banner once per instance, unless explicitly opted out.
    // Absent flag ⇒ on, so existing configs keep logging.
    if (!this._versionLogged && this._config.show_version !== false) {
      logVersionBanner("Sauna Card");
      this._versionLogged = true;
    }
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

  private get _debug(): boolean {
    return this._config.debug === true;
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
      : this._staticTarget(s, "tval");
  }

  /** A read-only target-temperature value that opens the thermostat more-info. */
  private _staticTarget(s: SaunaState, className: string): TemplateResult {
    return this._readout(
      MI_TAG.b,
      className,
      this._miId(s, "thermostat"),
      "label.target_temperature",
      html`${this._temp(this._effectiveTarget(s))}`,
    );
  }

  private get _lang(): string {
    return detectLang(this.hass, this._config.language);
  }

  private _state(): SaunaState | null {
    if (!this.hass) return null;
    const adapter = pickIntegration(this.hass, this._config.integration);
    if (!adapter) {
      dlog(this._debug, "no adapter for integration", this._config.integration);
      return null;
    }
    const state = adapter.readState(this.hass, this._config);
    dlog(this._debug, `state via ${adapter.id}`, state);
    return state;
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

  /** The big current-temperature readout, opening the temperature sensor. */
  private _curBlock(s: SaunaState): TemplateResult {
    return this._readout(
      MI_TAG.div,
      "cur",
      this._miId(s, "currentTemperature"),
      "label.temperature",
      this._heroTemp(s.currentTemp),
    );
  }

  // ---- more-info readouts ----

  /** Whether read-only displays open HA's more-info dialog (default on). */
  private get _moreInfo(): boolean {
    return this._config.tap_more_info !== false;
  }

  /**
   * The entity id a readout should open, or undefined when more-info is off or
   * the entity is absent — in which case the readout stays non-interactive.
   */
  private _miId(s: SaunaState, entityKey?: string): string | undefined {
    if (!this._moreInfo || !entityKey) return undefined;
    return s.entities[entityKey];
  }

  // Keyboard activation for a readout: Enter/Space mirror a click (which fires
  // more-info). Shared so the open logic lives only on @click.
  private _miKeydown = (ev: KeyboardEvent): void => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).click();
  };

  /**
   * Wrap a readout so it opens more-info when an entity resolves; otherwise the
   * plain element. `tag` varies the wrapper (block vs inline) without breaking
   * layout, so existing CSS (grid tiles, inline slots) is preserved.
   */
  private _readout(
    tag: (typeof MI_TAG)[keyof typeof MI_TAG],
    className: string,
    entityId: string | undefined,
    labelKey: string,
    inner: TemplateResult,
  ): TemplateResult {
    if (!entityId) {
      return staticHtml`<${tag} class=${className}>${inner}</${tag}>`;
    }
    const name = this._t("a11y.more_info", { name: this._t(labelKey) });
    return staticHtml`<${tag}
      class="${className} mi"
      role="button"
      tabindex="0"
      aria-haspopup="dialog"
      aria-label=${name}
      title=${name}
      @click=${() => fireMoreInfo(this, entityId)}
      @keydown=${this._miKeydown}
    >${inner}</${tag}>`;
  }

  // ---- control handlers (I6) ----

  private _toggle(s: SaunaState, key: string): void {
    const id = s.entities[key];
    if (id && this.hass) toggleSwitch(this.hass, id, this._debug);
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
    setTargetTemperature(this.hass, s, next, this._debug);
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
    if (
      this._startFailed &&
      s &&
      (this._powerOn(s) || s.status === "heating")
    ) {
      this._startFailed = undefined;
    }
    this._trackTemp(s);
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

    // Capture the pre-heat (≈ room) temperature once, at the true session start —
    // the off → powered transition. Keying on `prev === "off"` means mid-session
    // thermostat cycling (ready → idle → heating, as the relay clicks back on)
    // never overwrites the baseline with a hot value, and a fresh mount
    // mid-session (`prev === undefined`) doesn't seed a wrong (hot) baseline.
    // Each new session re-seeds at its own power-on.
    if (
      prev === "off" &&
      (status === "heating" || status === "ready" || status === "idle") &&
      s?.currentTemp !== undefined
    ) {
      this._sessionStartTemp = s.currentTemp;
      this._sessionStartAt = now;
    }

    // Open a cooldown window when a running sauna is switched off. The previous
    // state can be any powered one — heating, ready, or idle (a thermostat
    // off-cycle between heats is still a running session) — transitioning to
    // "off" (power off). We require a captured _sessionStartTemp, so this only
    // fires after a real heating session (the true pre-heat baseline) and never
    // on a mid-session mount, where we can't know how far the sauna has to cool.
    if (
      (prev === "heating" || prev === "ready" || prev === "idle") &&
      status === "off" &&
      this._sessionStartTemp !== undefined
    ) {
      // A configured cooldown target is the baseline when present (it's the
      // temperature the room settles at); otherwise the captured session start.
      this._cooldownAnchor = {
        startedAt: now,
        baselineTemp:
          this._config.cooldown_target_temp ?? this._sessionStartTemp,
      };
      this._cooldownSamples = [];
    }

    // Close the cooldown window once the sauna is powered back on (an active
    // session owns the view again) or it has run its course (back to baseline /
    // 24h cap). A momentary unavailability (!s) only skips sampling — it must
    // not discard an in-progress cooldown.
    if (this._cooldownAnchor && s) {
      const poweredOn =
        s.status === "heating" || s.status === "ready" || s.status === "idle";
      if (
        poweredOn ||
        isCooldownExpired(this._cooldownAnchor, s.currentTemp, now)
      ) {
        this._cooldownAnchor = undefined;
        this._cooldownSamples = [];
      }
    }

    // A new session (powered on) lets the next off-episode reconstruct afresh.
    if (status === "heating" || status === "ready" || status === "idle") {
      this._cooldownReconstructAttempted = false;
    }
    // No live anchor but possibly still cooling after a reload — rebuild it from
    // the recorder (the in-memory anchor doesn't survive a reload).
    if (s && !this._cooldownAnchor) this._maybeReconstructCooldown(s, now);

    const phase = s
      ? graphPhase(s.status, s.currentTemp, s.targetTemp, this._cooldownAnchor)
      : null;
    if (phase !== this._prevGraphPhase) {
      dlog(
        this._debug,
        `graph phase ${this._prevGraphPhase ?? "none"} → ${phase ?? "none"}`,
        {
          status,
          currentTemp: s?.currentTemp,
          targetTemp: s?.targetTemp,
          cooldownAnchor: this._cooldownAnchor,
        },
      );
      this._prevGraphPhase = phase;
    }

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

    // Only backfill from the recorder for a graph that will actually be shown —
    // a disabled curve (show_*_graph: false) must not trigger history fetches.
    const shownPhase = s ? this._graphPhaseFor(s) : null;
    if (s && shownPhase) this._maybeFetchHistory(s, shownPhase, now);

    this._prevStatus = status;
  }

  /**
   * Reconstruct a cooldown window after a page reload: when the sauna is off but
   * still above the configured target, ask the recorder for the switch's last
   * on→off time within 24h. If found, open an anchor at that time (baseline = the
   * configured target) and backfill the falling curve. Runs at most once per
   * off-episode. Requires cooldown_target_temp — without it we can't know the
   * baseline, so reload reconstruction is opt-in via that config.
   */
  private _maybeReconstructCooldown(s: SaunaState, now: number): void {
    if (this._cooldownAnchor || this._cooldownReconstructAttempted) return;
    if (this._config.show_cooldown_graph === false) return;
    const target = this._config.cooldown_target_temp;
    if (target === undefined) return;
    if (s.status !== "off") return;
    if (s.currentTemp === undefined || s.currentTemp <= target) return;
    if (!this.hass?.callWS) return;
    const switchId = s.entities.power;
    const tempId = s.entities.currentTemperature;
    if (!switchId) return;
    this._cooldownReconstructAttempted = true;

    const since = new Date(now - COOLDOWN_MAX_MS);
    fetchLastSession(this.hass, switchId, since, new Date(now))
      .then((session) => {
        if (session === null) return;
        // Re-validate against the latest state — nothing flipped under us.
        const cur = this._state();
        if (
          !cur ||
          this._cooldownAnchor ||
          cur.status !== "off" ||
          cur.currentTemp === undefined ||
          cur.currentTemp <= target
        ) {
          return;
        }
        // Anchor at the shutoff (24h cap counts from there); with include-heatup
        // the curve extends back to the session's power-on.
        this._cooldownAnchor = {
          startedAt: session.offTime,
          baselineTemp: target,
        };
        this._cooldownSamples = [];
        dlog(this._debug, "reconstructed cooldown from recorder", {
          offTime: session.offTime,
          onTime: session.onTime,
          baselineTemp: target,
        });
        // Mark this window fetched so _maybeFetchHistory won't fetch it again.
        const key = this._phaseKey(cur, "cooldown");
        if (key) this._historyFetched.add(key);
        // Backfill the curve from the recorder, then render.
        const fetchFrom =
          this._config.cooldown_include_heatup === true
            ? session.onTime
            : session.offTime;
        if (tempId && this.hass?.callWS) {
          fetchHistory(this.hass, tempId, new Date(fetchFrom), new Date(now))
            .then((remote) => {
              if (remote.length) {
                this._cooldownSamples = mergeHistory(
                  this._cooldownSamples,
                  remote,
                );
              }
              this.requestUpdate();
            })
            .catch(() => undefined);
        } else {
          this.requestUpdate();
        }
      })
      .catch(() => undefined);
  }

  /** A stable id for the open window, so history is fetched once per window. */
  private _phaseKey(
    s: SaunaState,
    phase: "heatup" | "cooldown",
  ): string | null {
    if (phase === "heatup") {
      // Include the session start so a later same-target session is a distinct
      // window and gets its own recorder backfill (the cache never shrinks).
      return `heatup|${s.deviceId}|${s.targetTemp ?? ""}|${this._sessionStartAt ?? ""}`;
    }
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

    // Cooldown normally backfills from the shutoff; with include-heatup it
    // extends back to the session's power-on so the curve shows the full arc.
    const cooldownStart =
      this._config.cooldown_include_heatup === true
        ? (this._sessionStartAt ?? this._cooldownAnchor?.startedAt ?? now)
        : (this._cooldownAnchor?.startedAt ?? now);
    const startMs =
      phase === "heatup"
        ? (this._sessionStartAt ?? now - HEATUP_WINDOW_MS)
        : cooldownStart;

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
      this._debug,
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
    if (id) return this.hass?.states[id]?.state === "on";
    // Manual climate-only sauna: the thermostat's own mode stands in for a power
    // switch — it reads "off" when the heater is off, any other mode is "on".
    const thermo = s.entities.thermostat;
    if (!thermo) return false;
    const st = this.hass?.states[thermo]?.state;
    return st !== undefined && !entityUnavailable(st) && st !== "off";
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
    // On/off target: a mapped power switch, else the thermostat — a manual
    // climate-only sauna switches the climate entity itself.
    const ctlId = s.entities.power ?? s.entities.thermostat;
    const ctlState = ctlId ? this.hass?.states[ctlId]?.state : undefined;
    const unavailable = !ctlId || entityUnavailable(ctlState);
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
    const inner = html`<ha-icon icon=${STATUS_ICON[s.status]}></ha-icon>
      ${this._t(STATUS_KEY[s.status])}${eta}`;
    return this._readout(
      MI_TAG.span,
      `badge status-${s.status}`,
      this._miId(s, "thermostat"),
      "label.status",
      inner,
    );
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
        // Interactive toggle (homeassistant.toggle); keyboard-operable.
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
    entityId?: string,
  ): TemplateResult | typeof nothing {
    if (value === nothing) return nothing;
    const inner = html`<div class="k">${this._t(labelKey)}</div>
      <div class="v">${value}</div>`;
    return this._readout(MI_TAG.div, "tile", entityId, labelKey, inner);
  }

  /** Render one catalog item as a tile; hides when its datum is absent. */
  private _itemTile(
    s: SaunaState,
    key: BadgeItemKey,
  ): TemplateResult | typeof nothing {
    const def = BADGE_ITEMS[key];
    const v = def.value(s, this._t);
    if (!v) return nothing;
    return this._tile(
      def.labelKey,
      `${v.text}${v.unit ? ` ${v.unit}` : ""}`,
      this._miId(s, def.entityKey),
    );
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

    const baseY = (H - PAD.b).toFixed(1);
    const ptsOf = (arr: TempSample[]): string =>
      arr.map((p) => `${x(p.t).toFixed(1)},${y(p.temp).toFixed(1)}`).join(" ");
    const areaOf = (arr: TempSample[]): string =>
      `${x(arr[0].t).toFixed(1)},${baseY} ${ptsOf(arr)} ` +
      `${x(arr[arr.length - 1].t).toFixed(1)},${baseY}`;
    const refY = y(ref).toFixed(1);
    const last = samples[samples.length - 1];
    const cur = s.currentTemp ?? last.temp;
    const cd = phase === "cooldown" ? "cooldown" : "";

    // Two-tone "session" arc: when the cooldown includes the heatup, split the
    // curve at its peak — the rising part in the heat colour, the falling part in
    // the cooldown colour.
    let peakIdx = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].temp > samples[peakIdx].temp) peakIdx = i;
    }
    const twoTone =
      phase === "cooldown" &&
      this._config.cooldown_include_heatup === true &&
      peakIdx > 0 &&
      peakIdx < samples.length - 1;

    const dot = svg`<circle
      class="graph-dot ${cd}"
      cx=${x(last.t).toFixed(1)}
      cy=${y(last.temp).toFixed(1)}
      r="2.5"
      vector-effect="non-scaling-stroke"
    ></circle>`;
    const refLine = svg`<line
      class="graph-ref ${cd}"
      x1=${PAD.l}
      y1=${refY}
      x2=${PAD.l + iW}
      y2=${refY}
      vector-effect="non-scaling-stroke"
    ></line>`;

    let body: SVGTemplateResult;
    if (twoTone) {
      const rising = samples.slice(0, peakIdx + 1);
      const falling = samples.slice(peakIdx);
      body = svg`
        <polygon class="graph-area" points=${areaOf(rising)}></polygon>
        <polygon class="graph-area cooldown" points=${areaOf(falling)}></polygon>
        ${refLine}
        <polyline class="graph-line" points=${ptsOf(rising)} vector-effect="non-scaling-stroke"></polyline>
        <polyline class="graph-line cooldown" points=${ptsOf(falling)} vector-effect="non-scaling-stroke"></polyline>
        ${dot}`;
    } else {
      body = svg`
        <polygon class="graph-area ${cd}" points=${areaOf(samples)}></polygon>
        ${refLine}
        <polyline class="graph-line ${cd}" points=${ptsOf(samples)} vector-effect="non-scaling-stroke"></polyline>
        ${dot}`;
    }

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
    const captionKey = twoTone
      ? "graph.session"
      : phase === "heatup"
        ? "graph.heatup"
        : "graph.cooldown";

    // A clock-time axis under the curve: start, middle and end, so the span is
    // readable (especially a multi-hour cooldown). Wall-clock in the card locale.
    const fmtTime = (t: number): string =>
      new Date(t).toLocaleTimeString(this._lang, {
        hour: "2-digit",
        minute: "2-digit",
      });
    const axis =
      tMax > tMin
        ? html`<div class="graph-axis" aria-hidden="true">
            <span>${fmtTime(tMin)}</span>
            <span>${fmtTime((tMin + tMax) / 2)}</span>
            <span>${fmtTime(tMax)}</span>
          </div>`
        : nothing;

    return html`<figure class="graph ${cd}" role="img" aria-label=${aria}>
      <figcaption>
        ${this._t(captionKey)} · ${this._temp(cur)} → ${this._temp(ref)}
      </figcaption>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${body}</svg>
      ${axis}
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
            ${this._curBlock(s)}
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
      <div class="body">
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
              ${this._curBlock(s)}
              <div class="tgt">
                ${this._t("label.target_temperature")}
                ${this._staticTarget(s, "")}
              </div>
            </div>
          </div>`,
        )}
        ${this._doorWarning(s)} ${this._notices()}
        ${this._controls === "power+temp" ? this._tempStepper(s) : nothing}
        ${this._tilesRow(s, this._config.hero_items ?? [])} ${this._chips(s)}
        ${this._ctaIf(s)}
      </div>
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
    const inner = html`<ha-icon icon=${def.icon(s)}></ha-icon>
      <span class="cval"
        >${v.text}${v.unit
          ? html`<span class="cunit">${v.unit}</span>`
          : nothing}</span
      >`;
    return this._readout(
      MI_TAG.span,
      `citem ${cls}`,
      this._miId(s, def.entityKey),
      def.labelKey,
      inner,
    );
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
      min-height: 116px;
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
    .graph-axis {
      display: flex;
      justify-content: space-between;
      margin-top: 3px;
      font-size: 0.68rem;
      color: var(--secondary-text-color);
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
    /* Read-only displays that open HA's more-info dialog on tap/Enter. State is
       carried in aria-label/title, never colour alone (a11y); the affordance is
       a subtle hover plus a keyboard focus ring. */
    .mi {
      cursor: pointer;
    }
    .mi:hover {
      opacity: 0.85;
    }
    .mi:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
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
      /* Centred horizontally; vertical rhythm comes from the .body flex gap. */
      margin: 0 auto;
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
    /* Breathing room between the stepper/CTA row and the control chips below. */
    .ccontrols + .chips {
      margin-top: 8px;
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
