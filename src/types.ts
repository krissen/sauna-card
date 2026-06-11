// Minimal Home Assistant frontend types — only the parts sauna-card reads.

export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

/** An entry from the frontend entity registry (`hass.entities`). */
export interface HassRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
  translation_key?: string;
}

export interface HassDevice {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  model?: string | null;
  manufacturer?: string | null;
}

/** A websocket command message; `type` plus arbitrary command-specific fields. */
export interface HassWsMessage {
  type: string;
  [key: string]: unknown;
}

export interface Hass {
  states: Record<string, HassEntityState>;
  entities?: Record<string, HassRegistryEntry>;
  devices?: Record<string, HassDevice>;
  locale?: { language?: string };
  language?: string;
  callService?: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ) => Promise<unknown>;
  /** One-shot websocket command (e.g. recorder history). Present on real hass. */
  callWS?: <T>(msg: HassWsMessage) => Promise<T>;
}

/** Logical, model-agnostic sauna status. */
export type SaunaStatus = "off" | "heating" | "ready" | "idle" | "unknown";

/** Card layout, per ADR design directions (status-dashboard is the default). */
export type SaunaLayout = "status-dashboard" | "thermostat-hero" | "compact";

/** Which interactive controls a layout shows. */
export type ControlsMode = "none" | "power" | "power+temp";

/**
 * What the card does when the mapped "remote control allowed" entity is off and
 * the sauna is off (so a start is what's blocked). The status pill shows a lock
 * in every case; the difference is how the controls react.
 */
export type RemoteOffAction =
  | "none" // ignore (default)
  | "disable_start" // disable only the start button
  | "lock" // disable all controls (stepper + chips + start)
  | "hide_controls" // display-only (remove the controls)
  | "compact" // switch to the compact layout, start disabled
  | "compact_locked"; // switch to compact, all controls disabled

export interface SaunaCardConfig {
  type: string;
  /** Card title; defaults to the device name. */
  name?: string;
  /** Integration id; auto-detected when omitted. */
  integration?: string;
  /** Device id within the integration; auto-selected when omitted. */
  device_id?: string;
  layout?: SaunaLayout;
  /** Locale override; falls back to the Home Assistant locale. */
  language?: string;
  /** Ordered item keys shown as tiles in the status-dashboard layout. */
  dashboard_tiles?: string[];
  /** Ordered item keys shown as tiles in the thermostat-hero layout. */
  hero_items?: string[];
  /** Compact layout's three slots; each value is an item key, "name" (the
   * device name), or "none"/empty (nothing). Missing slots fall back to the
   * defaults. */
  compact_slots?: { left?: string; mid?: string; right?: string };
  /** Interactive controls shown across layouts (default "power+temp"). */
  controls?: ControlsMode;
  /** What to do when the mapped "remote control allowed" entity is off (and the
   * sauna is off, so a start is what's blocked). The status pill shows a lock in
   * every non-"none" case. Default "none". */
  remote_off_action?: RemoteOffAction;
  /** Show the rising temperature curve while heating (default on). */
  show_heatup_graph?: boolean;
  /** Show the falling temperature curve while cooling down (default on). */
  show_cooldown_graph?: boolean;
  /** Temperature (°C) the cooldown tracks toward — roughly room temperature. When
   * set it is the cooldown baseline (more reliable than the captured session
   * start) and enables showing a cooldown after a page reload. */
  cooldown_target_temp?: number;
  /** Extend the cooldown curve back over the heatup so it shows the whole session
   * arc — a two-tone curve (orange rising, blue falling). Default off. */
  cooldown_include_heatup?: boolean;
  /** Make read-only value displays tap-to-open HA's more-info dialog for the
   * underlying entity. Default on. */
  tap_more_info?: boolean;
  /** Manual entity mapping for the "manual" adapter: logical key → entity_id.
   * Only the keys the user maps are present; the card hides everything else. */
  entity_map?: Record<string, string>;
  /** Log a version banner to the console once on load. Absent ⇒ on, so existing
   * configs keep logging; set false to silence. */
  show_version?: boolean;
  /** Emit verbose console.debug logging across detection, controls and graphs.
   * Default off. */
  debug?: boolean;
}

/** Badge content selection: the headline, one chosen value, or several. */
export type BadgeContent = "primary" | "single" | "row";

/** Badge appearance for each rendered value. */
export type BadgeVisual =
  | "chip"
  | "icon"
  | "value"
  | "ring_value"
  | "ring_icon"
  | "ring";

/** Where an optional item label sits relative to its value. */
export type BadgeLabelPosition = "right" | "below";

