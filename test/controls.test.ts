import { describe, it, expect, vi } from "vitest";
import type { Hass, SaunaState } from "../src/types";
import {
  toggleSwitch,
  setTargetTemperature,
  stepTargetTemperature,
  setSession,
  setActive,
} from "../src/controls";

function mockHass() {
  const calls: Array<[string, string, Record<string, unknown>]> = [];
  const hass = {
    states: {},
    callService: vi.fn(
      (d: string, s: string, data: Record<string, unknown>) => {
        calls.push([d, s, data]);
        return Promise.resolve();
      },
    ),
  } as unknown as Hass;
  return { hass, calls };
}

const state: SaunaState = {
  integration: "harvia_sauna",
  deviceId: "dev1",
  available: true,
  status: "heating",
  currentTemp: 60,
  targetTemp: 80,
  entities: {
    thermostat: "climate.bastu_termostat",
    power: "switch.bastu_strom",
  },
};

describe("controls", () => {
  it("toggles an on/off entity via the domain-agnostic service", () => {
    const { hass, calls } = mockHass();
    toggleSwitch(hass, "light.diy_sauna_light");
    expect(calls).toEqual([
      ["homeassistant", "toggle", { entity_id: "light.diy_sauna_light" }],
    ]);
  });

  it("sets target temperature on the thermostat, clamped", () => {
    const { hass, calls } = mockHass();
    setTargetTemperature(hass, state, 200);
    expect(calls[0]).toEqual([
      "climate",
      "set_temperature",
      { entity_id: "climate.bastu_termostat", temperature: 110 },
    ]);
  });

  it("does nothing for set temperature without a thermostat", () => {
    const { hass, calls } = mockHass();
    setTargetTemperature(hass, { ...state, entities: {} }, 80);
    expect(calls).toHaveLength(0);
  });

  it("steps the target temperature from the current target", () => {
    const { hass, calls } = mockHass();
    stepTargetTemperature(hass, state, 5);
    expect(calls[0][2]).toMatchObject({ temperature: 85 });
  });

  it("set_session targets the device id with optional fields", () => {
    const { hass, calls } = mockHass();
    setSession(hass, state, { target_temp: 90, duration: 60, active: true });
    expect(calls[0]).toEqual([
      "harvia_sauna",
      "set_session",
      { device_id: "dev1", target_temp: 90, duration: 60, active: true },
    ]);
  });

  it("set_session clamps an out-of-range target_temp", () => {
    const { hass, calls } = mockHass();
    setSession(hass, state, { target_temp: 200 });
    expect(calls[0][2]).toEqual({ device_id: "dev1", target_temp: 110 });
  });

  it("setActive(true) sends the current target; setActive(false) just stops", () => {
    const { hass, calls } = mockHass();
    setActive(hass, state, true);
    expect(calls[0][2]).toEqual({
      device_id: "dev1",
      active: true,
      target_temp: 80,
    });
    setActive(hass, state, false);
    expect(calls[1][2]).toEqual({ device_id: "dev1", active: false });
  });

  it("setActive on a manual sauna switches the mapped power entity, not set_session", () => {
    const { hass, calls } = mockHass();
    const manual: SaunaState = {
      ...state,
      integration: "manual",
      deviceId: "manual",
      entities: { power: "switch.diy_sauna_power" },
    };
    setActive(hass, manual, true);
    expect(calls[0]).toEqual([
      "homeassistant",
      "turn_on",
      { entity_id: "switch.diy_sauna_power" },
    ]);
    setActive(hass, manual, false);
    expect(calls[1]).toEqual([
      "homeassistant",
      "turn_off",
      { entity_id: "switch.diy_sauna_power" },
    ]);
  });

  it("setActive on a manual climate-only sauna switches the thermostat on/off", () => {
    const { hass, calls } = mockHass();
    const manual: SaunaState = {
      ...state,
      integration: "manual",
      deviceId: "manual",
      entities: { thermostat: "climate.diy_sauna" },
    };
    setActive(hass, manual, true);
    expect(calls[0]).toEqual([
      "climate",
      "turn_on",
      { entity_id: "climate.diy_sauna" },
    ]);
    setActive(hass, manual, false);
    expect(calls[1]).toEqual([
      "climate",
      "turn_off",
      { entity_id: "climate.diy_sauna" },
    ]);
  });

  it("setActive on a manual sauna with neither power nor thermostat does nothing", () => {
    const { hass, calls } = mockHass();
    const manual: SaunaState = {
      ...state,
      integration: "manual",
      deviceId: "manual",
      entities: {},
    };
    setActive(hass, manual, true);
    expect(calls).toHaveLength(0);
  });
});
