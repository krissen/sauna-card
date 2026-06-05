import type { Hass, SaunaAdapter, DetectedDevice } from "./types";
import { harviaAdapter } from "./adapters/harvia";
import { INTEGRATION_PRIORITY } from "./utils/autodetect";

// Registry keyed by INTEGRATION (not device model). Device models such as
// Harvia Xenio/Fenix are handled inside their adapter. Add a new entry here to
// support another sauna integration.
const registry: Record<string, SaunaAdapter> = {
  [harviaAdapter.id]: harviaAdapter,
};

export function getAdapter(id: string): SaunaAdapter | undefined {
  return registry[id];
}

export function getAllAdapterIds(): string[] {
  return Object.keys(registry);
}

export function getStubConfig(id: string) {
  return registry[id]?.stubConfig;
}

/**
 * Auto-select an integration: an explicit choice if installed, otherwise the
 * first integration (in priority order) that actually exposes a device.
 */
export function pickIntegration(
  hass: Hass,
  explicit?: string,
): SaunaAdapter | undefined {
  if (explicit) {
    const adapter = registry[explicit];
    if (adapter && adapter.detect(hass).length > 0) return adapter;
  }
  for (const id of INTEGRATION_PRIORITY) {
    const adapter = registry[id];
    if (adapter && adapter.detect(hass).length > 0) return adapter;
  }
  return undefined;
}

/** Every detected device across all known integrations. */
export function detectAllDevices(hass: Hass): DetectedDevice[] {
  return getAllAdapterIds().flatMap((id) => registry[id].detect(hass));
}
