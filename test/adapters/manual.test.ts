import { describe, it, expect, vi, afterEach } from "vitest";
import type { Hass, HassEntityState, SaunaCardConfig } from "../../src/types";
import {
  manualAdapter,
  MANUAL_ID,
  MANUAL_ENTITY_CATALOG,
} from "../../src/adapters/manual";
import { HARVIA_ENTITIES } from "../../src/adapters/harvia";
import { pickIntegration, detectAllDevices } from "../../src/adapter-registry";

/** Build a hass from entity_id → state[/attributes] entries. */
function makeHass(
  states: Record<
    string,
    { state: string; attributes?: Record<string, unknown> }
  >,
): Hass {
  const st: Record<string, HassEntityState> = {};
  for (const [id, v] of Object.entries(states)) {
    st[id] = { entity_id: id, state: v.state, attributes: v.attributes ?? {} };
  }
  return { states: st, entities: {}, devices: {} };
}

const cfg = (entity_map: Record<string, string>): SaunaCardConfig => ({
  type: "custom:sauna-card",
  integration: MANUAL_ID,
  entity_map,
});

describe("manual adapter selection", () => {
  it("is chosen explicitly past the detect gate (no device needed)", () => {
    const hass = makeHass({ "climate.diy": { state: "heat" } });
    expect(pickIntegration(hass, MANUAL_ID)?.id).toBe(MANUAL_ID);
  });

  it("is never auto-detected and never appears as a suggested device", () => {
    const hass = makeHass({ "climate.diy": { state: "heat" } });
    // No explicit integration → manual is not picked (and no Harvia present).
    expect(pickIntegration(hass)).toBeUndefined();
    expect(detectAllDevices(hass)).toHaveLength(0);
  });
});

describe("manual adapter readState", () => {
  it("returns null when nothing is mapped", () => {
    const hass = makeHass({ "climate.diy": { state: "heat" } });
    expect(manualAdapter.readState(hass, cfg({}))).toBeNull();
  });

  it("prunes mappings whose entity is missing (all gone → null)", () => {
    const hass = makeHass({ "climate.diy": { state: "heat" } });
    expect(
      manualAdapter.readState(hass, cfg({ thermostat: "climate.ghost" })),
    ).toBeNull();
  });

  it("anchors temps and status on the climate entity's attributes", () => {
    const hass = makeHass({
      "climate.diy": {
        state: "heat",
        attributes: {
          current_temperature: 71,
          temperature: 90,
          hvac_action: "heating",
        },
      },
    });
    const s = manualAdapter.readState(hass, cfg({ thermostat: "climate.diy" }));
    expect(s).not.toBeNull();
    expect(s).toMatchObject({
      integration: MANUAL_ID,
      status: "heating",
      currentTemp: 71,
      targetTemp: 90,
      heatingActive: true,
    });
    expect(s!.entities.thermostat).toBe("climate.diy");
  });

  it("derives 'ready' when at target and the climate isn't actively heating", () => {
    const hass = makeHass({
      "climate.diy": {
        state: "heat",
        attributes: {
          current_temperature: 90,
          temperature: 90,
          hvac_action: "idle",
        },
      },
    });
    const s = manualAdapter.readState(hass, cfg({ thermostat: "climate.diy" }));
    expect(s!.status).toBe("ready");
  });

  it("derives 'off' from the climate mode when no power switch is mapped", () => {
    const hass = makeHass({
      "climate.diy": { state: "off", attributes: { current_temperature: 22 } },
    });
    const s = manualAdapter.readState(hass, cfg({ thermostat: "climate.diy" }));
    expect(s!.status).toBe("off");
  });

  it("lets a dedicated power switch override climate-derived power", () => {
    const hass = makeHass({
      "climate.diy": { state: "heat", attributes: { hvac_action: "idle" } },
      "switch.diy_power": { state: "off" },
    });
    const s = manualAdapter.readState(
      hass,
      cfg({ thermostat: "climate.diy", power: "switch.diy_power" }),
    );
    expect(s!.status).toBe("off");
  });

  it("lets a dedicated temperature sensor override the climate attribute", () => {
    const hass = makeHass({
      "climate.diy": {
        state: "heat",
        attributes: { current_temperature: 50, temperature: 90 },
      },
      "sensor.diy_temp": { state: "63" },
    });
    const s = manualAdapter.readState(
      hass,
      cfg({ thermostat: "climate.diy", currentTemperature: "sensor.diy_temp" }),
    );
    expect(s!.currentTemp).toBe(63);
  });

  it("maps switches and shows them, hiding unmapped types", () => {
    const hass = makeHass({
      "climate.diy": { state: "heat", attributes: { current_temperature: 60 } },
      "switch.diy_light": { state: "on" },
      "switch.diy_fan": { state: "off" },
    });
    const s = manualAdapter.readState(
      hass,
      cfg({
        thermostat: "climate.diy",
        light: "switch.diy_light",
        fan: "switch.diy_fan",
      }),
    );
    expect(s!.switches).toEqual({ light: true, fan: false });
    expect(s!.entities.light).toBe("switch.diy_light");
    // Unmapped types stay undefined so their items/chips hide.
    expect(s!.humidity).toBeUndefined();
    expect(s!.entities.steamer).toBeUndefined();
  });

  it("reads a humidity sensor and a door binary_sensor", () => {
    const hass = makeHass({
      "sensor.diy_rh": { state: "18" },
      "binary_sensor.diy_door": { state: "on" },
    });
    const s = manualAdapter.readState(
      hass,
      cfg({ humidity: "sensor.diy_rh", door: "binary_sensor.diy_door" }),
    );
    expect(s!.humidity).toBe(18);
    expect(s!.doorOpen).toBe(true);
  });
});

