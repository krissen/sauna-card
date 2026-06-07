import { describe, it, expect, vi } from "vitest";
import { nothing } from "lit";
// Importing the named export evaluates the module, which runs the guarded
// customElements.define that registers the element.
import { SaunaCard } from "../src/sauna-card";
import type { Hass } from "../src/types";

// A Harvia device (power switch, heat_on binary sensor, current/target temp
// sensors) resolved by (domain, translation_key), for driving the graph.
const HARVIA_ENTITIES = {
  "switch.power": {
    entity_id: "switch.power",
    platform: "harvia_sauna",
    translation_key: "power",
    device_id: "d1",
  },
  "binary_sensor.heat": {
    entity_id: "binary_sensor.heat",
    platform: "harvia_sauna",
    translation_key: "heat_on",
    device_id: "d1",
  },
  "sensor.cur": {
    entity_id: "sensor.cur",
    platform: "harvia_sauna",
    translation_key: "current_temperature",
    device_id: "d1",
  },
  "sensor.tgt": {
    entity_id: "sensor.tgt",
    platform: "harvia_sauna",
    translation_key: "target_temperature",
    device_id: "d1",
  },
};

function graphHass(
  power: string,
  heat: string,
  cur: number,
  extra: Record<string, unknown> = {},
): Hass {
  return {
    states: {
      "switch.power": {
        entity_id: "switch.power",
        state: power,
        attributes: {},
      },
      "binary_sensor.heat": {
        entity_id: "binary_sensor.heat",
        state: heat,
        attributes: {},
      },
      "sensor.cur": {
        entity_id: "sensor.cur",
        state: String(cur),
        attributes: {},
      },
      "sensor.tgt": { entity_id: "sensor.tgt", state: "90", attributes: {} },
    },
    entities: HARVIA_ENTITIES,
    devices: { d1: { id: "d1", name: "Bastu" } },
    ...extra,
  } as unknown as Hass;
}

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

  it("accepts boolean graph flags and rejects non-booleans", () => {
    const card = new SaunaCard();
    expect(() =>
      card.setConfig({
        type: "custom:sauna-card",
        show_heatup_graph: false,
        show_cooldown_graph: true,
      }),
    ).not.toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", show_heatup_graph: "yes" }),
    ).toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", show_cooldown_graph: 1 }),
    ).toThrow();
    expect(() =>
      card.setConfig({
        type: "custom:sauna-card",
        cooldown_include_heatup: true,
      }),
    ).not.toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", cooldown_include_heatup: 1 }),
    ).toThrow();
  });

  it("accepts a numeric cooldown_target_temp and rejects non-numbers", () => {
    const card = new SaunaCard();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", cooldown_target_temp: 18 }),
    ).not.toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", cooldown_target_temp: "18" }),
    ).toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", cooldown_target_temp: NaN }),
    ).toThrow();
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

  it("region-swaps to a heatup sparkline once two samples are in", async () => {
    const entities = {
      "switch.power": {
        entity_id: "switch.power",
        platform: "harvia_sauna",
        translation_key: "power",
        device_id: "d1",
      },
      "binary_sensor.heat": {
        entity_id: "binary_sensor.heat",
        platform: "harvia_sauna",
        translation_key: "heat_on",
        device_id: "d1",
      },
      "sensor.cur": {
        entity_id: "sensor.cur",
        platform: "harvia_sauna",
        translation_key: "current_temperature",
        device_id: "d1",
      },
      "sensor.tgt": {
        entity_id: "sensor.tgt",
        platform: "harvia_sauna",
        translation_key: "target_temperature",
        device_id: "d1",
      },
    };
    const hassAt = (cur: number): Hass =>
      ({
        states: {
          "switch.power": {
            entity_id: "switch.power",
            state: "on",
            attributes: {},
          },
          "binary_sensor.heat": {
            entity_id: "binary_sensor.heat",
            state: "on",
            attributes: {},
          },
          "sensor.cur": {
            entity_id: "sensor.cur",
            state: String(cur),
            attributes: {},
          },
          "sensor.tgt": {
            entity_id: "sensor.tgt",
            state: "90",
            attributes: {},
          },
        },
        entities,
        devices: { d1: { id: "d1", name: "Bastu" } },
      }) as unknown as Hass;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      document.body.appendChild(card);

      card.hass = hassAt(60);
      await card.updateComplete;
      // One sample so far → still the normal hero block, no graph yet.
      expect(card.shadowRoot?.querySelector(".graph")).toBeFalsy();
      expect(card.shadowRoot?.querySelector(".hero")).toBeTruthy();

      vi.advanceTimersByTime(60_000);
      card.hass = hassAt(66);
      await card.updateComplete;
      // Two samples → the sparkline takes over the hero region.
      expect(card.shadowRoot?.querySelector(".graph")).toBeTruthy();
      expect(card.shadowRoot?.querySelector(".graph polyline")).toBeTruthy();
      expect(card.shadowRoot?.querySelector(".hero")).toBeFalsy();

      // Opting out hides it again.
      card.setConfig({ type: "custom:sauna-card", show_heatup_graph: false });
      card.hass = hassAt(67);
      await card.updateComplete;
      expect(card.shadowRoot?.querySelector(".graph")).toBeFalsy();

      document.body.removeChild(card);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens a cooldown sparkline after a session is switched off", async () => {
    const entities = {
      "switch.power": {
        entity_id: "switch.power",
        platform: "harvia_sauna",
        translation_key: "power",
        device_id: "d1",
      },
      "binary_sensor.heat": {
        entity_id: "binary_sensor.heat",
        platform: "harvia_sauna",
        translation_key: "heat_on",
        device_id: "d1",
      },
      "sensor.cur": {
        entity_id: "sensor.cur",
        platform: "harvia_sauna",
        translation_key: "current_temperature",
        device_id: "d1",
      },
      "sensor.tgt": {
        entity_id: "sensor.tgt",
        platform: "harvia_sauna",
        translation_key: "target_temperature",
        device_id: "d1",
      },
    };
    const mk = (power: string, heat: string, cur: number): Hass =>
      ({
        states: {
          "switch.power": {
            entity_id: "switch.power",
            state: power,
            attributes: {},
          },
          "binary_sensor.heat": {
            entity_id: "binary_sensor.heat",
            state: heat,
            attributes: {},
          },
          "sensor.cur": {
            entity_id: "sensor.cur",
            state: String(cur),
            attributes: {},
          },
          "sensor.tgt": {
            entity_id: "sensor.tgt",
            state: "90",
            attributes: {},
          },
        },
        entities,
        devices: { d1: { id: "d1", name: "Bastu" } },
      }) as unknown as Hass;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      document.body.appendChild(card);

      // Off (cold) → heating from 25° captures the cooldown baseline.
      card.hass = mk("off", "off", 25);
      await card.updateComplete;
      card.hass = mk("on", "on", 25);
      await card.updateComplete;
      card.hass = mk("on", "on", 40);
      await card.updateComplete;

      // Switch off while still hot → a cooldown window opens (one sample so far).
      card.hass = mk("off", "off", 70);
      await card.updateComplete;
      expect(card.shadowRoot?.querySelector(".graph")).toBeFalsy();

      // A second sparse sample (5 min later) → the cooldown curve takes over.
      vi.advanceTimersByTime(5 * 60_000 + 1);
      card.hass = mk("off", "off", 65);
      await card.updateComplete;
      expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeTruthy();
      expect(
        card.shadowRoot?.querySelector(".graph-line.cooldown"),
      ).toBeTruthy();

      // Opting out of the cooldown graph hides it.
      card.setConfig({ type: "custom:sauna-card", show_cooldown_graph: false });
      card.hass = mk("off", "off", 64);
      await card.updateComplete;
      expect(card.shadowRoot?.querySelector(".graph")).toBeFalsy();

      document.body.removeChild(card);
    } finally {
      vi.useRealTimers();
    }
  });

  it("backfills the heatup curve from recorder history (Stage B)", async () => {
    const entities = {
      "switch.power": {
        entity_id: "switch.power",
        platform: "harvia_sauna",
        translation_key: "power",
        device_id: "d1",
      },
      "binary_sensor.heat": {
        entity_id: "binary_sensor.heat",
        platform: "harvia_sauna",
        translation_key: "heat_on",
        device_id: "d1",
      },
      "sensor.cur": {
        entity_id: "sensor.cur",
        platform: "harvia_sauna",
        translation_key: "current_temperature",
        device_id: "d1",
      },
      "sensor.tgt": {
        entity_id: "sensor.tgt",
        platform: "harvia_sauna",
        translation_key: "target_temperature",
        device_id: "d1",
      },
    };
    // Recorder returns a multi-point heatup history, so the curve is drawable
    // from the very first update — before any second live sample exists.
    const callWS = vi.fn().mockResolvedValue({
      "sensor.cur": [
        { s: "30", lu: 1_699_999_000 },
        { s: "45", lu: 1_699_999_500 },
        { s: "58", lu: 1_699_999_900 },
      ],
    });
    const hass = {
      states: {
        "switch.power": {
          entity_id: "switch.power",
          state: "on",
          attributes: {},
        },
        "binary_sensor.heat": {
          entity_id: "binary_sensor.heat",
          state: "on",
          attributes: {},
        },
        "sensor.cur": { entity_id: "sensor.cur", state: "60", attributes: {} },
        "sensor.tgt": { entity_id: "sensor.tgt", state: "90", attributes: {} },
      },
      entities,
      devices: { d1: { id: "d1", name: "Bastu" } },
      callWS,
    } as unknown as Hass;

    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    document.body.appendChild(card);
    card.hass = hass;
    await card.updateComplete;
    // Let the fire-and-forget history fetch resolve and merge.
    await new Promise((r) => setTimeout(r, 0));
    await card.updateComplete;

    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0]).toMatchObject({
      type: "history/history_during_period",
      entity_ids: ["sensor.cur"],
    });
    expect(card.shadowRoot?.querySelector(".graph polyline")).toBeTruthy();

    document.body.removeChild(card);
  });

  it("closes the cooldown when a new session starts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      document.body.appendChild(card);

      // Run a session and switch off, then build a cooldown curve.
      card.hass = graphHass("off", "off", 25);
      await card.updateComplete;
      card.hass = graphHass("on", "on", 25);
      await card.updateComplete;
      card.hass = graphHass("on", "on", 40);
      await card.updateComplete;
      card.hass = graphHass("off", "off", 70);
      await card.updateComplete;
      vi.advanceTimersByTime(5 * 60_000 + 1);
      card.hass = graphHass("off", "off", 65);
      await card.updateComplete;
      expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeTruthy();

      // Power back on and reach target (status "ready", still above the old
      // baseline): the cooldown must not keep rendering during the new session.
      card.hass = graphHass("on", "off", 88);
      await card.updateComplete;
      expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeFalsy();
      expect(card.shadowRoot?.querySelector(".graph")).toBeFalsy();

      document.body.removeChild(card);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the room baseline through a mid-session idle dip", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      document.body.appendChild(card);

      // Power on cold and run; baseline must be the ~25° session start.
      card.hass = graphHass("off", "off", 25);
      await card.updateComplete;
      card.hass = graphHass("on", "on", 25);
      await card.updateComplete;
      card.hass = graphHass("on", "off", 88); // ready (at target)
      await card.updateComplete;
      card.hass = graphHass("on", "off", 70); // deep dip → idle
      await card.updateComplete;
      card.hass = graphHass("on", "on", 72); // reheats: idle → heating
      await card.updateComplete;

      // Switch off and cool to 60° — above the 25° start but below the 70° dip.
      card.hass = graphHass("off", "off", 68);
      await card.updateComplete;
      vi.advanceTimersByTime(5 * 60_000 + 1);
      card.hass = graphHass("off", "off", 60);
      await card.updateComplete;

      // If the dip had overwritten the baseline (to ~72°), the cooldown would
      // have closed immediately at 68°. It's still open at 60°, so the original
      // room baseline survived.
      expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeTruthy();

      document.body.removeChild(card);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses cooldown_target_temp as the cooldown baseline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const card = new SaunaCard();
      // Target 15° — below the 25° session start. The cooldown should track down
      // to 15°, so it stays open at 20° (which is below the start but above it).
      card.setConfig({ type: "custom:sauna-card", cooldown_target_temp: 15 });
      document.body.appendChild(card);

      card.hass = graphHass("off", "off", 25);
      await card.updateComplete;
      card.hass = graphHass("on", "on", 25);
      await card.updateComplete;
      card.hass = graphHass("off", "off", 70);
      await card.updateComplete;
      vi.advanceTimersByTime(5 * 60_000 + 1);
      card.hass = graphHass("off", "off", 20);
      await card.updateComplete;

      // At 20° the cooldown is still open because the target (15°) is the
      // baseline, not the 25° session start (which would have closed it).
      expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeTruthy();

      document.body.removeChild(card);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens a cooldown when switched off from an idle thermostat cycle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      document.body.appendChild(card);

      // Observed session start seeds the baseline.
      card.hass = graphHass("off", "off", 25);
      await card.updateComplete;
      card.hass = graphHass("on", "on", 25);
      await card.updateComplete;
      // Thermostat off-cycle: powered, not heating, below target → "idle".
      card.hass = graphHass("on", "off", 50);
      await card.updateComplete;
      // Switched off from idle — a real shutdown mid-session.
      card.hass = graphHass("off", "off", 60);
      await card.updateComplete;
      vi.advanceTimersByTime(5 * 60_000 + 1);
      card.hass = graphHass("off", "off", 55);
      await card.updateComplete;
      expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeTruthy();

      document.body.removeChild(card);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetches recorder history per session, not once per same target", async () => {
    const callWS = vi.fn().mockResolvedValue({
      "sensor.cur": [
        { s: "30", lu: 1 },
        { s: "40", lu: 2 },
      ],
    });
    const ws = { callWS };
    vi.useFakeTimers();
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      document.body.appendChild(card);

      vi.setSystemTime(new Date(1_700_000_000_000));
      card.hass = graphHass("off", "off", 25, ws);
      await card.updateComplete;

      const t1 = new Date(1_700_000_100_000);
      vi.setSystemTime(t1);
      card.hass = graphHass("on", "on", 25, ws); // session 1 begins
      await card.updateComplete;

      // End session 1 and cool fully so the cooldown window closes.
      vi.setSystemTime(new Date(1_700_000_200_000));
      card.hass = graphHass("off", "off", 60, ws);
      await card.updateComplete;
      vi.setSystemTime(new Date(1_700_000_300_000));
      card.hass = graphHass("off", "off", 20, ws);
      await card.updateComplete;

      // Session 2, same target — must get its own backfill, not the cached one.
      const t2 = new Date(1_700_000_400_000);
      vi.setSystemTime(t2);
      card.hass = graphHass("on", "on", 22, ws);
      await card.updateComplete;

      const heatupStarts = callWS.mock.calls
        .map((c) => c[0])
        .filter((m) => m.type === "history/history_during_period")
        .map((m) => m.start_time);
      expect(heatupStarts).toContain(t1.toISOString());
      expect(heatupStarts).toContain(t2.toISOString());

      document.body.removeChild(card);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens no cooldown when the card mounted mid-session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const card = new SaunaCard();
      card.setConfig({ type: "custom:sauna-card" });
      document.body.appendChild(card);

      // The first state the card ever sees is already heating — no off→heating
      // transition, so no trustworthy baseline. The current temp is hot.
      card.hass = graphHass("on", "on", 70);
      await card.updateComplete;
      card.hass = graphHass("on", "on", 75);
      await card.updateComplete;
      // Switched off while hot: without a real baseline, no cooldown is shown.
      card.hass = graphHass("off", "off", 75);
      await card.updateComplete;
      vi.advanceTimersByTime(5 * 60_000 + 1);
      card.hass = graphHass("off", "off", 73);
      await card.updateComplete;
      expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeFalsy();

      document.body.removeChild(card);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconstructs a cooldown after reload from recorder history", async () => {
    // Real timers (just a fixed reference now), so the fire-and-forget fetches
    // settle via real setTimeout rather than hanging under fake timers.
    const T = Date.now();
    const offAt = T - 3_600_000; // switched off 1h ago
    const callWS = vi.fn().mockImplementation((msg) => {
      const id = (msg.entity_ids as string[])[0];
      if (id === "switch.power") {
        return Promise.resolve({
          "switch.power": [
            { s: "on", lu: (T - 7_200_000) / 1000 }, // on 2h ago
            { s: "off", lu: offAt / 1000 }, // off 1h ago
          ],
        });
      }
      if (id === "sensor.cur") {
        return Promise.resolve({
          "sensor.cur": [
            { s: "40", lu: (T - 3_000_000) / 1000 },
            { s: "30", lu: (T - 1_500_000) / 1000 },
          ],
        });
      }
      return Promise.resolve({});
    });

    const card = new SaunaCard();
    // Target 18°, current 24° (off but still warm) — a fresh mount with no
    // in-memory anchor, exactly the post-reload case.
    card.setConfig({ type: "custom:sauna-card", cooldown_target_temp: 18 });
    document.body.appendChild(card);
    card.hass = graphHass("off", "off", 24, { callWS });
    await card.updateComplete;
    // Let the chained switch-history + temp-history fetches settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await card.updateComplete;

    expect(callWS).toHaveBeenCalled();
    expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeTruthy();

    document.body.removeChild(card);
  });

  it("renders a two-tone session arc with cooldown_include_heatup", async () => {
    const T = Date.now();
    const onAt = T - 7_200_000; // session started 2h ago
    const offAt = T - 3_600_000; // switched off 1h ago
    const callWS = vi.fn().mockImplementation((msg) => {
      const id = (msg.entity_ids as string[])[0];
      if (id === "switch.power") {
        return Promise.resolve({
          "switch.power": [
            { s: "on", lu: onAt / 1000 },
            { s: "off", lu: offAt / 1000 },
          ],
        });
      }
      if (id === "sensor.cur") {
        // A full arc: rising to a 90° peak, then falling.
        return Promise.resolve({
          "sensor.cur": [
            { s: "30", lu: (T - 7_000_000) / 1000 },
            { s: "60", lu: (T - 5_500_000) / 1000 },
            { s: "90", lu: (T - 3_700_000) / 1000 }, // peak
            { s: "50", lu: (T - 1_800_000) / 1000 },
            { s: "30", lu: (T - 600_000) / 1000 },
          ],
        });
      }
      return Promise.resolve({});
    });

    const card = new SaunaCard();
    card.setConfig({
      type: "custom:sauna-card",
      cooldown_target_temp: 18,
      cooldown_include_heatup: true,
    });
    document.body.appendChild(card);
    card.hass = graphHass("off", "off", 24, { callWS });
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await card.updateComplete;

    const sr = card.shadowRoot;
    // Two polylines: a rising (heat-coloured, no .cooldown) and a falling
    // (.cooldown) segment split at the peak.
    expect(sr?.querySelectorAll(".graph-line").length).toBe(2);
    expect(sr?.querySelector(".graph-line.cooldown")).toBeTruthy();
    expect(
      Array.from(sr?.querySelectorAll(".graph-line") ?? []).some(
        (el) => !el.classList.contains("cooldown"),
      ),
    ).toBe(true);
    // A clock-time axis (start / middle / end) under the curve.
    expect(sr?.querySelectorAll(".graph-axis span").length).toBe(3);

    document.body.removeChild(card);
  });

  it("stays single-tone when the session has no rising part", async () => {
    // include_heatup is on, but the recorder history only has the falling part
    // (peak at the very start) → no split, just the cooldown curve.
    const T = Date.now();
    const callWS = vi.fn().mockImplementation((msg) => {
      const id = (msg.entity_ids as string[])[0];
      if (id === "switch.power") {
        return Promise.resolve({
          "switch.power": [
            { s: "on", lu: (T - 7_200_000) / 1000 },
            { s: "off", lu: (T - 3_600_000) / 1000 },
          ],
        });
      }
      if (id === "sensor.cur") {
        return Promise.resolve({
          "sensor.cur": [
            { s: "90", lu: (T - 3_500_000) / 1000 }, // peak first, then falls
            { s: "60", lu: (T - 1_800_000) / 1000 },
            { s: "30", lu: (T - 600_000) / 1000 },
          ],
        });
      }
      return Promise.resolve({});
    });

    const card = new SaunaCard();
    card.setConfig({
      type: "custom:sauna-card",
      cooldown_target_temp: 18,
      cooldown_include_heatup: true,
    });
    document.body.appendChild(card);
    card.hass = graphHass("off", "off", 24, { callWS });
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await card.updateComplete;

    const sr = card.shadowRoot;
    const lines = sr?.querySelectorAll(".graph-line") ?? [];
    expect(lines.length).toBe(1);
    expect(lines[0].classList.contains("cooldown")).toBe(true);

    document.body.removeChild(card);
  });

  it("does not reconstruct a cooldown without a target temp", async () => {
    const callWS = vi.fn().mockResolvedValue({});
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" }); // no cooldown_target_temp
    document.body.appendChild(card);
    card.hass = graphHass("off", "off", 24, { callWS });
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await card.updateComplete;
    // No target → reload reconstruction is opt-in, so no switch query fires.
    expect(callWS).not.toHaveBeenCalled();
    expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeFalsy();
    document.body.removeChild(card);
  });

  it("does not fetch recorder history for a disabled graph", async () => {
    const callWS = vi.fn().mockResolvedValue({ "sensor.cur": [] });
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card", show_heatup_graph: false });
    document.body.appendChild(card);
    card.hass = graphHass("on", "on", 60, { callWS });
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    expect(callWS).not.toHaveBeenCalled();
    document.body.removeChild(card);
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

// ---- tap → more-info ----

// A device whose readouts cover the breadth of clickable surfaces: a climate
// thermostat (status badge, static target), current-temp sensor (hero number),
// plus humidity/power sensors and a light switch (tiles + a control chip).
const MI_ENTITIES = {
  "climate.thermostat": {
    entity_id: "climate.thermostat",
    platform: "harvia_sauna",
    translation_key: "thermostat",
    device_id: "d1",
  },
  "switch.power": {
    entity_id: "switch.power",
    platform: "harvia_sauna",
    translation_key: "power",
    device_id: "d1",
  },
  "switch.light": {
    entity_id: "switch.light",
    platform: "harvia_sauna",
    translation_key: "light",
    device_id: "d1",
  },
  "sensor.cur": {
    entity_id: "sensor.cur",
    platform: "harvia_sauna",
    translation_key: "current_temperature",
    device_id: "d1",
  },
  "sensor.hum": {
    entity_id: "sensor.hum",
    platform: "harvia_sauna",
    translation_key: "humidity",
    device_id: "d1",
  },
  "sensor.pwr": {
    entity_id: "sensor.pwr",
    platform: "harvia_sauna",
    translation_key: "power",
    device_id: "d1",
  },
};

function miHass(): Hass {
  return {
    states: {
      "climate.thermostat": {
        entity_id: "climate.thermostat",
        state: "heat",
        attributes: { temperature: 90, current_temperature: 60 },
      },
      "switch.power": {
        entity_id: "switch.power",
        state: "on",
        attributes: {},
      },
      "switch.light": {
        entity_id: "switch.light",
        state: "off",
        attributes: {},
      },
      "sensor.cur": { entity_id: "sensor.cur", state: "60", attributes: {} },
      "sensor.hum": { entity_id: "sensor.hum", state: "30", attributes: {} },
      "sensor.pwr": { entity_id: "sensor.pwr", state: "2000", attributes: {} },
    },
    entities: MI_ENTITIES,
    devices: { d1: { id: "d1", name: "Bastu" } },
  } as unknown as Hass;
}

async function miCard(
  config: Record<string, unknown> = {},
): Promise<{ card: SaunaCard; events: string[] }> {
  const card = new SaunaCard();
  card.setConfig({ type: "custom:sauna-card", ...config });
  document.body.appendChild(card);
  card.hass = miHass();
  await card.updateComplete;
  const events: string[] = [];
  card.addEventListener("hass-more-info", (e) =>
    events.push((e as CustomEvent).detail.entityId),
  );
  return { card, events };
}

describe("sauna-card tap → more-info", () => {
  it("opens more-info for the underlying entity when a tile is tapped", async () => {
    const { card, events } = await miCard({
      dashboard_tiles: ["humidity", "power"],
    });
    const tiles = card.shadowRoot!.querySelectorAll<HTMLElement>(".tile.mi");
    expect(tiles.length).toBe(2);
    tiles[0].click(); // humidity → sensor.hum
    tiles[1].click(); // power → sensor.pwr
    expect(events).toEqual(["sensor.hum", "sensor.pwr"]);
    document.body.removeChild(card);
  });

  it("opens more-info via keyboard (Enter)", async () => {
    const { card, events } = await miCard({ dashboard_tiles: ["humidity"] });
    const tile = card.shadowRoot!.querySelector<HTMLElement>(".tile.mi")!;
    tile.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(events).toEqual(["sensor.hum"]);
    document.body.removeChild(card);
  });

  it("makes the status badge and hero number clickable", async () => {
    const { card, events } = await miCard({ controls: "none" });
    const badge = card.shadowRoot!.querySelector<HTMLElement>(".badge.mi")!;
    const cur = card.shadowRoot!.querySelector<HTMLElement>(".cur.mi")!;
    expect(badge).toBeTruthy();
    expect(cur).toBeTruthy();
    badge.click();
    cur.click();
    expect(events).toEqual(["climate.thermostat", "sensor.cur"]);
    document.body.removeChild(card);
  });

  it("disables the affordance entirely when tap_more_info is false", async () => {
    const { card, events } = await miCard({
      dashboard_tiles: ["humidity"],
      tap_more_info: false,
    });
    expect(card.shadowRoot!.querySelectorAll(".mi").length).toBe(0);
    const tile = card.shadowRoot!.querySelector<HTMLElement>(".tile")!;
    tile.click();
    expect(events).toEqual([]);
    document.body.removeChild(card);
  });

  it("leaves interactive controls unchanged (a chip never opens more-info)", async () => {
    const { card, events } = await miCard();
    const calls: unknown[][] = [];
    (
      card.hass as unknown as { callService: (...a: unknown[]) => unknown }
    ).callService = (...a: unknown[]) => {
      calls.push(a);
      return Promise.resolve();
    };
    const chip = card.shadowRoot!.querySelector<HTMLElement>(".chip")!;
    expect(chip.classList.contains("mi")).toBe(false);
    chip.click();
    expect(events).toEqual([]); // no more-info from a control
    expect(calls.length).toBe(1); // it toggled the switch instead
    document.body.removeChild(card);
  });
});
