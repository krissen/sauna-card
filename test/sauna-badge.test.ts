import { describe, it, expect, vi } from "vitest";
import { nothing } from "lit";
import { SaunaBadge } from "../src/sauna-badge";
import { SESSION_STOPPED_EVENT } from "../src/running-latch";
import type {
  Hass,
  HassEntityState,
  HassRegistryEntry,
  SaunaBadgeConfig,
} from "../src/types";

const DEVICE = "harvia_dev_1";

// Same live-shaped registry the adapter tests use: localized entity_ids with
// (platform, translation_key) pairs. Resolution is by (domain, translation_key).
const REG: Record<string, [string, string]> = {
  "climate.bastu_termostat": ["harvia_sauna", "thermostat"],
  "sensor.bastu_temperatur": ["harvia_sauna", "current_temperature"],
  "sensor.bastu_maltemperatur": ["harvia_sauna", "target_temperature"],
  "sensor.bastu_luftfuktighet": ["harvia_sauna", "humidity"],
  "sensor.bastu_temperaturtrend": ["harvia_sauna", "temp_trend"],
  "sensor.bastu_effekt": ["harvia_sauna", "power"],
  "switch.bastu_strom": ["harvia_sauna", "power"],
  "binary_sensor.bastu_uppvarmning_aktiv": ["harvia_sauna", "heat_on"],
  "binary_sensor.bastu_dorr": ["harvia_sauna", "door"],
};

