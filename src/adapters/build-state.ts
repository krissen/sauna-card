// Shared state builder: maps a resolved `entities` record (logical key →
// entity_id) into the normalized `SaunaState` the card renders. Both the Harvia
// adapter (entities resolved via its platform) and the manual adapter (entities
// taken from a user-supplied entity_map) call this, so a manually mapped sauna
// renders identically to a Harvia one — for whatever entities are present.
import type { Hass, SaunaState, SaunaStatus } from "../types";
import { dlog } from "../log";

const UNAVAILABLE = new Set(["unavailable", "unknown", "none", ""]);

// A sauna heater draws kilowatts while running and ≈0 W in standby, so any
// non-trivial draw is firm evidence the sauna is on. The low threshold only
// guards against sensor noise — it is not a meaningful "is it heating" cutoff.
const POWER_DRAW_ON_W = 50;

/** Numeric entity state, or undefined when absent/unavailable/non-numeric. */
export function num(
  hass: Hass,
  entityId: string | undefined,
): number | undefined {
  if (!entityId) return undefined;
  const st = hass.states[entityId];
  if (!st || UNAVAILABLE.has(st.state)) return undefined;
  const n = Number(st.state);
  return Number.isFinite(n) ? n : undefined;
}

/** On/off entity state, or undefined when absent/unavailable. */
export function isOn(
  hass: Hass,
  entityId: string | undefined,
): boolean | undefined {
  if (!entityId) return undefined;
  const st = hass.states[entityId];
  if (!st || UNAVAILABLE.has(st.state)) return undefined;
  return st.state === "on";
}

/** Raw string entity state, or undefined when absent/unavailable. */
export function str(
  hass: Hass,
  entityId: string | undefined,
): string | undefined {
  if (!entityId) return undefined;
  const st = hass.states[entityId];
  if (!st || UNAVAILABLE.has(st.state)) return undefined;
  return st.state;
}

