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

  // The HACS (before HA 2026.11) or Marketplace (HA 2026.11+) update entity for
  // the Harvia integration shows up under "harvia" in the picker but lives on
  // platform `hacs`/`marketplace`; its device is the repo, not the sauna. We tie
  // it to the integration by the brand icon (keyed by domain) and resolve the
  // actual sauna device by autodetect.
  function hassWithRepoUpdate(opts: {
    platform: string;
    picture?: string;
    sauna?: { entity_id: string; device_id: string };
  }): Hass {
    const reg: Hass["entities"] = {
      "update.harvia_sauna_update": {
        entity_id: "update.harvia_sauna_update",
        platform: opts.platform,
        device_id: "repo_dev",
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

  const SAUNA = { entity_id: "climate.bastu_termostat", device_id: "dev1" };
  // Brand icon URL forms: brands CDN (HACS) and local brands API (Marketplace).
  const pictures = {
    cdn: (d: string) => `https://brands.home-assistant.io/_/${d}/icon.png`,
    api: (d: string) => `/api/brands/integration/${d}/icon.png`,
  };

  describe.each(["hacs", "marketplace"])(
    "repo update entity on platform %s",
    (platform) => {
      describe.each(Object.entries(pictures))(
        "with %s brand icon",
        (_form, pic) => {
          it("suggests the card, resolving the sauna device", () => {
            const hass = hassWithRepoUpdate({
              platform,
              picture: pic("harvia_sauna"),
              sauna: SAUNA,
            });
            expect(suggestEntity(hass, "update.harvia_sauna_update")).toEqual({
              config: { type: "custom:sauna-card", device_id: "dev1" },
            });
          });

          it("does not suggest when no sauna device exists", () => {
            const hass = hassWithRepoUpdate({
              platform,
              picture: pic("harvia_sauna"),
            });
            expect(
              suggestEntity(hass, "update.harvia_sauna_update"),
            ).toBeNull();
          });

          it("does not suggest for another integration's repo", () => {
            const hass = hassWithRepoUpdate({
              platform,
              picture: pic("some_other"),
              sauna: SAUNA,
            });
            expect(
              suggestEntity(hass, "update.harvia_sauna_update"),
            ).toBeNull();
          });
        },
      );

      it("does not suggest with no brand icon", () => {
        // No entity_picture → can't tie it to an integration domain → no suggestion.
        const hass = hassWithRepoUpdate({ platform, sauna: SAUNA });
        expect(suggestEntity(hass, "update.harvia_sauna_update")).toBeNull();
      });
    },
  );

  it("does not suggest for an update entity on an unrelated platform", () => {
    const hass = hassWithRepoUpdate({
      platform: "some_other",
      picture: pictures.api("harvia_sauna"),
      sauna: SAUNA,
    });
    expect(suggestEntity(hass, "update.harvia_sauna_update")).toBeNull();
  });

  it("does not treat a non-brands path as a brand icon", () => {
    const hass = hassWithRepoUpdate({
      platform: "marketplace",
      picture: "/local/harvia_sauna/icon.png",
      sauna: SAUNA,
    });
    expect(suggestEntity(hass, "update.harvia_sauna_update")).toBeNull();
  });
});
