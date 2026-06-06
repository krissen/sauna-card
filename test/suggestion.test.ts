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

  it("suggests the card for any Harvia entity (sensor), pre-filling the device", () => {
    const hass = hassWith({
      "sensor.bastu_temperatur": {
        platform: "harvia_sauna",
        device_id: "dev1",
      },
    });
    expect(suggestEntity(hass, "sensor.bastu_temperatur")).toEqual({
      config: { type: "custom:sauna-card", device_id: "dev1" },
    });
  });

  it("suggests the card for a Harvia binary_sensor (door)", () => {
    const hass = hassWith({
      "binary_sensor.bastu_dorr": {
        platform: "harvia_sauna",
        device_id: "dev1",
      },
    });
    expect(suggestEntity(hass, "binary_sensor.bastu_dorr")).toEqual({
      config: { type: "custom:sauna-card", device_id: "dev1" },
    });
  });

  it("suggests the card for a Harvia update entity", () => {
    const hass = hassWith({
      "update.bastu_firmware": {
        platform: "harvia_sauna",
        device_id: "dev1",
      },
    });
    expect(suggestEntity(hass, "update.bastu_firmware")).toEqual({
      config: { type: "custom:sauna-card", device_id: "dev1" },
    });
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

  // HACS's update entity for the Harvia integration shows up under "harvia" in
  // the picker but lives on platform `hacs`; its device is the repo, not the
  // sauna. We tie it to the integration by the brands icon (keyed by domain)
  // and resolve the actual sauna device by autodetect.
  function hassWithHacsUpdate(opts: {
    picture?: string;
    sauna?: { entity_id: string; device_id: string };
  }): Hass {
    const reg: Hass["entities"] = {
      "update.harvia_sauna_update": {
        entity_id: "update.harvia_sauna_update",
        platform: "hacs",
        device_id: "hacs_repo_dev",
      },
    };
    if (opts.sauna) {
      reg[opts.sauna.entity_id] = {
        entity_id: opts.sauna.entity_id,
        platform: "harvia_sauna",
        device_id: opts.sauna.device_id,
      };
    }
    return {
      states: {
        "update.harvia_sauna_update": {
          entity_id: "update.harvia_sauna_update",
          state: "off",
          attributes: opts.picture ? { entity_picture: opts.picture } : {},
        },
      },
      entities: reg,
    } as Hass;
  }

  it("suggests the card for the Harvia HACS update entity, resolving the sauna device", () => {
    const hass = hassWithHacsUpdate({
      picture: "https://brands.home-assistant.io/_/harvia_sauna/icon.png",
      sauna: { entity_id: "climate.bastu_termostat", device_id: "dev1" },
    });
    expect(suggestEntity(hass, "update.harvia_sauna_update")).toEqual({
      config: { type: "custom:sauna-card", device_id: "dev1" },
    });
  });

  it("does not suggest for the Harvia HACS update entity when no sauna device exists", () => {
    const hass = hassWithHacsUpdate({
      picture: "https://brands.home-assistant.io/_/harvia_sauna/icon.png",
    });
    expect(suggestEntity(hass, "update.harvia_sauna_update")).toBeNull();
  });

  it("does not suggest for a HACS update entity of another integration", () => {
    const hass = hassWithHacsUpdate({
      picture: "https://brands.home-assistant.io/_/some_other/icon.png",
      sauna: { entity_id: "climate.bastu_termostat", device_id: "dev1" },
    });
    expect(suggestEntity(hass, "update.harvia_sauna_update")).toBeNull();
  });
});