function makeHass(overrides: Record<string, string> = {}): Hass {
  const entities: Record<string, HassRegistryEntry> = {};
  const st: Record<string, HassEntityState> = {};
  for (const [entity_id, [platform, translation_key]] of Object.entries(REG)) {
    entities[entity_id] = {
      entity_id,
      platform,
      translation_key,
      device_id: DEVICE,
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
    "binary_sensor.bastu_uppvarmning_aktiv": "on",
    "binary_sensor.bastu_dorr": "off",
  };
  for (const [id, state] of Object.entries({ ...defaults, ...overrides })) {
    st[id] = { entity_id: id, state, attributes: {} };
  }
  return {
    states: st,
    entities,
    devices: { [DEVICE]: { id: DEVICE, name: "Bastu", model: "CX110 Xenio" } },
  };
}

function badge(
  config: Partial<SaunaBadgeConfig> = {},
  hass = makeHass(),
): SaunaBadge {
  const el = new SaunaBadge();
  el.setConfig({ type: "custom:sauna-badge", ...config });
  el.hass = hass;
  return el;
}

describe("sauna-badge", () => {
  it("registers the custom element", () => {
    expect(customElements.get("sauna-badge")).toBe(SaunaBadge);
  });

  it("provides an empty stub config (HA supplies the type)", () => {
    expect(SaunaBadge.getStubConfig()).toEqual({});
  });

  it("returns its editor from getConfigElement", () => {
    const el = SaunaBadge.getConfigElement();
    expect(el.tagName.toLowerCase()).toBe("sauna-badge-editor");
  });

  it("rejects non-object configs and wrong-typed fields", () => {
    const el = new SaunaBadge();
    expect(() => el.setConfig(null)).toThrow();
    expect(() => el.setConfig([])).toThrow();
    expect(() =>
      el.setConfig({ type: "custom:sauna-badge", content: "bogus" }),
    ).toThrow();
    expect(() =>
      el.setConfig({ type: "custom:sauna-badge", visual: "bogus" }),
    ).toThrow();
    expect(() =>
      el.setConfig({ type: "custom:sauna-badge", scale: 0 }),
    ).toThrow();
    expect(() =>
      el.setConfig({ type: "custom:sauna-badge", items: "x" }),
    ).toThrow();
    expect(() =>
      el.setConfig({ type: "custom:sauna-badge", show_label: "yes" }),
    ).toThrow();
  });

  it("accepts the full set of valid options", () => {
    const el = new SaunaBadge();
    expect(() =>
      el.setConfig({
        type: "custom:sauna-badge",
        content: "row",
        visual: "ring_value",
        items: ["status", "current_temp", "humidity"],
        show_label: true,
        label_position: "below",
        scale: 1.5,
        language: "sv",
      }),
    ).not.toThrow();
  });

  it("renders nothing without hass", () => {
    const el = new SaunaBadge();
    el.setConfig({ type: "custom:sauna-badge" });
    expect(el.render()).toBe(nothing);
  });

  it("renders nothing when no device is found", () => {
    const el = new SaunaBadge();
    el.setConfig({ type: "custom:sauna-badge" });
    el.hass = { states: {}, entities: {}, devices: {} } as Hass;
    expect(el.render()).toBe(nothing);
  });

  it("renders a badge for a resolved device (default content)", () => {
    const out = badge().render();
    expect(out).not.toBe(nothing);
    expect(out).toBeTruthy();
  });

  it("renders every visual without throwing", () => {
    for (const visual of [
      "chip",
      "icon",
      "value",
      "ring_value",
      "ring_icon",
      "ring",
    ] as const) {
      const out = badge({ visual }).render();
      expect(out).not.toBe(nothing);
    }
  });

  it("renders every content mode without throwing", () => {
    for (const content of ["primary", "single", "row"] as const) {
      const out = badge({ content }).render();
      expect(out).not.toBe(nothing);
    }
  });

  it("ignores prototype-named item keys without crashing", () => {
    // A user-authored YAML could pass "toString"/"__proto__"; these are object
    // prototype props but not real items and must not reach def.icon.
    expect(() =>
      badge({ content: "single", single_item: "toString" }).render(),
    ).not.toThrow();
    expect(() =>
      badge({ content: "row", items: ["__proto__", "current_temp"] }).render(),
    ).not.toThrow();
  });

  it("falls back to status in row mode when chosen items have no value", () => {
    // Only ask for sensors absent from this hass; should not render an empty pill.
    const out = badge({
      content: "row",
      items: ["energy", "sessions"],
    }).render();
    expect(out).not.toBe(nothing);
  });
});

describe("sauna-badge hold-phase latch", () => {
  // The badge derives on/off via the same buildSaunaState as the card, so it
  // flickers identically during an app-started hold phase. Same latch, mounted
  // so willUpdate (which advances it) actually fires.
  // A PID pulse (heat on, drawing) vs a gap (heat off, 0 W) while at target,
  // with the switch and climate off (app-started).
  const hold = (heat: boolean): Hass =>
    makeHass({
      "climate.bastu_termostat": "off",
      "switch.bastu_strom": "off",
      "binary_sensor.bastu_uppvarmning_aktiv": heat ? "on" : "off",
      "sensor.bastu_effekt": heat ? "6000" : "0",
      "sensor.bastu_temperatur": "90",
      "sensor.bastu_maltemperatur": "90",
    });

  const powerOn = (b: SaunaBadge) =>
    (b as unknown as { _state(): { powerOn?: boolean } })._state().powerOn;

  it("stays on through a quiet PID gap at target", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const b = new SaunaBadge();
      b.setConfig({ type: "custom:sauna-badge" });
      document.body.appendChild(b);
      b.hass = hold(true); // pulse arms the latch
      await b.updateComplete;

      vi.advanceTimersByTime(60_000);
      b.hass = hold(false); // gap: every raw signal quiet
      await b.updateComplete;
      expect(powerOn(b)).toBe(true);

      document.body.removeChild(b);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns to off once the gap outlasts the grace window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const b = new SaunaBadge();
      b.setConfig({ type: "custom:sauna-badge" });
      document.body.appendChild(b);
      b.hass = hold(true);
      await b.updateComplete;

      vi.advanceTimersByTime(11 * 60_000);
      b.hass = hold(false);
      await b.updateComplete;
      expect(powerOn(b)).toBe(false);

      document.body.removeChild(b);
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases when a card stops this device's session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const b = new SaunaBadge();
      b.setConfig({ type: "custom:sauna-badge" });
      document.body.appendChild(b);
      b.hass = hold(true); // arm
      await b.updateComplete;
      vi.advanceTimersByTime(60_000);
      b.hass = hold(false); // hold → on
      await b.updateComplete;
      expect(powerOn(b)).toBe(true);

      const devId = (
        b as unknown as { _rawState(): { serviceDeviceId: string } }
      )._rawState().serviceDeviceId;

      // A stop for a different device must not release this badge.
      window.dispatchEvent(
        new CustomEvent(SESSION_STOPPED_EVENT, {
          detail: { deviceId: "some-other-device" },
        }),
      );
      await b.updateComplete;
      expect(powerOn(b)).toBe(true);

      // A stop for this device releases it, with no hass update.
      window.dispatchEvent(
        new CustomEvent(SESSION_STOPPED_EVENT, { detail: { deviceId: devId } }),
      );
      await b.updateComplete;
      expect(powerOn(b)).toBe(false);

      document.body.removeChild(b);
    } finally {
      vi.useRealTimers();
    }
  });
});
