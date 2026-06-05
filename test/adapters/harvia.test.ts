import { describe, it, expect } from "vitest";
import type { Hass, HassEntityState, HassRegistryEntry } from "../../src/types";
import { harviaAdapter, HARVIA_PLATFORM } from "../../src/adapters/harvia";
import {
  findDevicesForPlatform,
  resolveEntities,
} from "../../src/utils/autodetect";
import {
  getAdapter,
  pickIntegration,
  detectAllDevices,
  getAllAdapterIds,
} from "../../src/adapter-registry";

const DEVICE = "harvia_dev_1";

// Localized (Swedish) entity_ids + translation_keys, as the live integration
// produces them. Note switch.power and sensor.power share translation_key.
const REG: Record<string, [string, string]> = {
  "climate.bastu_termostat": ["harvia_sauna", "thermostat"],
  "sensor.bastu_temperatur": ["harvia_sauna", "current_temperature"],
  "sensor.bastu_maltemperatur": ["harvia_sauna", "target_temperature"],
  "sensor.bastu_luftfuktighet": ["harvia_sauna", "humidity"],
  "sensor.bastu_temperaturtrend": ["harvia_sauna", "temp_trend"],
  "sensor.bastu_uppvarmningstid": ["harvia_sauna", "heat_up_time"],
  "sensor.bastu_effekt": ["harvia_sauna", "power"],
  "switch.bastu_strom": ["harvia_sauna", "power"],
  "switch.bastu_belysning": ["harvia_sauna", "light"],
  "switch.bastu_anggenerator": ["harvia_sauna", "steamer"],
  "binary_sensor.bastu_uppvarmning_aktiv": ["harvia_sauna", "heat_on"],
  "binary_sensor.bastu_anga_aktiv": ["harvia_sauna", "steam_on"],
  "binary_sensor.bastu_dorr": ["harvia_sauna", "door"],
  // foreign entity from another integration — must be ignored
  "sensor.vader_temp": ["met", "temperature"],
};

function makeHass(states: Record<string, string> = {}): Hass {
  const entities: Record<string, HassRegistryEntry> = {};
  const st: Record<string, HassEntityState> = {};
  for (const [entity_id, [platform, translation_key]] of Object.entries(REG)) {
    entities[entity_id] = {
      entity_id,
      platform,
      translation_key,
      device_id: platform === "harvia_sauna" ? DEVICE : "other_dev",
    };
  }
  const defaults: Record<string, string> = {
    "climate.bastu_termostat": "heat",
    "sensor.bastu_temperatur": "82",
    "sensor.bastu_maltemperatur": "90",
    "sensor.bastu_luftfuktighet": "12",
    "sensor.bastu_temperaturtrend": "1",
    "sensor.bastu_effekt": "6000",
    "switch.bastu_strom": "on",
    "switch.bastu_belysning": "on",
    "switch.bastu_anggenerator": "off",
    "binary_sensor.bastu_uppvarmning_aktiv": "on",
    "binary_sensor.bastu_anga_aktiv": "off",
    "binary_sensor.bastu_dorr": "off",
    "sensor.vader_temp": "5",
  };
  for (const [id, state] of Object.entries({ ...defaults, ...states })) {
    st[id] = { entity_id: id, state, attributes: {} };
  }
  return {
    states: st,
    entities,
    devices: { [DEVICE]: { id: DEVICE, name: "Bastu", model: "CX110 Xenio" } },
  };
}

describe("autodetect", () => {
  it("finds the harvia device and ignores other platforms", () => {
    const devices = findDevicesForPlatform(makeHass(), HARVIA_PLATFORM);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ deviceId: DEVICE, name: "Bastu" });
  });

  it("resolves entities by (domain, translation_key), not by slug", () => {
    const e = resolveEntities(makeHass(), DEVICE, HARVIA_PLATFORM, {
      power: { domain: "switch", translationKey: "power" },
      powerSensor: { domain: "sensor", translationKey: "power" },
    });
    // shared translation_key 'power' must split by domain
    expect(e.power).toBe("switch.bastu_strom");
    expect(e.powerSensor).toBe("sensor.bastu_effekt");
  });
});