describe("manual adapter debug diagnostics", () => {
  afterEach(() => vi.restoreAllMocks());

  const dbg = (entity_map: Record<string, string>): SaunaCardConfig => ({
    ...cfg(entity_map),
    debug: true,
  });

  /** All console.debug args joined into one searchable string per call. */
  function debugLines(spy: ReturnType<typeof vi.spyOn>): string[] {
    return spy.mock.calls.map((c) => c.map(String).join(" "));
  }

  it("flags a mapped entity whose state is not numeric (e.g. a pollen sensor as temp)", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const hass = makeHass({ "sensor.pollen_al": { state: "Låg" } });
    const s = manualAdapter.readState(
      hass,
      dbg({ currentTemperature: "sensor.pollen_al" }),
    );
    expect(s!.currentTemp).toBeUndefined();
    expect(
      debugLines(spy).some(
        (l) =>
          l.includes("currentTemperature") &&
          l.includes("sensor.pollen_al") &&
          l.includes("Låg") &&
          l.includes("not numeric"),
      ),
    ).toBe(true);
  });

  it("is silent when debug is off", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const hass = makeHass({ "sensor.pollen_al": { state: "Låg" } });
    manualAdapter.readState(
      hass,
      cfg({ currentTemperature: "sensor.pollen_al" }),
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("flags a mapped entity_id that does not exist in Home Assistant", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const hass = makeHass({ "climate.diy": { state: "heat" } });
    manualAdapter.readState(
      hass,
      dbg({ thermostat: "climate.diy", currentTemperature: "sensor.ghost" }),
    );
    expect(
      debugLines(spy).some(
        (l) =>
          l.includes("sensor.ghost") &&
          l.includes("not found in Home Assistant"),
      ),
    ).toBe(true);
  });
});

describe("manual entity catalog", () => {
  it("only offers keys the state builder understands (matches HARVIA_ENTITIES)", () => {
    const valid = new Set(Object.keys(HARVIA_ENTITIES));
    for (const spec of MANUAL_ENTITY_CATALOG) {
      expect(valid.has(spec.key)).toBe(true);
      const domain = HARVIA_ENTITIES[spec.key].domain;
      // The picker is filtered to the type's own domain — except interactive
      // switch-domain toggles, which accept the broader on/off domains.
      if (domain === "switch") {
        expect(spec.domains).toContain("switch");
        expect(spec.domains).toContain("input_boolean");
      } else {
        expect(spec.domains).toEqual([domain]);
      }
    }
  });

  it("has no duplicate keys", () => {
    const keys = MANUAL_ENTITY_CATALOG.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
