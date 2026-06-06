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
  type StartPriv = {
    _state(): unknown;
    _setActive(s: unknown, active: boolean): void;
    _startNotice(): { key: string; kind: string } | null;
    _startFailed?: string;
  };

  it("shows nothing for an idle sauna with the door open (no start attempt)", () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    card.hass = harviaHass({ power: "off", door: "on" });
    expect((card as unknown as StartPriv)._startNotice()).toBeNull();
  });

  it("flags 'can't start — door open' immediately on a start attempt with the door open", () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    card.hass = harviaHass({ power: "off", door: "on" });
    const priv = card as unknown as StartPriv;
    priv._setActive(priv._state(), true);
    expect(priv._startFailed).toBe("warn.cannot_start_door");
    expect(priv._startNotice()).toEqual({
      key: "warn.cannot_start_door",
      kind: "warn",
    });
  });

  it("falls back to a generic failure after the grace period when the cause is unknown", () => {
    vi.useFakeTimers();
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      // Door closed → no immediate reason; the timer decides.
      card.hass = harviaHass({ power: "off", door: "off" });
      const priv = card as unknown as StartPriv;
      priv._setActive(priv._state(), true);
      expect(priv._startFailed).toBeUndefined();
      vi.advanceTimersByTime(5000);
      expect(priv._startFailed).toBe("warn.start_failed");
      expect(priv._startNotice()).toEqual({
        key: "warn.start_failed",
        kind: "error",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the notice when the sauna actually starts before the grace period", () => {
    vi.useFakeTimers();
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      card.hass = harviaHass({ power: "off", door: "on" });
      const priv = card as unknown as StartPriv;
      priv._setActive(priv._state(), true);
      expect(priv._startFailed).toBe("warn.cannot_start_door");
      // The device confirms the start: power is now on at fire time.
      card.hass = harviaHass({ power: "on", door: "off" });
      vi.advanceTimersByTime(5000);
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
      const priv = card as unknown as StartPriv;
      priv._setActive(priv._state(), true);
      priv._setActive(priv._state(), false);
      expect(priv._startFailed).toBeUndefined();
      vi.advanceTimersByTime(5000);
      expect(priv._startFailed).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the 'can't start' notice in the dashboard progress slot on a start attempt", async () => {
    vi.useFakeTimers();
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    card.hass = harviaHass({ power: "off", door: "on" });
    document.body.appendChild(card);
    try {
      const priv = card as unknown as StartPriv;
      priv._setActive(priv._state(), true);
      await card.updateComplete;
      const eta = card.shadowRoot?.querySelector(".eta");
      expect(eta?.classList.contains("warn")).toBe(true);
      expect(eta?.getAttribute("role")).toBe("alert");
      expect(eta?.textContent ?? "").toContain("Can't start");
    } finally {
      card.remove();
      vi.useRealTimers();
    }
  });
});

describe("sauna-card ready ETA", () => {
  type EtaPriv = {
    _tempSamples: Array<{ t: number; temp: number }>;
    _trendCtx?: string;
    _localEta(s: unknown): number | undefined;
    _eta(s: unknown): number | undefined;
    _trackTemp(s: unknown): void;
  };
  const heating = (currentTemp: number, targetTemp: number) => ({
    deviceId: "d1",
    status: "heating",
    currentTemp,
    targetTemp,
  });

  it("derives a countdown from observed temperature samples", () => {
    const card = new SaunaCard() as unknown as EtaPriv;
    // 20° → 30° over 5 min = 2 °C/min; 50° left to 80° → 25 min.
    card._tempSamples = [
      { t: 0, temp: 20 },
      { t: 300000, temp: 30 },
    ];
    expect(card._localEta(heating(30, 80))).toBe(25);
  });

  it("uses the recent slope, not the whole buffer (avoids optimistic bias)", () => {
    const card = new SaunaCard() as unknown as EtaPriv;
    // A fast early sample (10 min ago) is outside the 8-min rate window; the
    // recent slope is 50→60 over 7 min ≈ 1.43°/min → 20° left → ~15 min.
    // (Whole-buffer averaging would read 4°/min → a too-optimistic 5 min.)
    card._tempSamples = [
      { t: 0, temp: 20 },
      { t: 180000, temp: 50 },
      { t: 600000, temp: 60 },
    ];
    expect(card._localEta(heating(60, 80))).toBe(15);
  });

  it("withholds an estimate without a meaningful rising span", () => {
    const card = new SaunaCard() as unknown as EtaPriv;
    // Single sample → unknown.
    card._tempSamples = [{ t: 0, temp: 20 }];
    expect(card._localEta(heating(20, 80))).toBeUndefined();
    // Flat (no rise) → unknown.
    card._tempSamples = [
      { t: 0, temp: 30 },
      { t: 300000, temp: 30 },
    ];
    expect(card._localEta(heating(30, 80))).toBeUndefined();
    // Already at target → unknown.
    card._tempSamples = [
      { t: 0, temp: 70 },
      { t: 300000, temp: 80 },
    ];
    expect(card._localEta(heating(80, 80))).toBeUndefined();
  });

  it("prefers the integration's trend-based ETA when present", () => {
    const card = new SaunaCard() as unknown as EtaPriv;
    card._tempSamples = [
      { t: 0, temp: 20 },
      { t: 300000, temp: 30 },
    ];
    // s.readyEtaMinutes (from the temp_trend sensor) wins over the local 25.
    expect(card._eta({ ...heating(30, 80), readyEtaMinutes: 8 })).toBe(8);
  });

  it("accumulates samples while heating and resets when heating stops", () => {
    const card = new SaunaCard() as unknown as EtaPriv;
    card._trackTemp(heating(20, 80));
    card._trackTemp(heating(21, 80));
    expect(card._tempSamples.length).toBe(2);
    card._trackTemp({ deviceId: "d1", status: "off", currentTemp: 21 });
    expect(card._tempSamples.length).toBe(0);
  });

  it("resets samples when the target temperature changes", () => {
    const card = new SaunaCard() as unknown as EtaPriv;
    card._trackTemp(heating(20, 80));
    expect(card._tempSamples.length).toBe(1);
    card._trackTemp(heating(21, 90));
    expect(card._tempSamples.length).toBe(1);
  });
});
