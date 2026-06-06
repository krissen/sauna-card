import type { Hass } from "./types";
import { HARVIA_PLATFORM } from "./adapters/harvia";
import { findDevicesForPlatform } from "./utils/autodetect";

export interface EntitySuggestion {
  config: Record<string, unknown>;
}

/**
 * Extract the integration domain from a Home Assistant brands icon URL, e.g.
 * `https://brands.home-assistant.io/_/harvia_sauna/icon.png` -> `harvia_sauna`.
 * Returns null for anything that isn't a brands URL.
 */
function brandsDomain(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const m = /brands\.home-assistant\.io\/(?:_\/)?([a-z0-9_]+)\//.exec(url);
  return m ? m[1] : null;
}

/**
 * Is `entityId` the HACS update entity that tracks the Harvia integration repo?
 * Such an entity has `platform === "hacs"` and its `device_id` points at the
 * HACS repo device — not the sauna — so it falls outside the direct
 * platform check below. We tie it to the integration by the brands icon HACS
 * sets on it (keyed by the integration **domain**, .../_/harvia_sauna/icon.png),
 * which matches our own HARVIA_PLATFORM constant — robust against the renamable
 * entity_id slug and free of any hardcoded GitHub repo id.
 */
function isHarviaHacsUpdate(hass: Hass, entityId: string): boolean {
  if (entityId.split(".")[0] !== "update") return false;
  if (hass.entities?.[entityId]?.platform !== "hacs") return false;
  const picture = hass.states?.[entityId]?.attributes?.entity_picture;
  return brandsDomain(picture) === HARVIA_PLATFORM;
}

/**
 * HA 2026.6 card-picker suggestion: offer sauna-card pre-configured when the
 * user picks **any** Harvia entity, pre-filling the device so the card targets
 * the right one. The picker calls this once per selected entity, so suggesting
 * for every integration entity (sensors, binary_sensors, numbers, switches,
 * update, climate) surfaces the card across the whole device — not just the
 * thermostat — without cluttering the picker. The platform check is the real
 * relevance gate; anything outside harvia_sauna returns null.
 *
 * We also suggest for HACS's own update entity for the Harvia integration: it
 * shows up under "harvia" in the picker but lives on the platform `hacs` and
 * its device is the repo, not the sauna. There we resolve the actual sauna
 * device by autodetect (and only suggest when one exists, so the card has
 * something to show).
 */
export function suggestEntity(
  hass: Hass,
  entityId: string,
): EntitySuggestion | null {
  const entry = hass.entities?.[entityId];
  if (!entry) return null;

  if (entry.platform === HARVIA_PLATFORM) {
    const config: Record<string, unknown> = { type: "custom:sauna-card" };
    if (entry.device_id) config.device_id = entry.device_id;
    return { config };
  }

  if (isHarviaHacsUpdate(hass, entityId)) {
    const device = findDevicesForPlatform(hass, HARVIA_PLATFORM)[0];
    if (!device) return null;
    return {
      config: { type: "custom:sauna-card", device_id: device.deviceId },
    };
  }

  return null;
}
