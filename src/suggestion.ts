import type { Hass } from "./types";
import { HARVIA_PLATFORM } from "./adapters/harvia";

export interface EntitySuggestion {
  config: Record<string, unknown>;
}

/**
 * HA 2026.6 card-picker suggestion: offer sauna-card pre-configured when the
 * user picks a Harvia **climate** (thermostat) entity, pre-filling the device so
 * the card targets the right one. Returns null for anything else, so the picker
 * stays uncluttered.
 */
export function suggestEntity(
  hass: Hass,
  entityId: string,
): EntitySuggestion | null {
  const entry = hass.entities?.[entityId];
  if (!entry || entry.platform !== HARVIA_PLATFORM) return null;
  if (entityId.split(".")[0] !== "climate") return null;
  const config: Record<string, unknown> = { type: "custom:sauna-card" };
  if (entry.device_id) config.device_id = entry.device_id;
  return { config };
}