describe("adapter registry", () => {
  it("is keyed by integration and resolves the harvia adapter", () => {
    expect(getAllAdapterIds()).toContain(HARVIA_PLATFORM);
    expect(getAdapter(HARVIA_PLATFORM)).toBe(harviaAdapter);
  });

  it("auto-picks the harvia integration when a device is present", () => {
    expect(pickIntegration(makeHass())?.id).toBe(HARVIA_PLATFORM);
    expect(detectAllDevices(makeHass())).toHaveLength(1);
  });

  it("returns no integration when nothing is installed", () => {
    const empty: Hass = { states: {}, entities: {}, devices: {} };
    expect(pickIntegration(empty)).toBeUndefined();
  });
});

describe("harvia adapter readState", () => {
  it("normalizes a heating state", () => {
    const s = harviaAdapter.readState(makeHass(), {
      type: "custom:sauna-card",
    });
    expect(s).not.toBeNull();
    expect(s).toMatchObject({
      integration: HARVIA_PLATFORM,
      deviceId: DEVICE,
      model: "xenio",
      status: "heating",
      currentTemp: 82,
      targetTemp: 90,
      humidity: 12,
      power: 6000,
      doorOpen: false,
      heatingActive: true,
      steamActive: false,
    });
    expect(s!.entities.thermostat).toBe("climate.bastu_termostat");
  });

  it("prefers the native heat_up_time sensor for the ready ETA", () => {
    // heat_up_time present (12 min) wins over the trend-derived 8 min.
    const s = harviaAdapter.readState(
      makeHass({ "sensor.bastu_uppvarmningstid": "12" }),
      { type: "custom:sauna-card" },
    );
    expect(s!.readyEtaMinutes).toBe(12);
  });

  it("normalizes auxiliary switch states by logical key", () => {
    const s = harviaAdapter.readState(makeHass(), {
      type: "custom:sauna-card",
    });
    // power=on, light=on, steamer=off are in the fixture; the rest are absent.
    expect(s!.switches).toEqual({ power: true, light: true, steamer: false });
    // Fields with no entity in the fixture stay undefined (item then hides).
    expect(s!.targetHumidity).toBeUndefined();
    expect(s!.lastSessionMaxTemp).toBeUndefined();
  });

  it("derives 'ready' when at target and not heating", () => {
    const s = harviaAdapter.readState(
      makeHass({
        "binary_sensor.bastu_uppvarmning_aktiv": "off",
        "sensor.bastu_temperatur": "90",
      }),
      { type: "custom:sauna-card" },
    );
    expect(s!.status).toBe("ready");
  });

  it("derives 'idle' when on, not heating, below target", () => {
    const s = harviaAdapter.readState(
      makeHass({
        "binary_sensor.bastu_uppvarmning_aktiv": "off",
        "sensor.bastu_temperatur": "40",
      }),
      { type: "custom:sauna-card" },
    );
    expect(s!.status).toBe("idle");
  });

  it("derives 'off' when power is off", () => {
    const s = harviaAdapter.readState(
      makeHass({ "switch.bastu_strom": "off" }),
      {
        type: "custom:sauna-card",
      },
    );
    expect(s!.status).toBe("off");
  });

  it("returns null when no harvia device is present", () => {
    const empty: Hass = { states: {}, entities: {}, devices: {} };
    expect(
      harviaAdapter.readState(empty, { type: "custom:sauna-card" }),
    ).toBeNull();
  });

  it("derives ready ETA from the temperature trend while heating", () => {
    // current 82, target 90, trend 1 °C/min → ceil(8/1) = 8
    const s = harviaAdapter.readState(makeHass(), {
      type: "custom:sauna-card",
    });
    expect(s!.readyEtaMinutes).toBe(8);
  });

  it("has no ready ETA when not heating or trend is non-positive", () => {
    const notHeating = harviaAdapter.readState(
      makeHass({ "binary_sensor.bastu_uppvarmning_aktiv": "off" }),
      { type: "custom:sauna-card" },
    );
    expect(notHeating!.readyEtaMinutes).toBeUndefined();

    const flatTrend = harviaAdapter.readState(
      makeHass({ "sensor.bastu_temperaturtrend": "0" }),
      { type: "custom:sauna-card" },
    );
    expect(flatTrend!.readyEtaMinutes).toBeUndefined();
  });

  it("ignores unavailable numeric states", () => {
    const s = harviaAdapter.readState(
      makeHass({ "sensor.bastu_luftfuktighet": "unavailable" }),
      { type: "custom:sauna-card" },
    );
    expect(s!.humidity).toBeUndefined();
  });
});
