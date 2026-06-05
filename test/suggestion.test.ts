import { describe, it, expect } from "vitest";
import type { Hass } from "../src/types";
import { suggestEntity } from "../src/suggestion";

function hassWith(
  entities: Record<string, { platform?: string; device_id?: string }>,
): Hass {
  const reg: Hass["entities"] = {};
  for (const [entity_id, e] of Object.entries(entities)) {
    reg[entity_id] = { entity_id, ...e };
  }
  return { states: {}, entities: reg } as Hass;
}

describe("getEntitySuggestion", () => {
  it("suggests the card for a Harvia climate entity, pre-filling the device", () => {
    const hass = hassWith({
      "climate.bastu_termostat": {
        platform: "harvia_sauna",
        device_id: "dev1",
      },
    });
    expect(suggestEntity(hass, "climate.bastu_termostat")).toEqual({
      config: { type: "custom:sauna-card", device_id: "dev1" },
    });
  });

  it("returns null for a non-climate Harvia entity", () => {
    const hass = hassWith({
      "sensor.bastu_temperatur": {
        platform: "harvia_sauna",
        device_id: "dev1",
      },
    });
    expect(suggestEntity(hass, "sensor.bastu_temperatur")).toBeNull();
  });

  it("returns null for a climate entity from another integration", () => {
    const hass = hassWith({
      "climate.living_room": { platform: "generic_thermostat" },
    });
    expect(suggestEntity(hass, "climate.living_room")).toBeNull();
  });

  it("returns null for an unknown entity", () => {
    expect(suggestEntity(hassWith({}), "climate.nope")).toBeNull();
  });

  it("omits device_id when the entity has no device", () => {
    const hass = hassWith({
      "climate.bastu_termostat": { platform: "harvia_sauna" },
    });
    expect(suggestEntity(hass, "climate.bastu_termostat")).toEqual({
      config: { type: "custom:sauna-card" },
    });
  });
});
