import { describe, it, expect } from "vitest";
import {
  findDevicesForPlatform,
  resolveEntities,
  type EntityDescriptor,
} from "../../src/utils/autodetect";
import type { Hass } from "../../src/types";

const CATALOG: Record<string, EntityDescriptor> = {
  power: { domain: "switch", translationKey: "power" },
  current: { domain: "sensor", translationKey: "current_temperature" },
};

function entry(
  entity_id: string,
  device_id: string,
  translation_key: string,
  platform = "harvia_sauna",
) {
  return { entity_id, device_id, platform, translation_key };
}

function makeHass(
  entities: Record<string, ReturnType<typeof entry>>,
  devices: Record<string, { id: string; name?: string; name_by_user?: string }>,
): Hass {
  return { entities, devices } as unknown as Hass;
}

describe("autodetect resolution", () => {
  it("finds devices and resolves the catalog by (domain, translation_key)", () => {
    const hass = makeHass(
      {
        "switch.p": entry("switch.power_xyz", "d1", "power"),
        "sensor.c": entry("sensor.temp_xyz", "d1", "current_temperature"),
        // A second platform's entity must not leak into harvia results.
        "light.x": entry("light.x", "d2", "x", "other"),
      },
      { d1: { id: "d1", name: "Bastu" } },
    );
    expect(findDevicesForPlatform(hass, "harvia_sauna")).toEqual([
      { integration: "harvia_sauna", deviceId: "d1", name: "Bastu" },
    ]);
    expect(resolveEntities(hass, "d1", "harvia_sauna", CATALOG)).toEqual({
      power: "switch.power_xyz",
      current: "sensor.temp_xyz",
    });
  });

  it("omits a catalog entry whose entity the device doesn't expose", () => {
    const hass = makeHass(
      { "switch.p": entry("switch.power_xyz", "d1", "power") },
      { d1: { id: "d1", name: "Bastu" } },
    );
    expect(resolveEntities(hass, "d1", "harvia_sauna", CATALOG)).toEqual({
      power: "switch.power_xyz",
    });
  });

  it("caches per hass.entities object identity (stable ref ⇒ no re-scan)", () => {
    const entities: Record<string, ReturnType<typeof entry>> = {
      "switch.p": entry("switch.power_xyz", "d1", "power"),
    };
    const hass = makeHass(entities, { d1: { id: "d1", name: "Bastu" } });
    expect(resolveEntities(hass, "d1", "harvia_sauna", CATALOG)).toEqual({
      power: "switch.power_xyz",
    });
    // Mutate the SAME entities object after it's been indexed. Because the cache
    // keys on the object identity (the ref HA reuses between state ticks), the
    // mutation is intentionally not observed — proving the scan was cached.
    entities["sensor.c"] = entry(
      "sensor.temp_xyz",
      "d1",
      "current_temperature",
    );
    expect(resolveEntities(hass, "d1", "harvia_sauna", CATALOG)).toEqual({
      power: "switch.power_xyz",
    });
  });

  it("invalidates when hass.entities is a new object (registry changed)", () => {
    const devices = { d1: { id: "d1", name: "Bastu" } };
    const v1 = makeHass(
      { "switch.p": entry("switch.power_xyz", "d1", "power") },
      devices,
    );
    resolveEntities(v1, "d1", "harvia_sauna", CATALOG);
    // A real registry change hands us a brand-new entities object.
    const v2 = makeHass(
      {
        "switch.p": entry("switch.power_xyz", "d1", "power"),
        "sensor.c": entry("sensor.temp_xyz", "d1", "current_temperature"),
      },
      devices,
    );
    expect(resolveEntities(v2, "d1", "harvia_sauna", CATALOG)).toEqual({
      power: "switch.power_xyz",
      current: "sensor.temp_xyz",
    });
  });

  it("reads device names live, so a rename shows without re-indexing", () => {
    const entities = { "switch.p": entry("switch.power_xyz", "d1", "power") };
    const v1 = makeHass(entities, { d1: { id: "d1", name: "Bastu" } });
    expect(findDevicesForPlatform(v1, "harvia_sauna")[0].name).toBe("Bastu");
    // Same entities ref (cached index), but the device registry changed the name.
    const v2 = makeHass(entities, {
      d1: { id: "d1", name: "Bastu", name_by_user: "Sauna" },
    });
    expect(findDevicesForPlatform(v2, "harvia_sauna")[0].name).toBe("Sauna");
  });
});
