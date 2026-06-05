import type {
  Hass,
  SaunaAdapter,
  SaunaCardConfig,
  SaunaState,
  SaunaStatus,
  DetectedDevice,
} from "../types";
import {
  findDevicesForPlatform,
  resolveEntities,
  type EntityDescriptor,
} from "../utils/autodetect";

export const HARVIA_PLATFORM = "harvia_sauna";

/**
 * Logical entity → (domain, translation_key). Keyed by the integration's
 * language-independent translation_key, so localized entity_id slugs are
 * irrelevant. `switch.power` and `sensor.power` share the key `power`, hence the
 * (domain, key) pairing.
 */
export const HARVIA_ENTITIES = {
  thermostat: { domain: "climate", translationKey: "thermostat" },
  currentTemperature: {
    domain: "sensor",
    translationKey: "current_temperature",
  },
  targetTemperature: { domain: "sensor", translationKey: "target_temperature" },
  humidity: { domain: "sensor", translationKey: "humidity" },
  remainingTime: { domain: "sensor", translationKey: "remaining_time" },
  heatUpTime: { domain: "sensor", translationKey: "heat_up_time" },
  powerSensor: { domain: "sensor", translationKey: "power" },
  energy: { domain: "sensor", translationKey: "energy" },
  sessionsToday: { domain: "sensor", translationKey: "sessions_today" },
  tempTrend: { domain: "sensor", translationKey: "temp_trend" },
  wifi: { domain: "sensor", translationKey: "wifi_rssi" },
  lastSessionDuration: {
    domain: "sensor",
    translationKey: "last_session_duration",
  },
  lastSessionMaxTemp: {
    domain: "sensor",
    translationKey: "last_session_max_temp",
  },
  door: { domain: "binary_sensor", translationKey: "door" },
  heating: { domain: "binary_sensor", translationKey: "heat_on" },
  steam: { domain: "binary_sensor", translationKey: "steam_on" },
  targetHumidity: { domain: "number", translationKey: "target_humidity" },
  aromaLevelSet: { domain: "number", translationKey: "aroma_level_set" },
  sessionLength: { domain: "number", translationKey: "on_time" },
  power: { domain: "switch", translationKey: "power" },
  light: { domain: "switch", translationKey: "light" },
  fan: { domain: "switch", translationKey: "fan" },
  steamer: { domain: "switch", translationKey: "steamer" },
  aroma: { domain: "switch", translationKey: "aroma" },
  dehumidifier: { domain: "switch", translationKey: "dehumidifier" },
  autoLight: { domain: "switch", translationKey: "auto_light" },
  autoFan: { domain: "switch", translationKey: "auto_fan" },
} satisfies Record<string, EntityDescriptor>;

export type HarviaEntityKey = keyof typeof HARVIA_ENTITIES;

const UNAVAILABLE = new Set(["unavailable", "unknown", "none", ""]);

function num(hass: Hass, entityId: string | undefined): number | undefined {
  if (!entityId) return undefined;
  const st = hass.states[entityId];
  if (!st || UNAVAILABLE.has(st.state)) return undefined;
  const n = Number(st.state);
  return Number.isFinite(n) ? n : undefined;
}

function isOn(hass: Hass, entityId: string | undefined): boolean | undefined {
  if (!entityId) return undefined;
  const st = hass.states[entityId];
  if (!st || UNAVAILABLE.has(st.state)) return undefined;
  return st.state === "on";
}

/** Best-effort device model: "xenio" | "fenix" | undefined. */
export function detectModel(hass: Hass, deviceId: string): string | undefined {
  const model = `${hass.devices?.[deviceId]?.model ?? ""}`.toLowerCase();
  if (model.includes("xenio") || model.startsWith("cx")) return "xenio";
  if (model.includes("fenix") || model.startsWith("fx")) return "fenix";
  return undefined;
}

function deriveStatus(
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

function pickDevice(
  hass: Hass,
  config: SaunaCardConfig,
): DetectedDevice | undefined {
  const devices = findDevicesForPlatform(hass, HARVIA_PLATFORM);
  if (config.device_id) {
    return devices.find((d) => d.deviceId === config.device_id) ?? undefined;
  }
  return devices[0];
}

export const harviaAdapter: SaunaAdapter = {
  id: HARVIA_PLATFORM,

  stubConfig: {
    integration: HARVIA_PLATFORM,
    layout: "status-dashboard",
  },

  detect(hass: Hass): DetectedDevice[] {
    return findDevicesForPlatform(hass, HARVIA_PLATFORM);
  },

  resolveEntityIds(
    hass: Hass,
    config: SaunaCardConfig,
  ): Record<string, string> {
    const device = pickDevice(hass, config);
    if (!device) return {};
    return resolveEntities(
      hass,
      device.deviceId,
      HARVIA_PLATFORM,
      HARVIA_ENTITIES,
    );
  },

  readState(hass: Hass, config: SaunaCardConfig): SaunaState | null {
    const device = pickDevice(hass, config);
    if (!device) return null;
    const e = resolveEntities(
      hass,
      device.deviceId,
      HARVIA_PLATFORM,
      HARVIA_ENTITIES,
    );

    const currentTemp = num(hass, e.currentTemperature);
    const targetTemp = num(hass, e.targetTemperature);
    const powerOn = isOn(hass, e.power);
    const heatingActive = isOn(hass, e.heating);
    const tempTrend = num(hass, e.tempTrend);

    // Ready ETA: prefer the integration's native heat_up_time sensor (enabled by
    // default, in minutes). Fall back to a trend-derived estimate for setups
    // where only temp_trend is enabled (heat_up_time is then absent).
    let readyEtaMinutes = num(hass, e.heatUpTime);
    if (
      readyEtaMinutes === undefined &&
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
    const switchEntities: Record<string, string | undefined> = {
      power: e.power,
      light: e.light,
      fan: e.fan,
      steamer: e.steamer,
      aroma: e.aroma,
      dehumidifier: e.dehumidifier,
      auto_light: e.autoLight,
      auto_fan: e.autoFan,
    };
    const switches: Record<string, boolean> = {};
    for (const [key, id] of Object.entries(switchEntities)) {
      const on = isOn(hass, id);
      if (on !== undefined) switches[key] = on;
    }

    return {
      integration: HARVIA_PLATFORM,
      deviceId: device.deviceId,
      model: detectModel(hass, device.deviceId),
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
      switches,
      entities: e,
    };
  },
};
