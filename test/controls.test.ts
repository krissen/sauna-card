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
  it("toggles a switch entity", () => {
    const { hass, calls } = mockHass();
    toggleSwitch(hass, "switch.bastu_belysning");
    expect(calls).toEqual([
      ["switch", "toggle", { entity_id: "switch.bastu_belysning" }],
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
});
