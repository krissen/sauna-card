import { describe, it, expect, vi } from "vitest";
import { nothing } from "lit";
// Importing the named export evaluates the module, which runs the guarded
// customElements.define that registers the element.
import { SaunaCard } from "../src/sauna-card";
import type { Hass } from "../src/types";

describe("sauna-card", () => {
  it("registers the custom element", () => {
    expect(customElements.get("sauna-card")).toBe(SaunaCard);
  });

  it("provides a stub config without a type (HA supplies it)", () => {
    expect(SaunaCard.getStubConfig()).toEqual({});
  });

  it("rejects null, primitives, arrays and class instances", () => {
    const card = new SaunaCard();
    expect(() => card.setConfig(undefined)).toThrow();
    expect(() => card.setConfig(null)).toThrow();
    expect(() => card.setConfig([])).toThrow();
    expect(() => card.setConfig("x")).toThrow();
    expect(() => card.setConfig(new Date())).toThrow();
  });

  it("accepts a plain-object configuration (an empty object is valid)", () => {
    const card = new SaunaCard();
    expect(() => card.setConfig({})).not.toThrow();
    card.setConfig({ type: "custom:sauna-card" });
    expect(card.getCardSize()).toBe(5);
  });

  it("rejects wrong-typed fields and unknown layouts", () => {
    const card = new SaunaCard();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", language: 123 }),
    ).toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", layout: "fancy" }),
    ).toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", layout: "compact" }),
    ).not.toThrow();
  });

  it("sizes the compact layout by its controls", () => {
    const card = new SaunaCard();
    // Default (power+temp) adds a controls row, so compact needs one more row.
    card.setConfig({ type: "custom:sauna-card", layout: "compact" });
    expect(card.getCardSize()).toBe(3);
    // Display-only compact is the smallest.
    card.setConfig({
      type: "custom:sauna-card",
      layout: "compact",
      controls: "none",
    });
    expect(card.getCardSize()).toBe(2);
  });

  it("rejects an invalid controls mode", () => {
    const card = new SaunaCard();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", controls: "bogus" }),
    ).toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", controls: "power" }),
    ).not.toThrow();
  });

  it("accepts tile lists and rejects non-array tile config", () => {
    const card = new SaunaCard();
    expect(() =>
      card.setConfig({
        type: "custom:sauna-card",
        dashboard_tiles: ["humidity", "power"],
        hero_items: ["status"],
      }),
    ).not.toThrow();
    expect(() =>
      card.setConfig({
        type: "custom:sauna-card",
        dashboard_tiles: "humidity",
      }),
    ).toThrow();
  });

  it("accepts compact_slots as an object and rejects non-objects", () => {
    const card = new SaunaCard();
    expect(() =>
      card.setConfig({
        type: "custom:sauna-card",
        layout: "compact",
        compact_slots: { left: "status", mid: "name", right: "current_temp" },
      }),
    ).not.toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", compact_slots: "status" }),
    ).toThrow();
  });

  it("renders tiles whose value is localized without losing `this`", () => {
    // Regression: _itemTile passes the card's _t as a callback; door/status
    // tiles call it, so _t must stay bound (arrow field), not a plain method.
    const entities = {
      "switch.p": {
        entity_id: "switch.p",
        platform: "harvia_sauna",
        translation_key: "power",
        device_id: "d1",
      },
      "binary_sensor.d": {
        entity_id: "binary_sensor.d",
        platform: "harvia_sauna",
        translation_key: "door",
        device_id: "d1",
      },
    };
    const states = {
      "switch.p": { entity_id: "switch.p", state: "on", attributes: {} },
      "binary_sensor.d": {
        entity_id: "binary_sensor.d",
        state: "off",
        attributes: {},
      },
    };
    const card = new SaunaCard();
    card.setConfig({
      type: "custom:sauna-card",
      dashboard_tiles: ["status", "door"],
    });
    card.hass = {
      states,
      entities,
      devices: { d1: { id: "d1", name: "Bastu" } },
    } as unknown as Hass;
    expect(() => card.render()).not.toThrow();
    expect(card.render()).toBeTruthy();
  });

  it("renders nothing without hass and a card when no device is found", () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    expect(card.render()).toBe(nothing);
    card.hass = { states: {}, entities: {}, devices: {} } as Hass;
    const out = card.render();
    expect(out).not.toBe(nothing);
    expect(out).toBeTruthy();
  });
});

