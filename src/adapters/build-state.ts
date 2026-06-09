// Shared state builder: maps a resolved `entities` record (logical key →
// entity_id) into the normalized `SaunaState` the card renders. Both the Harvia
// adapter (entities resolved via its platform) and the manual adapter (entities
// taken from a user-supplied entity_map) call this, so a manually mapped sauna
// renders identically to a Harvia one — for whatever entities are present.
import type { Hass, SaunaState, SaunaStatus } from "../types";

const UNAVAILABLE = new Set(["unavailable", "unknown", "none", ""]);

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
function attrNum(
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
): SaunaStatus {
  if (powerOn === false) return "off";
  if (powerOn === undefined) return "unknown";
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
): SaunaState {
  const currentTemp =
    e.currentTemperature !== undefined
      ? num(hass, e.currentTemperature)
      : attrNum(hass, e.thermostat, "current_temperature");
  const targetTemp =
    e.targetTemperature !== undefined
      ? num(hass, e.targetTemperature)
      : attrNum(hass, e.thermostat, "temperature");
  const powerOn =
    e.power !== undefined ? isOn(hass, e.power) : climateOn(hass, e.thermostat);
  const heatingActive =
    e.heating !== undefined
      ? isOn(hass, e.heating)
      : climateHeating(hass, e.thermostat);
  const tempTrend = num(hass, e.tempTrend);

  // Ready ETA: estimate from the temperature trend (current → target at the
  // current °C/min). We deliberately do NOT use the integration's heat_up_time
  // sensor — despite the name it is a static heat-up estimate (it reads the same
  // value even while the sauna is off), not a live countdown, so showing it as
  // "ready in X" never decreases and misleads.
  let readyEtaMinutes: number | undefined;
  if (
    heatingActive &&
    currentTemp !== undefined &&
    targetTemp !== undefined &&
    tempTrend !== undefined &&
    tempTrend > 0 &&
    currentTemp < targetTemp
  ) {
    readyEtaMinutes = Math.ceil((targetTemp - currentTemp) / tempTrend);
  }

  // Auxiliary switch states, by logical key (omitting any that are absent).
  const switches: Record<string, boolean> = {};
  for (const [entityKey, switchKey] of SWITCH_KEYS) {
    const on = isOn(hass, e[entityKey]);
    if (on !== undefined) switches[switchKey] = on;
  }

  return {
    integration,
    deviceId,
    model,
    available: Object.keys(e).length > 0,
    status: deriveStatus(powerOn, heatingActive, currentTemp, targetTemp),
    currentTemp,
    targetTemp,
    humidity: num(hass, e.humidity),
    remainingMinutes: num(hass, e.remainingTime),
    readyEtaMinutes,
    power: num(hass, e.powerSensor),
    energy: num(hass, e.energy),
    sessionsToday: num(hass, e.sessionsToday),
    tempTrend,
    wifiRssi: num(hass, e.wifi),
    doorOpen: isOn(hass, e.door),
    heatingActive,
    steamActive: isOn(hass, e.steam),
    targetHumidity: num(hass, e.targetHumidity),
    aromaLevel: num(hass, e.aromaLevelSet),
    sessionLength: num(hass, e.sessionLength),
    lastSessionDuration: num(hass, e.lastSessionDuration),
    lastSessionMaxTemp: num(hass, e.lastSessionMaxTemp),
    heaterPowerActual: num(hass, e.heaterPowerActual),
    mainSensorTemp: num(hass, e.mainSensorTemp),
    extSensorTemp: num(hass, e.extSensorTemp),
    panelTemp: num(hass, e.panelTemp),
    statusCodes: str(hass, e.statusCodes),
    activeProfile: str(hass, e.activeProfile),
    heatOnCounter: num(hass, e.heatOnCounter),
    steamOnCounter: num(hass, e.steamOnCounter),
    ph1RelayCounter: num(hass, e.ph1RelayCounter),
    ph2RelayCounter: num(hass, e.ph2RelayCounter),
    ph3RelayCounter: num(hass, e.ph3RelayCounter),
    totalHours: num(hass, e.totalHours),
    totalBathingHours: num(hass, e.totalBathingHours),
    totalSessions: num(hass, e.totalSessions),
    remoteAllowed: isOn(hass, e.remoteAllowed),
    safetyRelay: isOn(hass, e.safetyRelay),
    screenLock: isOn(hass, e.screenLock),
    switches,
    entities: e,
  };
}
