import type {
  Hass,
  SaunaAdapter,
  SaunaCardConfig,
  SaunaState,
  DetectedDevice,
} from "../types";
import {
  findDevicesForPlatform,
  resolveEntities,
  type EntityDescriptor,
} from "../utils/autodetect";
import { buildSaunaState } from "./build-state";

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
  heaterPowerActual: {
    domain: "sensor",
    translationKey: "heater_power_actual",
  },
  mainSensorTemp: { domain: "sensor", translationKey: "main_sensor_temp" },
  extSensorTemp: { domain: "sensor", translationKey: "ext_sensor_temp" },
  panelTemp: { domain: "sensor", translationKey: "panel_temp" },
  statusCodes: { domain: "sensor", translationKey: "status_codes" },
  activeProfile: { domain: "sensor", translationKey: "active_profile" },
  heatOnCounter: { domain: "sensor", translationKey: "heat_on_counter" },
  steamOnCounter: { domain: "sensor", translationKey: "steam_on_counter" },
  ph1RelayCounter: { domain: "sensor", translationKey: "ph1_relay_counter" },
  ph2RelayCounter: { domain: "sensor", translationKey: "ph2_relay_counter" },
  ph3RelayCounter: { domain: "sensor", translationKey: "ph3_relay_counter" },
  totalHours: { domain: "sensor", translationKey: "total_hours" },
  totalBathingHours: {
    domain: "sensor",
    translationKey: "total_bathing_hours",
  },
  totalSessions: { domain: "sensor", translationKey: "total_sessions" },
  door: { domain: "binary_sensor", translationKey: "door" },
  heating: { domain: "binary_sensor", translationKey: "heat_on" },
  steam: { domain: "binary_sensor", translationKey: "steam_on" },
  remoteAllowed: { domain: "binary_sensor", translationKey: "remote_allowed" },
  safetyRelay: { domain: "binary_sensor", translationKey: "safety_relay" },
  screenLock: { domain: "binary_sensor", translationKey: "screen_lock" },
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

/** Best-effort device model: "xenio" | "fenix" | undefined. */
export function detectModel(hass: Hass, deviceId: string): string | undefined {
  const model = `${hass.devices?.[deviceId]?.model ?? ""}`.toLowerCase();
  if (model.includes("xenio") || model.startsWith("cx")) return "xenio";
  if (model.includes("fenix") || model.startsWith("fx")) return "fenix";
  return undefined;
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
    return buildSaunaState(
      hass,
      HARVIA_PLATFORM,
      device.deviceId,
      e,
      detectModel(hass, device.deviceId),
    );
  },
};
