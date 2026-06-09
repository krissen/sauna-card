// Generic adapter for DIY / non-Harvia saunas. Instead of detecting an
// integration, it reads a user-supplied entity_map (logical key → entity_id)
// built in the editor. The logical keys are exactly those the shared state
// builder understands, so a manually mapped sauna renders like a Harvia one for
// whatever entities the user has.
import type { Hass, SaunaAdapter, SaunaCardConfig } from "../types";
import { HARVIA_ENTITIES, type HarviaEntityKey } from "./harvia";
import { buildSaunaState } from "./build-state";
import { dlog } from "../log";

export const MANUAL_ID = "manual";

/** A mappable type offered in the editor: its logical key, the HA domains the
 * entity picker accepts and its i18n label. Ordered most-common first. */
export interface ManualEntitySpec {
  key: HarviaEntityKey;
  /** Domains the editor's entity picker is filtered to for this type. */
  domains: string[];
  labelKey: string;
}

// On/off controls are toggled via the domain-agnostic homeassistant.toggle, so
// a DIY light/fan needn't be a `switch.*` — accept the common on/off domains.
const TOGGLE_DOMAINS = ["switch", "light", "fan", "input_boolean"];

// Logical key → label, in display order. The domain is derived from
// HARVIA_ENTITIES so the picker filter and the keys the state builder reads can
// never drift apart (a typo'd key fails to compile against HarviaEntityKey).
const CATALOG: Array<[HarviaEntityKey, string]> = [
  ["thermostat", "label.thermostat"],
  ["power", "control.power"],
  ["currentTemperature", "label.temperature"],
  ["targetTemperature", "label.target_temperature"],
  ["heating", "label.heating"],
  ["door", "label.door"],
  ["humidity", "label.humidity"],
  ["light", "control.light"],
  ["fan", "control.fan"],
  ["steamer", "control.steamer"],
  ["steam", "label.steam"],
  ["remainingTime", "label.remaining_time"],
  ["sessionLength", "label.session_length"],
  ["targetHumidity", "label.target_humidity"],
  ["aroma", "control.aroma"],
  ["aromaLevelSet", "label.aroma_level"],
  ["dehumidifier", "control.dehumidifier"],
  ["autoLight", "control.auto_light"],
  ["autoFan", "control.auto_fan"],
  ["powerSensor", "label.power"],
  ["energy", "label.energy"],
  ["heaterPowerActual", "label.heater_power"],
  ["tempTrend", "label.temp_trend"],
  ["sessionsToday", "label.sessions_today"],
  ["lastSessionDuration", "label.last_session"],
  ["lastSessionMaxTemp", "label.last_session_max_temp"],
  ["mainSensorTemp", "label.main_sensor_temp"],
  ["extSensorTemp", "label.ext_sensor_temp"],
  ["panelTemp", "label.panel_temp"],
  ["wifi", "label.wifi"],
  ["statusCodes", "label.status_codes"],
  ["activeProfile", "label.active_profile"],
  ["remoteAllowed", "label.remote_allowed"],
  ["safetyRelay", "label.safety_relay"],
  ["screenLock", "label.screen_lock"],
  ["heatOnCounter", "label.heat_on_counter"],
  ["steamOnCounter", "label.steam_on_counter"],
  ["ph1RelayCounter", "label.ph1_relay_counter"],
  ["ph2RelayCounter", "label.ph2_relay_counter"],
  ["ph3RelayCounter", "label.ph3_relay_counter"],
  ["totalHours", "label.total_hours"],
  ["totalBathingHours", "label.total_bathing_hours"],
  ["totalSessions", "label.total_sessions"],
];

export const MANUAL_ENTITY_CATALOG: ManualEntitySpec[] = CATALOG.map(
  ([key, labelKey]) => {
    const domain = HARVIA_ENTITIES[key].domain;
    // Switch-domain types are interactive toggles → accept the broader on/off
    // domains; everything else is filtered to its own domain.
    const domains = domain === "switch" ? TOGGLE_DOMAINS : [domain];
    return { key, domains, labelKey };
  },
);

/** Keep only mappings whose entity_id is non-empty and actually present in hass. */
function pruneToExisting(
  hass: Hass,
  map: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entityId] of Object.entries(map)) {
    if (entityId && hass.states[entityId]) out[key] = entityId;
  }
  return out;
}

export const manualAdapter: SaunaAdapter = {
  id: MANUAL_ID,
  manual: true,

  stubConfig: {
    integration: MANUAL_ID,
    layout: "status-dashboard",
    entity_map: {},
  },

  // Manual mapping is never auto-detected; it's chosen explicitly in the editor.
  detect: () => [],

  resolveEntityIds(
    hass: Hass,
    config: SaunaCardConfig,
  ): Record<string, string> {
    return pruneToExisting(hass, config.entity_map ?? {});
  },

  readState(hass, config) {
    const debug = config.debug === true;
    const map = config.entity_map ?? {};
    const entities = pruneToExisting(hass, map);
    if (debug) {
      // Surface mapped entity_ids that aren't present in hass (typo / removed
      // entity) — pruning would otherwise drop them silently.
      for (const [key, id] of Object.entries(map)) {
        if (id && !hass.states[id])
          dlog(
            true,
            `dropped mapping '${key}' (${id}) — entity not found in Home Assistant`,
          );
      }
    }
    if (Object.keys(entities).length === 0) return null;
    return buildSaunaState(
      hass,
      MANUAL_ID,
      config.device_id ?? MANUAL_ID,
      entities,
      undefined,
      debug,
    );
  },
};
