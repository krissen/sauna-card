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
}

/** Logical, model-agnostic sauna status. */
export type SaunaStatus = "off" | "heating" | "ready" | "idle" | "unknown";

/** Card layout, per ADR design directions (status-dashboard is the default). */
export type SaunaLayout = "status-dashboard" | "thermostat-hero" | "compact";

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
  /** On/off state of each auxiliary switch, by logical key (light, fan, …). */
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
  /** Devices this integration exposes in `hass` (empty if not installed). */
  detect(hass: Hass): DetectedDevice[];
  /** Map config → resolved entity ids (logical key → entity_id). */
  resolveEntityIds(hass: Hass, config: SaunaCardConfig): Record<string, string>;
  /** Read normalized state, or null when no device can be resolved. */
  readState(hass: Hass, config: SaunaCardConfig): SaunaState | null;
}
