import type { Hass } from "./types";
import { HARVIA_PLATFORM } from "./adapters/harvia";
import { findDevicesForPlatform } from "./utils/autodetect";

export interface EntitySuggestion {
  config: Record<string, unknown>;
}

/**
 * Platforms that own the update entity tracking an installed community
 * repository: `hacs` before Home Assistant 2026.11, `marketplace` from 2026.11
 * (the built-in Marketplace migrates HACS's registry entries to its own
 * platform).
 */
const REPO_UPDATE_PLATFORMS: ReadonlySet<string> = new Set([
  "hacs",
  "marketplace",
]);

/**
 * Extract the integration domain from a brand icon URL. Two forms exist:
 * - brands CDN (HACS): `https://brands.home-assistant.io/_/harvia_sauna/icon.png`
 * - local brands API (Marketplace, HA 2026.11):
 *   `/api/brands/integration/harvia_sauna/icon.png`
 * Returns null for anything else.
 */
function brandsDomain(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const m =
    /brands\.home-assistant\.io\/(?:_\/)?([a-z0-9_]+)\//.exec(url) ??
    /^\/api\/brands\/integration\/([a-z0-9_]+)\//.exec(url);
  return m ? m[1] : null;
}

/**
 * Is `entityId` the HACS/Marketplace update entity that tracks the Harvia
 * integration repo? Such an entity lives on platform `hacs` or `marketplace`
 * and its `device_id` points at the repository device — not the sauna — so it
 * falls outside the direct platform check below. We tie it to the integration
 * by the brand icon set on it (keyed by the integration **domain**), which
 * matches our own HARVIA_PLATFORM constant — robust against the renamable
 * entity_id slug and free of any hardcoded GitHub repo id.
 */
function isHarviaRepoUpdate(hass: Hass, entityId: string): boolean {
  if (entityId.split(".")[0] !== "update") return false;
  const platform = hass.entities?.[entityId]?.platform;
  if (platform === undefined || !REPO_UPDATE_PLATFORMS.has(platform))
    return false;
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
 * We also suggest for the HACS/Marketplace update entity for the Harvia
 * integration: it shows up under "harvia" in the picker but lives on platform
 * `hacs` (or `marketplace` from HA 2026.11) and its device is the repo, not the
 * sauna. There we resolve the actual sauna
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

  if (isHarviaRepoUpdate(hass, entityId)) {
    const device = findDevicesForPlatform(hass, HARVIA_PLATFORM)[0];
    if (!device) return null;
    return {
      config: { type: "custom:sauna-card", device_id: device.deviceId },
    };
  }

  return null;
}
