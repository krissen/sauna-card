// Status + item metadata shared by the card and the badge. Keeping the icon and
// label maps here (rather than inline in the card) lets the badge render the
// same status vocabulary without duplicating it.
import type { SaunaState, SaunaStatus } from "./types";

export const STATUS_ICON: Record<SaunaStatus, string> = {
  off: "mdi:power",
  heating: "mdi:fire",
  ready: "mdi:check-circle",
  idle: "mdi:timer-sand-empty",
  unknown: "mdi:help-circle",
};

export const STATUS_KEY: Record<SaunaStatus, string> = {
  off: "state.off",
  heating: "state.heating",
  ready: "state.ready",
  idle: "state.idle",
  unknown: "common.unknown",
};

/** Translate function shape (a bound `t` with the locale already applied). */
export type TFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/** A value the badge can show, split so the unit can be styled separately. */
export interface ItemValue {
  text: string;
  unit?: string;
}

/**
 * Every value the card/badge can surface, covering all data the harvia_sauna
 * integration normalizes into SaunaState. Selectable in any layout's slots.
 */
export type BadgeItemKey =
  | "status"
  | "current_temp"
  | "target_temp"
  | "eta"
  | "humidity"
  | "target_humidity"
  | "temp_trend"
  | "remaining"
  | "session_length"
  | "power"
  | "energy"
  | "sessions"
  | "last_session_duration"
  | "last_session_max_temp"
  | "aroma_level"
  | "wifi"
  | "door"
  | "heating"
  | "steam"
  | "power_switch"
  | "light"
  | "fan"
  | "steamer"
  | "aroma"
  | "dehumidifier"
  | "auto_light"
  | "auto_fan"
  | "heater_power_actual"
  | "main_sensor_temp"
  | "ext_sensor_temp"
  | "panel_temp"
  | "status_codes"
  | "active_profile"
  | "heat_on_counter"
  | "steam_on_counter"
  | "ph1_relay_counter"
  | "ph2_relay_counter"
  | "ph3_relay_counter"
  | "total_hours"
  | "total_bathing_hours"
  | "total_sessions"
  | "remote_allowed"
  | "safety_relay"
  | "screen_lock";

/** Order used wherever the full item set is offered (editor, defaults). */
export const BADGE_ITEM_KEYS: BadgeItemKey[] = [
  "status",
  "current_temp",
  "target_temp",
  "eta",
  "humidity",
  "target_humidity",
  "temp_trend",
  "remaining",
  "session_length",
  "power",
  "energy",
  "sessions",
  "last_session_duration",
  "last_session_max_temp",
  "aroma_level",
  "wifi",
  "door",
  "heating",
  "steam",
  "power_switch",
  "light",
  "fan",
  "steamer",
  "aroma",
  "dehumidifier",
  "auto_light",
  "auto_fan",
  "heater_power_actual",
  "main_sensor_temp",
  "ext_sensor_temp",
  "panel_temp",
  "status_codes",
  "active_profile",
  "heat_on_counter",
  "steam_on_counter",
  "ph1_relay_counter",
  "ph2_relay_counter",
  "ph3_relay_counter",
  "total_hours",
  "total_bathing_hours",
  "total_sessions",
  "remote_allowed",
  "safety_relay",
  "screen_lock",
];

