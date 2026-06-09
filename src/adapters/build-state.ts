// Shared state builder: maps a resolved `entities` record (logical key →
// entity_id) into the normalized `SaunaState` the card renders. Both the Harvia
// adapter (entities resolved via its platform) and the manual adapter (entities
// taken from a user-supplied entity_map) call this, so a manually mapped sauna
// renders identically to a Harvia one — for whatever entities are present.
import type { Hass, SaunaState, SaunaStatus } from "../types";
import { dlog } from "../log";

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
  const powerOn =
    e.power !== undefined ? b("power", e.power) : climateOn(hass, e.thermostat);
  const heatingActive =
    e.heating !== undefined
      ? b("heating", e.heating)
      : climateHeating(hass, e.thermostat);
  const tempTrend = n("tempTrend", e.tempTrend);

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
    const on = b(entityKey, e[entityKey]);
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
    humidity: n("humidity", e.humidity),
    remainingMinutes: n("remainingTime", e.remainingTime),
    readyEtaMinutes,
    power: n("powerSensor", e.powerSensor),
    energy: n("energy", e.energy),
    sessionsToday: n("sessionsToday", e.sessionsToday),
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