// A minimal Harvia device with a power switch, door sensor and thermostat, so
// the card can derive doorOpen / power-on state.
function harviaHass(opts: { power: "on" | "off"; door: "on" | "off" }): Hass {
  return {
    states: {
      "switch.p": { entity_id: "switch.p", state: opts.power, attributes: {} },
      "binary_sensor.d": {
        entity_id: "binary_sensor.d",
        state: opts.door,
        attributes: {},
      },
      "climate.t": {
        entity_id: "climate.t",
        state: opts.power === "on" ? "heat" : "off",
        attributes: {},
      },
    },
    entities: {
      "switch.p": {
        entity_id: "switch.p",
        platform: "harvia_sauna",
        translation_key: "power",
        device_id: "d1",
      },
      "binary_sensor.d": {
        entity_id: "binary_sensor.d",
        platform: "harvia_sauna",
        translation_key: "door",
        device_id: "d1",
      },
      "climate.t": {
        entity_id: "climate.t",
        platform: "harvia_sauna",
        translation_key: "thermostat",
        device_id: "d1",
      },
    },
    devices: { d1: { id: "d1", name: "Bastu" } },
  } as unknown as Hass;
}

describe("sauna-card start-failure feedback", () => {
  it("proactively flags 'can't start' when the door is open and the sauna is off", () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    card.hass = harviaHass({ power: "off", door: "on" });
    const s = (card as unknown as { _state(): unknown })._state();
    const notice = (
      card as unknown as {
        _startNotice(x: unknown): { key: string; kind: string } | null;
      }
    )._startNotice(s);
    expect(notice).toEqual({ key: "warn.cannot_start_door", kind: "warn" });
  });

  it("does not flag 'can't start' once the sauna is running, nor when the door is closed", () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    const startNotice = (x: unknown) =>
      (
        card as unknown as { _startNotice(x: unknown): unknown }
      )._startNotice(x);
    const state = () =>
      (card as unknown as { _state(): unknown })._state();

    card.hass = harviaHass({ power: "on", door: "on" });
    expect(startNotice(state())).toBeNull();

    card.hass = harviaHass({ power: "off", door: "off" });
    expect(startNotice(state())).toBeNull();
  });

  it("surfaces a door-specific failure when a start doesn't take within the grace period", () => {
    vi.useFakeTimers();
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      card.hass = harviaHass({ power: "off", door: "on" });
      const priv = card as unknown as {
        _state(): unknown;
        _setActive(s: unknown, active: boolean): void;
        _startFailed?: string;
      };
      priv._setActive(priv._state(), true);
      expect(priv._startFailed).toBeUndefined();
      vi.advanceTimersByTime(7000);
      expect(priv._startFailed).toBe("warn.start_failed_door");
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to a generic failure when no specific reason is known", () => {
    vi.useFakeTimers();
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      card.hass = harviaHass({ power: "off", door: "off" });
      const priv = card as unknown as {
        _state(): unknown;
        _setActive(s: unknown, active: boolean): void;
        _startFailed?: string;
      };
      priv._setActive(priv._state(), true);
      vi.advanceTimersByTime(7000);
      expect(priv._startFailed).toBe("warn.start_failed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the pending detection when the sauna actually starts before the grace period", () => {
    vi.useFakeTimers();
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      card.hass = harviaHass({ power: "off", door: "on" });
      const priv = card as unknown as {
        _state(): unknown;
        _setActive(s: unknown, active: boolean): void;
        _startFailed?: string;
      };
      priv._setActive(priv._state(), true);
      // The device confirms the start: power is now on at fire time.
      card.hass = harviaHass({ power: "on", door: "off" });
      vi.advanceTimersByTime(7000);
      expect(priv._startFailed).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a stop action cancels a pending start-failure detection", () => {
    vi.useFakeTimers();
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      card.hass = harviaHass({ power: "off", door: "on" });
      const priv = card as unknown as {
        _state(): unknown;
        _setActive(s: unknown, active: boolean): void;
        _startFailed?: string;
      };
      priv._setActive(priv._state(), true);
      priv._setActive(priv._state(), false);
      vi.advanceTimersByTime(7000);
      expect(priv._startFailed).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the 'can't start' notice in the dashboard progress slot", async () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    card.hass = harviaHass({ power: "off", door: "on" });
    document.body.appendChild(card);
    try {
      await card.updateComplete;
      const eta = card.shadowRoot?.querySelector(".eta");
      expect(eta?.classList.contains("warn")).toBe(true);
      expect(eta?.getAttribute("role")).toBe("alert");
      expect(eta?.textContent ?? "").toContain("Can't start");
    } finally {
      card.remove();
    }
  });
});