export interface BadgeItemDef {
  /** mdi icon (may depend on state, e.g. status or door). */
  icon: (s: SaunaState) => string;
  /** i18n key for the item's human label (editor + optional badge label). */
  labelKey: string;
  /** Display value, or null when the underlying datum is absent (item hidden). */
  value: (s: SaunaState, tr: TFn) => ItemValue | null;
  /** Ring progress 0..1 for gauge visuals, or undefined when not gaugeable. */
  progress?: (s: SaunaState) => number | undefined;
  /** Whether the icon and value should be tinted by the sauna status colour.
   * (The ring gauge always derives its colour from the status, independently.) */
  statusTinted?: boolean;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** currentTemp / targetTemp as a 0..1 ratio, when both are known and target > 0. */
function heatProgress(s: SaunaState): number | undefined {
  if (s.currentTemp === undefined || !s.targetTemp || s.targetTemp <= 0) {
    return undefined;
  }
  return clamp01(s.currentTemp / s.targetTemp);
}

// The degree sign rides along in the value text (full size, naturally
// top-aligned like the card), not as a shrunk trailing unit.
const temp = (v: number | undefined): ItemValue | null =>
  v === undefined ? null : { text: `${Math.round(v)}°` };

type Get<T> = (s: SaunaState) => T | undefined;

/** Numeric value with an optional unit; null when the datum is absent. */
function numVal(
  get: Get<number>,
  unit?: string,
  dec = 0,
): (s: SaunaState) => ItemValue | null {
  return (s) => {
    const v = get(s);
    if (v === undefined) return null;
    const text = dec ? v.toFixed(dec) : `${Math.round(v)}`;
    return unit ? { text, unit } : { text };
  };
}

/** Whole-minute value with the compact "min" unit (identical across locales). */
const minutesVal = (get: Get<number>): ((s: SaunaState) => ItemValue | null) =>
  numVal(get, "min");

/** On/off value from a boolean field, localized; null when absent. */
function boolVal(
  get: Get<boolean>,
): (s: SaunaState, tr: TFn) => ItemValue | null {
  return (s, tr) => {
    const v = get(s);
    return v === undefined
      ? null
      : { text: tr(v ? "common.on" : "common.off") };
  };
}

/** A fixed-icon on/off item reading an auxiliary switch by logical key. */
function switchItem(key: string, icon: string, labelKey: string): BadgeItemDef {
  return {
    icon: () => icon,
    labelKey,
    value: boolVal((s) => s.switches?.[key]),
  };
}

/** Raw-string value (status codes, profile); null when empty/absent. */
function strVal(get: Get<string>): (s: SaunaState) => ItemValue | null {
  return (s) => {
    const v = get(s);
    return v ? { text: v } : null;
  };
}

export const BADGE_ITEMS: Record<BadgeItemKey, BadgeItemDef> = {
  status: {
    icon: (s) => STATUS_ICON[s.status],
    labelKey: "label.status",
    value: (s, tr) => ({ text: tr(STATUS_KEY[s.status]) }),
    progress: heatProgress,
    statusTinted: true,
  },
  current_temp: {
    icon: () => "mdi:thermometer",
    labelKey: "label.temperature",
    value: (s) => temp(s.currentTemp),
    progress: heatProgress,
    statusTinted: true,
  },
  target_temp: {
    icon: () => "mdi:thermometer-check",
    labelKey: "label.target_temperature",
    value: (s) => temp(s.targetTemp),
  },
  eta: {
    icon: () => "mdi:timer-sand",
    labelKey: "label.eta",
    value: minutesVal((s) => s.readyEtaMinutes),
  },
  humidity: {
    icon: () => "mdi:water-percent",
    labelKey: "label.humidity",
    value: numVal((s) => s.humidity, "%"),
    progress: (s) =>
      s.humidity === undefined ? undefined : clamp01(s.humidity / 100),
  },
  target_humidity: {
    icon: () => "mdi:water-check",
    labelKey: "label.target_humidity",
    value: numVal((s) => s.targetHumidity, "%"),
  },
  temp_trend: {
    icon: (s) =>
      (s.tempTrend ?? 0) < 0 ? "mdi:trending-down" : "mdi:trending-up",
    labelKey: "label.temp_trend",
    value: (s) =>
      s.tempTrend === undefined
        ? null
        : {
            text: `${s.tempTrend > 0 ? "+" : ""}${s.tempTrend.toFixed(1)}`,
            unit: "°/min",
          },
  },
  remaining: {
    icon: () => "mdi:timer-outline",
    labelKey: "label.remaining_time",
    // Deliberately compact: "45 min" rather than the localized long form
    // ("45 minutes" / "45 minuter"). "min" is the SI symbol and identical
    // across our locales (en/sv/fi/de), so this needs no separate locale key.
    value: minutesVal((s) => s.remainingMinutes),
  },
  session_length: {
    icon: () => "mdi:timer-cog-outline",
    labelKey: "label.session_length",
    value: minutesVal((s) => s.sessionLength),
  },
  power: {
    icon: () => "mdi:flash",
    labelKey: "label.power",
    value: numVal((s) => s.power, "W"),
  },
  energy: {
    icon: () => "mdi:lightning-bolt-outline",
    labelKey: "label.energy",
    value: numVal((s) => s.energy, "kWh", 1),
  },
  sessions: {
    icon: () => "mdi:counter",
    labelKey: "label.sessions_today",
    value: numVal((s) => s.sessionsToday),
  },
  last_session_duration: {
    icon: () => "mdi:history",
    labelKey: "label.last_session",
    value: minutesVal((s) => s.lastSessionDuration),
  },
  last_session_max_temp: {
    icon: () => "mdi:thermometer-high",
    labelKey: "label.last_session_max_temp",
    value: (s) => temp(s.lastSessionMaxTemp),
  },
  aroma_level: {
    icon: () => "mdi:scent",
    labelKey: "label.aroma_level",
    // Harvia exposes aroma level as a 0–100 percentage (number.py: PERCENTAGE).
    value: numVal((s) => s.aromaLevel, "%"),
  },
  wifi: {
    icon: () => "mdi:wifi",
    labelKey: "label.wifi",
    value: numVal((s) => s.wifiRssi, "dBm"),
  },
  door: {
    // Neutral icon when the door state is unknown, so an absent sensor doesn't
    // masquerade as "closed".
    icon: (s) =>
      s.doorOpen === undefined
        ? "mdi:door"
        : s.doorOpen
          ? "mdi:door-open"
          : "mdi:door-closed",
    labelKey: "label.door",
    value: (s, tr) =>
      s.doorOpen === undefined
        ? null
        : { text: tr(s.doorOpen ? "door.open" : "door.closed") },
  },
  heating: {
    icon: () => "mdi:fire",
    labelKey: "label.heating",
    value: boolVal((s) => s.heatingActive),
  },
  steam: {
    icon: () => "mdi:pot-steam",
    labelKey: "label.steam",
    value: boolVal((s) => s.steamActive),
  },
  // The main power switch's on/off state (distinct from `power`, the watt draw).
  power_switch: switchItem("power", "mdi:power", "control.power"),
  light: switchItem("light", "mdi:lightbulb", "control.light"),
  fan: switchItem("fan", "mdi:fan", "control.fan"),
  steamer: switchItem("steamer", "mdi:pot-steam-outline", "control.steamer"),
  aroma: switchItem("aroma", "mdi:air-filter", "control.aroma"),
  dehumidifier: switchItem(
    "dehumidifier",
    "mdi:air-humidifier-off",
    "control.dehumidifier",
  ),
  auto_light: switchItem(
    "auto_light",
    "mdi:lightbulb-auto",
    "control.auto_light",
  ),
  auto_fan: switchItem("auto_fan", "mdi:fan-auto", "control.auto_fan"),
  heater_power_actual: {
    icon: () => "mdi:flash-outline",
    labelKey: "label.heater_power",
    value: numVal((s) => s.heaterPowerActual, "W"),
  },
  main_sensor_temp: {
    icon: () => "mdi:thermometer",
    labelKey: "label.main_sensor_temp",
    value: (s) => temp(s.mainSensorTemp),
  },
  ext_sensor_temp: {
    icon: () => "mdi:thermometer-lines",
    labelKey: "label.ext_sensor_temp",
    value: (s) => temp(s.extSensorTemp),
  },
  panel_temp: {
    icon: () => "mdi:thermometer",
    labelKey: "label.panel_temp",
    value: (s) => temp(s.panelTemp),
  },
  status_codes: {
    icon: () => "mdi:alert-circle-outline",
    labelKey: "label.status_codes",
    value: strVal((s) => s.statusCodes),
  },
  active_profile: {
    icon: () => "mdi:account-cog-outline",
    labelKey: "label.active_profile",
    value: strVal((s) => s.activeProfile),
  },
  heat_on_counter: {
    icon: () => "mdi:counter",
    labelKey: "label.heat_on_counter",
    value: numVal((s) => s.heatOnCounter),
  },
  steam_on_counter: {
    icon: () => "mdi:counter",
    labelKey: "label.steam_on_counter",
    value: numVal((s) => s.steamOnCounter),
  },
  ph1_relay_counter: {
    icon: () => "mdi:counter",
    labelKey: "label.ph1_relay_counter",
    value: numVal((s) => s.ph1RelayCounter),
  },
  ph2_relay_counter: {
    icon: () => "mdi:counter",
    labelKey: "label.ph2_relay_counter",
    value: numVal((s) => s.ph2RelayCounter),
  },
  ph3_relay_counter: {
    icon: () => "mdi:counter",
    labelKey: "label.ph3_relay_counter",
    value: numVal((s) => s.ph3RelayCounter),
  },
  total_hours: {
    icon: () => "mdi:clock-outline",
    labelKey: "label.total_hours",
    value: numVal((s) => s.totalHours, "h"),
  },
  total_bathing_hours: {
    icon: () => "mdi:clock-check-outline",
    labelKey: "label.total_bathing_hours",
    value: numVal((s) => s.totalBathingHours, "h"),
  },
  total_sessions: {
    icon: () => "mdi:counter",
    labelKey: "label.total_sessions",
    value: numVal((s) => s.totalSessions),
  },
  remote_allowed: {
    icon: () => "mdi:remote",
    labelKey: "label.remote_allowed",
    value: boolVal((s) => s.remoteAllowed),
  },
  safety_relay: {
    icon: () => "mdi:shield-check-outline",
    labelKey: "label.safety_relay",
    value: boolVal((s) => s.safetyRelay),
  },
  screen_lock: {
    icon: () => "mdi:lock-outline",
    labelKey: "label.screen_lock",
    value: boolVal((s) => s.screenLock),
  },
};

/** Type guard for a badge item key, safe against prototype keys (toString …). */
export function isBadgeItemKey(k: unknown): k is BadgeItemKey {
  return (
    typeof k === "string" &&
    Object.prototype.hasOwnProperty.call(BADGE_ITEMS, k)
  );
}