/** A numeric attribute of an entity (e.g. a climate entity's current_temperature). */
export function attrNum(
  hass: Hass,
  entityId: string | undefined,
  attr: string,
): number | undefined {
  if (!entityId) return undefined;
  const v = hass.states[entityId]?.attributes?.[attr];
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** A climate entity is "on" when its mode is anything other than "off". */
function climateOn(
  hass: Hass,
  entityId: string | undefined,
): boolean | undefined {
  if (!entityId) return undefined;
  const st = hass.states[entityId];
  if (!st || UNAVAILABLE.has(st.state)) return undefined;
  return st.state !== "off";
}

/** A climate entity is heating when its hvac_action attribute reads "heating". */
function climateHeating(
  hass: Hass,
  entityId: string | undefined,
): boolean | undefined {
  if (!entityId) return undefined;
  const action = hass.states[entityId]?.attributes?.hvac_action;
  if (action === undefined || action === null) return undefined;
  return action === "heating";
}

export function deriveStatus(
  powerOn: boolean | undefined,
  heatingActive: boolean | undefined,
  currentTemp: number | undefined,
  targetTemp: number | undefined,
  ready?: boolean,
): SaunaStatus {
  if (powerOn === false) return "off";
  if (powerOn === undefined) return "unknown";
  // The integration's latched ready flag is authoritative when present — it
  // stays "ready" for the rest of the session even while the heater cycles to
  // hold temperature.
  if (ready === true) return "ready";
  if (heatingActive) return "heating";
  if (currentTemp !== undefined && targetTemp !== undefined) {
    return currentTemp >= targetTemp - 2 ? "ready" : "idle";
  }
  return "idle";
}

/**
 * Logical keys whose on/off state is collected into `SaunaState.switches`. The
 * map value is the switch-dict key; the entities key (some camelCase) differs
 * only for the auto switches.
 */
const SWITCH_KEYS: Array<[entityKey: string, switchKey: string]> = [
  ["power", "power"],
  ["light", "light"],
  ["fan", "fan"],
  ["steamer", "steamer"],
  ["aroma", "aroma"],
  ["dehumidifier", "dehumidifier"],
  ["autoLight", "auto_light"],
  ["autoFan", "auto_fan"],
  ["ambilight", "ambilight"],
];

/**
 * Build the normalized state from a resolved entities map. Temperature, power
 * and heating prefer their dedicated entities when mapped and fall back to the
 * thermostat (climate) entity's attributes — so a climate-only sauna still shows
 * status and temperatures.
 */
export function buildSaunaState(
  hass: Hass,
  integration: string,
  deviceId: string,
  e: Record<string, string>,
  model?: string,
  debug = false,
): SaunaState {
  // Key-aware readers: when debug is on, flag a mapped entity that is present in
  // hass but reads as unusable (the genuine "you mapped this but its value can't
  // be used" case, e.g. a pollen sensor mapped as temperature). Unmapped keys are
  // skipped, and the manual adapter has already pruned truly-missing entities.
  const raw = (id?: string) => (id ? hass.states[id]?.state : undefined);
  const n = (key: string, id?: string): number | undefined => {
    const v = num(hass, id);
    if (debug && id && hass.states[id] && v === undefined)
      dlog(
        true,
        `mapping '${key}' (${id}) = "${raw(id)}" is not numeric (ignored)`,
      );
    return v;
  };
  const b = (key: string, id?: string): boolean | undefined => {
    const v = isOn(hass, id);
    if (debug && id && hass.states[id] && v === undefined)
      dlog(
        true,
        `mapping '${key}' (${id}) = "${raw(id)}" is unavailable (ignored)`,
      );
    return v;
  };
  const s = (key: string, id?: string): string | undefined => {
    const v = str(hass, id);
    if (debug && id && hass.states[id] && v === undefined)
      dlog(
        true,
        `mapping '${key}' (${id}) = "${raw(id)}" is unavailable (ignored)`,
      );
    return v;
  };
  const attr = (key: string, id: string | undefined, name: string) => {
    const v = attrNum(hass, id, name);
    if (debug && id && hass.states[id] && v === undefined)
      dlog(
        true,
        `mapping '${key}': thermostat (${id}) has no usable ${name} attribute (ignored)`,
      );
    return v;
  };

  const currentTemp =
    e.currentTemperature !== undefined
      ? n("currentTemperature", e.currentTemperature)
      : attr("currentTemperature", e.thermostat, "current_temperature");
  const targetTemp =
    e.targetTemperature !== undefined
      ? n("targetTemperature", e.targetTemperature)
      : attr("targetTemperature", e.thermostat, "temperature");
  const heatingActive =
    e.heating !== undefined
      ? b("heating", e.heating)
      : climateHeating(hass, e.thermostat);
  const powerDraw = n("powerSensor", e.powerSensor);
  const ready = b("ready", e.ready);
  // A session started from the Harvia app does not flip switch.power, yet the
  // heater still signals it is running, so reading the switch alone shows such a
  // session as off/cooling. Treat signs of actual operation as authoritative: the
  // heater is heating (heat_on / hvac_action), drawing real power, or the
  // integration's per-session ready latch is set. We deliberately do NOT treat
  // the climate *mode* as such an override — a mapped power switch is an explicit
  // physical cutoff that wins over climate intent (and is already the on/off
  // source when no switch is mapped). switchPower stays true | false | undefined;
  // only a positive running signal forces true — a genuine off (switch off, not
  // heating, no draw, not ready) still yields false → "off", and no signals at
  // all stays undefined.
  const switchPower =
    e.power !== undefined ? b("power", e.power) : climateOn(hass, e.thermostat);
  const runningSignal =
    heatingActive === true ||
    ready === true ||
    (powerDraw !== undefined && powerDraw > POWER_DRAW_ON_W);
  const powerOn = runningSignal ? true : switchPower;
  const tempTrend = n("tempTrend", e.tempTrend);

  // Ready ETA. Prefer the integration's live `time_to_ready` sensor (v2.7.0): a
  // genuine countdown that decreases as the sauna heats. We still do NOT use
  // `heat_up_time` — despite the name it is a static estimate (it reads the same
  // value even while the sauna is off). When `time_to_ready` is absent (Harvia
  // sensor disabled, or the manual adapter) fall back to a local estimate from
  // the temperature trend (current → target at the current °C/min).
  const timeToReady = n("timeToReady", e.timeToReady);
  let readyEtaMinutes: number | undefined;
  if (timeToReady !== undefined && timeToReady > 0) {
    readyEtaMinutes = Math.round(timeToReady);
  } else if (
    timeToReady === undefined &&
    heatingActive &&
    currentTemp !== undefined &&
    targetTemp !== undefined &&
    tempTrend !== undefined &&
    tempTrend > 0 &&
    currentTemp < targetTemp
  ) {
    readyEtaMinutes = Math.ceil((targetTemp - currentTemp) / tempTrend);
  }

  // Climate presets surface as attributes on the thermostat. Filter out HA's
  // "none" pseudo-preset; an active preset of "none" means none is applied.
  const presetAttr = e.thermostat
    ? hass.states[e.thermostat]?.attributes
    : undefined;
  const rawPresets = presetAttr?.preset_modes;
  const presetModes = Array.isArray(rawPresets)
    ? (rawPresets as unknown[]).filter(
        (p): p is string => typeof p === "string" && p !== "none",
      )
    : undefined;
  const rawActivePreset = presetAttr?.preset_mode;
  const activePreset =
    typeof rawActivePreset === "string" && rawActivePreset !== "none"
      ? rawActivePreset
      : undefined;

  // Auxiliary switch states, by logical key (omitting any that are absent).
  const switches: Record<string, boolean> = {};
  for (const [entityKey, switchKey] of SWITCH_KEYS) {
    const on = b(entityKey, e[entityKey]);
    if (on !== undefined) switches[switchKey] = on;
  }

  return {
    integration,
    deviceId,
    // Defaults to the registry id; the Harvia adapter overrides this with the
    // cloud id its services require.
    serviceDeviceId: deviceId,
    model,
    available: Object.keys(e).length > 0,
    powerOn,
    switchPower,
    status: deriveStatus(
      powerOn,
      heatingActive,
      currentTemp,
      targetTemp,
      ready,
    ),
    currentTemp,
    targetTemp,
    humidity: n("humidity", e.humidity),
    remainingMinutes: n("remainingTime", e.remainingTime),
    readyEtaMinutes,
    ready,
    readyAtIso: s("readyAt", e.readyAt),
    power: powerDraw,
    energy: n("energy", e.energy),
    sessionsToday: n("sessionsToday", e.sessionsToday),
    sessionsWeek: n("sessionsWeek", e.sessionsWeek),
    lastSessionEnergy: n("lastSessionEnergy", e.lastSessionEnergy),
    recordsTotal: n("records", e.records),
    recordMaxTemp: attr("recordMaxTemp", e.records, "hottest_session_c"),
    recordDurationMin: attr(
      "recordDurationMin",
      e.records,
      "longest_session_min",
    ),
    cloudConnected: b("cloudConnection", e.cloudConnection),
    presetModes,
    activePreset,
    nextSessionIso: s("nextSession", e.nextSession),
    plannedStartIso: s("plannedStart", e.plannedStart),
    preheatCalibrated:
      e.plannedStart !== undefined
        ? hass.states[e.plannedStart]?.attributes?.model_calibrated === true
        : undefined,
    tempTrend,
    wifiRssi: n("wifi", e.wifi),
    doorOpen: b("door", e.door),
    heatingActive,
    steamActive: b("steam", e.steam),
    targetHumidity: n("targetHumidity", e.targetHumidity),
    aromaLevel: n("aromaLevelSet", e.aromaLevelSet),
    sessionLength: n("sessionLength", e.sessionLength),
    lastSessionDuration: n("lastSessionDuration", e.lastSessionDuration),
    lastSessionMaxTemp: n("lastSessionMaxTemp", e.lastSessionMaxTemp),
    heaterPowerActual: n("heaterPowerActual", e.heaterPowerActual),
    mainSensorTemp: n("mainSensorTemp", e.mainSensorTemp),
    extSensorTemp: n("extSensorTemp", e.extSensorTemp),
    panelTemp: n("panelTemp", e.panelTemp),
    statusCodes: s("statusCodes", e.statusCodes),
    activeProfile: s("activeProfile", e.activeProfile),
    heatOnCounter: n("heatOnCounter", e.heatOnCounter),
    steamOnCounter: n("steamOnCounter", e.steamOnCounter),
    ph1RelayCounter: n("ph1RelayCounter", e.ph1RelayCounter),
    ph2RelayCounter: n("ph2RelayCounter", e.ph2RelayCounter),
    ph3RelayCounter: n("ph3RelayCounter", e.ph3RelayCounter),
    totalHours: n("totalHours", e.totalHours),
    totalBathingHours: n("totalBathingHours", e.totalBathingHours),
    totalSessions: n("totalSessions", e.totalSessions),
    remoteAllowed: b("remoteAllowed", e.remoteAllowed),
    safetyRelay: b("safetyRelay", e.safetyRelay),
    screenLock: b("screenLock", e.screenLock),
    switches,
    entities: e,
  };
}