export interface SaunaBadgeConfig {
  type: string;
  /** Override label/aria text; defaults to the device name. */
  name?: string;
  /** Integration id; auto-detected when omitted. */
  integration?: string;
  /** Device id within the integration; auto-selected when omitted. */
  device_id?: string;
  /** Locale override; falls back to the Home Assistant locale. */
  language?: string;
  /** What the badge shows (default "primary": status + current temperature). */
  content?: BadgeContent;
  /** How each value is drawn (default "chip": icon + value). */
  visual?: BadgeVisual;
  /** The value shown when content = "single". */
  single_item?: string;
  /** The values shown when content = "row". */
  items?: string[];
  /** Show each value's text label. */
  show_label?: boolean;
  /** Label placement when show_label is set. */
  label_position?: BadgeLabelPosition;
  /** Overall size multiplier of the badge pill (default 1). */
  scale?: number;
  /** Manual entity mapping for the "manual" adapter: logical key → entity_id. */
  entity_map?: Record<string, string>;
  /** Log a version banner to the console once on load. Absent ⇒ on, so existing
   * configs keep logging; set false to silence. */
  show_version?: boolean;
  /** Emit verbose console.debug logging. Default off. */
  debug?: boolean;
}

/**
 * Normalized state the card renders, independent of which integration/model
 * produced it. Adapters map their entities into this shape.
 */
export interface SaunaState {
  integration: string;
  deviceId: string;
  /** e.g. "xenio" | "fenix" — when the adapter can tell. */
  model?: string;
  available: boolean;
  status: SaunaStatus;
  currentTemp?: number;
  targetTemp?: number;
  humidity?: number;
  remainingMinutes?: number;
  /** Estimated minutes until ready, derived from the temperature trend. */
  readyEtaMinutes?: number;
  power?: number;
  energy?: number;
  sessionsToday?: number;
  tempTrend?: number;
  wifiRssi?: number;
  doorOpen?: boolean;
  heatingActive?: boolean;
  steamActive?: boolean;
  /** Target humidity setpoint (%). */
  targetHumidity?: number;
  /** Aroma intensity setpoint. */
  aromaLevel?: number;
  /** Configured session length (minutes). */
  sessionLength?: number;
  /** Previous session's duration (minutes). */
  lastSessionDuration?: number;
  /** Previous session's peak temperature (°C). */
  lastSessionMaxTemp?: number;
  /** Actual heater output (W). */
  heaterPowerActual?: number;
  /** Main / external / panel temperature probes (°C). */
  mainSensorTemp?: number;
  extSensorTemp?: number;
  panelTemp?: number;
  /** Raw status code(s) and active profile, as the integration reports them. */
  statusCodes?: string;
  activeProfile?: string;
  /** Lifetime relay/cycle counters. */
  heatOnCounter?: number;
  steamOnCounter?: number;
  ph1RelayCounter?: number;
  ph2RelayCounter?: number;
  ph3RelayCounter?: number;
  /** Lifetime totals (hours / sessions). */
  totalHours?: number;
  totalBathingHours?: number;
  totalSessions?: number;
  /** Diagnostic binary states. */
  remoteAllowed?: boolean;
  safetyRelay?: boolean;
  screenLock?: boolean;
  /** On/off state of each switch, by logical key — the main `power` switch plus
   * the auxiliaries (light, fan, steamer, aroma, dehumidifier, auto_light, …). */
  switches?: Record<string, boolean>;
  /** Logical key → entity_id, for more-info, controls and rendering. */
  entities: Record<string, string>;
}

/** A detected device that an adapter can drive. */
export interface DetectedDevice {
  integration: string;
  deviceId: string;
  name: string;
}

/**
 * Contract every integration adapter implements. The registry is keyed by
 * integration (e.g. "harvia_sauna"); device models (Xenio/Fenix) are handled
 * inside the adapter, not as separate adapters.
 */
export interface SaunaAdapter {
  readonly id: string;
  readonly stubConfig: Partial<SaunaCardConfig>;
  /** Manual adapters are selected explicitly (config.integration), never
   * auto-detected — they map user-supplied entities, so detection can't find
   * them via a platform. The registry picks them past the detect gate. */
  readonly manual?: boolean;
  /** Devices this integration exposes in `hass` (empty if not installed). */
  detect(hass: Hass): DetectedDevice[];
  /** Map config → resolved entity ids (logical key → entity_id). */
  resolveEntityIds(hass: Hass, config: SaunaCardConfig): Record<string, string>;
  /** Read normalized state, or null when no device can be resolved. */
  readState(hass: Hass, config: SaunaCardConfig): SaunaState | null;
}
