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

/** The logical values a badge item can surface. */
export type BadgeItemKey =
  | "status"
  | "current_temp"
  | "target_temp"
  | "humidity"
  | "remaining"
  | "power"
  | "energy"
  | "sessions"
  | "door";

/** Order used wherever the full item set is offered (editor, defaults). */
export const BADGE_ITEM_KEYS: BadgeItemKey[] = [
  "status",
  "current_temp",
  "target_temp",
  "humidity",
  "remaining",
  "power",
  "energy",
  "sessions",
  "door",
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
  /** Whether icon/value/ring should be tinted by the sauna status colour. */
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

const temp = (v: number | undefined): ItemValue | null =>
  v === undefined ? null : { text: `${Math.round(v)}`, unit: "°" };

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
  humidity: {
    icon: () => "mdi:water-percent",
    labelKey: "label.humidity",
    value: (s) =>
      s.humidity === undefined
        ? null
        : { text: `${Math.round(s.humidity)}`, unit: "%" },
    progress: (s) =>
      s.humidity === undefined ? undefined : clamp01(s.humidity / 100),
  },
  remaining: {
    icon: () => "mdi:timer-outline",
    labelKey: "label.remaining_time",
    value: (s) =>
      s.remainingMinutes === undefined
        ? null
        : { text: `${s.remainingMinutes}`, unit: "min" },
  },
  power: {
    icon: () => "mdi:flash",
    labelKey: "label.power",
    value: (s) =>
      s.power === undefined
        ? null
        : { text: `${Math.round(s.power)}`, unit: "W" },
  },
  energy: {
    icon: () => "mdi:lightning-bolt-outline",
    labelKey: "label.energy",
    value: (s) =>
      s.energy === undefined
        ? null
        : { text: s.energy.toFixed(1), unit: "kWh" },
  },
  sessions: {
    icon: () => "mdi:counter",
    labelKey: "label.sessions_today",
    value: (s) =>
      s.sessionsToday === undefined ? null : { text: `${s.sessionsToday}` },
  },
  door: {
    icon: (s) => (s.doorOpen ? "mdi:door-open" : "mdi:door-closed"),
    labelKey: "label.door",
    value: (s, tr) =>
      s.doorOpen === undefined
        ? null
        : { text: tr(s.doorOpen ? "door.open" : "door.closed") },
  },
};
