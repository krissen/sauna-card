import type { Hass, SaunaAdapter, DetectedDevice } from "./types";
import { harviaAdapter } from "./adapters/harvia";
import { manualAdapter } from "./adapters/manual";
import { INTEGRATION_PRIORITY } from "./utils/autodetect";

// Registry keyed by INTEGRATION (not device model). Device models such as
// Harvia Xenio/Fenix are handled inside their adapter. Add a new entry here to
// support another sauna integration. The manual adapter is registered but kept
// out of INTEGRATION_PRIORITY — it's only ever selected explicitly.
const registry: Record<string, SaunaAdapter> = {
  [harviaAdapter.id]: harviaAdapter,
  [manualAdapter.id]: manualAdapter,
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
    // An explicit choice wins; manual adapters have nothing to detect (they map
    // user-supplied entities), so they bypass the detect gate.
    if (adapter && (adapter.manual || adapter.detect(hass).length > 0)) {
      return adapter;
    }
  }
  for (const id of INTEGRATION_PRIORITY) {
    const adapter = registry[id];
    if (adapter && adapter.detect(hass).length > 0) return adapter;
  }
  return undefined;
}

/** Every detected device across all auto-detectable integrations (manual
 * adapters are excluded — they have no device to suggest). */
export function detectAllDevices(hass: Hass): DetectedDevice[] {
  return getAllAdapterIds()
    .filter((id) => !registry[id].manual)
    .flatMap((id) => registry[id].detect(hass));
}
