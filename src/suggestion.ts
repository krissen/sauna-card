import type { Hass } from "./types";
import { HARVIA_PLATFORM } from "./adapters/harvia";

export interface EntitySuggestion {
  config: Record<string, unknown>;
}

/**
 * HA 2026.6 card-picker suggestion: offer sauna-card pre-configured when the
 * user picks **any** Harvia entity, pre-filling the device so the card targets
 * the right one. The picker calls this once per selected entity, so suggesting
 * for every integration entity (sensors, binary_sensors, numbers, switches,
 * update, climate) surfaces the card across the whole device — not just the
 * thermostat — without cluttering the picker. The platform check is the real
 * relevance gate; anything outside harvia_sauna returns null.
 */
export function suggestEntity(
  hass: Hass,
  entityId: string,
): EntitySuggestion | null {
  const entry = hass.entities?.[entityId];
  if (!entry || entry.platform !== HARVIA_PLATFORM) return null;
  const config: Record<string, unknown> = { type: "custom:sauna-card" };
  if (entry.device_id) config.device_id = entry.device_id;
  return { config };
}
