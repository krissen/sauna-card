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

  it("logs the version banner once per instance, unless opted out", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    // Default (flag absent) logs once, and re-applying config does not re-log.
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    card.setConfig({ type: "custom:sauna-card", name: "x" });
    expect(info).toHaveBeenCalledTimes(1);
    // show_version: false suppresses the banner entirely.
    info.mockClear();
    const silent = new SaunaCard();
    silent.setConfig({ type: "custom:sauna-card", show_version: false });
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("rejects a non-boolean show_version or debug", () => {
    const card = new SaunaCard();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", show_version: "yes" }),
    ).toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", debug: 1 }),
    ).toThrow();
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
    // cooldown_include_heatup is on by default, so the whole-session arc shows
    // without setting it.
    card.setConfig({
      type: "custom:sauna-card",
      cooldown_target_temp: 18,
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

  it("reconstructs a cooldown without an explicit target (25 fallback)", async () => {
    const T = Date.now();
    const offAt = T - 3_600_000;
    const callWS = vi.fn().mockImplementation((msg) => {
      const id = (msg.entity_ids as string[])[0];
      if (id === "switch.power") {
        return Promise.resolve({
          "switch.power": [
            { s: "on", lu: (T - 7_200_000) / 1000 },
            { s: "off", lu: offAt / 1000 },
          ],
        });
      }
      if (id === "sensor.cur") {
        return Promise.resolve({
          "sensor.cur": [
            { s: "50", lu: (T - 3_000_000) / 1000 },
            { s: "35", lu: (T - 1_500_000) / 1000 },
          ],
        });
      }
      return Promise.resolve({});
    });
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" }); // no cooldown_target_temp → 25
    document.body.appendChild(card);
    // Off but 30° (above the 25 fallback) — the post-reload case.
    card.hass = graphHass("off", "off", 30, { callWS });
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await card.updateComplete;
    expect(callWS).toHaveBeenCalled();
    expect(card.shadowRoot?.querySelector(".graph.cooldown")).toBeTruthy();
    document.body.removeChild(card);
  });

  it("skips reconstruction when already at or below the fallback target", async () => {
    const callWS = vi.fn().mockResolvedValue({});
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    document.body.appendChild(card);
    // 24° is below the 25 fallback → nothing to cool toward, no query fires.
    card.hass = graphHass("off", "off", 24, { callWS });
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await card.updateComplete;
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

describe("remote_off_action", () => {
  function manualHass(climate: string, remote: string): Hass {
    return {
      states: {
        "climate.diy": {
          entity_id: "climate.diy",
          state: climate,
          attributes: { current_temperature: 40, temperature: 90 },
        },
        "switch.light": {
          entity_id: "switch.light",
          state: "off",
          attributes: {},
        },
        "binary_sensor.remote": {
          entity_id: "binary_sensor.remote",
          state: remote,
          attributes: {},
        },
      },
      entities: {},
      devices: {},
    } as unknown as Hass;
  }
  const base = {
    type: "custom:sauna-card",
    integration: "manual",
    entity_map: {
      thermostat: "climate.diy",
      light: "switch.light",
      remoteAllowed: "binary_sensor.remote",
    },
  };

  async function mount(
    config: Record<string, unknown>,
    hass: Hass,
  ): Promise<SaunaCard> {
    const card = new SaunaCard();
    card.setConfig(config as never);
    document.body.appendChild(card);
    card.hass = hass;
    await card.updateComplete;
    return card;
  }
  const cta = (c: SaunaCard) =>
    c.shadowRoot!.querySelector(".cta button") as HTMLButtonElement | null;
  const badgeIcon = (c: SaunaCard) =>
    c.shadowRoot!.querySelector(".badge ha-icon")?.getAttribute("icon");

  it("disable_start: start disabled and the status pill shows a lock", async () => {
    const c = await mount(
      { ...base, remote_off_action: "disable_start" },
      manualHass("off", "off"),
    );
    expect(cta(c)!.disabled).toBe(true);
    expect(badgeIcon(c)).toBe("mdi:lock");
    // The light chip still works under disable_start.
    expect(
      (c.shadowRoot!.querySelector(".chip") as HTMLButtonElement).disabled,
    ).toBe(false);
    document.body.removeChild(c);
  });

  it("does nothing while remote control is on", async () => {
    const c = await mount(
      { ...base, remote_off_action: "disable_start" },
      manualHass("off", "on"),
    );
    expect(cta(c)!.disabled).toBe(false);
    expect(badgeIcon(c)).not.toBe("mdi:lock");
    document.body.removeChild(c);
  });

  it("defaults to disable_start when nothing is configured", async () => {
    const c = await mount(base, manualHass("off", "off"));
    expect(cta(c)!.disabled).toBe(true);
    expect(badgeIcon(c)).toBe("mdi:lock");
    document.body.removeChild(c);
  });

  it("'none' opts out entirely", async () => {
    const c = await mount(
      { ...base, remote_off_action: "none" },
      manualHass("off", "off"),
    );
    expect(cta(c)!.disabled).toBe(false);
    expect(badgeIcon(c)).not.toBe("mdi:lock");
    document.body.removeChild(c);
  });

  it("lock: every control is disabled", async () => {
    const c = await mount(
      { ...base, remote_off_action: "lock" },
      manualHass("off", "off"),
    );
    expect(cta(c)!.disabled).toBe(true);
    expect(
      (c.shadowRoot!.querySelector(".step") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (c.shadowRoot!.querySelector(".chip") as HTMLButtonElement).disabled,
    ).toBe(true);
    document.body.removeChild(c);
  });

  it("hide_controls: the controls are removed (display-only)", async () => {
    const c = await mount(
      { ...base, remote_off_action: "hide_controls" },
      manualHass("off", "off"),
    );
    expect(cta(c)).toBeNull();
    expect(c.shadowRoot!.querySelector(".stepper")).toBeNull();
    expect(c.shadowRoot!.querySelector(".chips")).toBeNull();
    // Still locked-looking via the status pill.
    expect(badgeIcon(c)).toBe("mdi:lock");
    document.body.removeChild(c);
  });

  it("compact: switches to the compact layout with start disabled", async () => {
    const c = await mount(
      { ...base, layout: "status-dashboard", remote_off_action: "compact" },
      manualHass("off", "off"),
    );
    expect(c.shadowRoot!.querySelector(".compact")).toBeTruthy();
    expect(c.shadowRoot!.querySelector(".hero")).toBeNull();
    expect(cta(c)!.disabled).toBe(true);
    document.body.removeChild(c);
  });

  it("compact_locked: compact layout with every control disabled", async () => {
    const c = await mount(
      { ...base, remote_off_action: "compact_locked" },
      manualHass("off", "off"),
    );
    expect(c.shadowRoot!.querySelector(".compact")).toBeTruthy();
    expect(cta(c)!.disabled).toBe(true);
    expect(
      (c.shadowRoot!.querySelector(".step") as HTMLButtonElement).disabled,
    ).toBe(true);
    document.body.removeChild(c);
  });

  // ---- the two safety invariants the whole feature rests on ----

  it("does not fire without a mapped remote-allowed entity (default action)", async () => {
    const c = await mount(
      // remote_off_action defaults to disable_start, but no remoteAllowed mapped
      {
        ...base,
        entity_map: { thermostat: "climate.diy", light: "switch.light" },
      },
      manualHass("off", "off"),
    );
    expect(cta(c)!.disabled).toBe(false);
    expect(badgeIcon(c)).not.toBe("mdi:lock");
    document.body.removeChild(c);
  });

  it("never blocks a running sauna (stopping stays allowed)", async () => {
    const c = await mount(
      { ...base, remote_off_action: "lock" },
      manualHass("heat", "off"),
    );
    // Sauna on + remote off → not blocked: the stop button is live and nothing locks.
    expect(cta(c)!.disabled).toBe(false);
    expect(badgeIcon(c)).not.toBe("mdi:lock");
    expect(
      (c.shadowRoot!.querySelector(".step") as HTMLButtonElement).disabled,
    ).toBe(false);
    document.body.removeChild(c);
  });
});

describe("door open blocks start (reuses the remote-off treatment)", () => {
  // climate + door, with remote start explicitly allowed, so the door is the
  // only thing that can block — proving door-open drives the same machinery.
  function doorHass(climate: string, door: string): Hass {
    return {
      states: {
        "climate.diy": {
          entity_id: "climate.diy",
          state: climate,
          attributes: { current_temperature: 40, temperature: 90 },
        },
        "binary_sensor.door": {
          entity_id: "binary_sensor.door",
          state: door,
          attributes: {},
        },
        "binary_sensor.remote": {
          entity_id: "binary_sensor.remote",
          state: "on",
          attributes: {},
        },
      },
      entities: {},
      devices: {},
    } as unknown as Hass;
  }
  const base = {
    type: "custom:sauna-card",
    integration: "manual",
    entity_map: {
      thermostat: "climate.diy",
      door: "binary_sensor.door",
      remoteAllowed: "binary_sensor.remote",
    },
  };
  async function mount(
    config: Record<string, unknown>,
    hass: Hass,
  ): Promise<SaunaCard> {
    const card = new SaunaCard();
    card.setConfig(config as never);
    document.body.appendChild(card);
    card.hass = hass;
    await card.updateComplete;
    return card;
  }
  const cta = (c: SaunaCard) =>
    c.shadowRoot!.querySelector(".cta button") as HTMLButtonElement | null;
  const badgeIcon = (c: SaunaCard) =>
    c.shadowRoot!.querySelector(".badge ha-icon")?.getAttribute("icon");

  it("door open + off: start disabled with the lock pill (default action)", async () => {
    const c = await mount(base, doorHass("off", "on"));
    expect(cta(c)!.disabled).toBe(true);
    expect(cta(c)!.title).toBe("Can't start — the door is open");
    expect(badgeIcon(c)).toBe("mdi:lock");
    document.body.removeChild(c);
  });

  it("door closed + off: start enabled, no lock", async () => {
    const c = await mount(base, doorHass("off", "off"));
    expect(cta(c)!.disabled).toBe(false);
    expect(badgeIcon(c)).not.toBe("mdi:lock");
    document.body.removeChild(c);
  });

  it("door open but running: stopping is never blocked", async () => {
    const c = await mount(base, doorHass("heat", "on"));
    expect(cta(c)!.disabled).toBe(false);
    expect(badgeIcon(c)).not.toBe("mdi:lock");
    document.body.removeChild(c);
  });

  it("'none' opts out: door open doesn't block", async () => {
    const c = await mount(
      { ...base, remote_off_action: "none" },
      doorHass("off", "on"),
    );
    expect(cta(c)!.disabled).toBe(false);
    expect(badgeIcon(c)).not.toBe("mdi:lock");
    document.body.removeChild(c);
  });

  it("disables the power chip (a start) but not the aux chips", async () => {
    const hass = {
      states: {
        "climate.diy": {
          entity_id: "climate.diy",
          state: "off",
          attributes: { current_temperature: 40, temperature: 90 },
        },
        "binary_sensor.door": {
          entity_id: "binary_sensor.door",
          state: "on",
          attributes: {},
        },
        "switch.power": {
          entity_id: "switch.power",
          state: "off",
          attributes: {},
        },
        "switch.light": {
          entity_id: "switch.light",
          state: "off",
          attributes: {},
        },
      },
      entities: {},
      devices: {},
    } as unknown as Hass;
    const c = await mount(
      {
        type: "custom:sauna-card",
        integration: "manual",
        entity_map: {
          thermostat: "climate.diy",
          door: "binary_sensor.door",
          power: "switch.power",
          light: "switch.light",
        },
      },
      hass,
    );
    const chips = Array.from(
      c.shadowRoot!.querySelectorAll(".chips:not(.presets) .chip"),
    ) as HTMLButtonElement[];
    const byLabel = (t: string) =>
      chips.find((b) => b.textContent!.trim().includes(t));
    expect(byLabel("Power")!.disabled).toBe(true);
    expect(byLabel("Light")!.disabled).toBe(false);
    document.body.removeChild(c);
  });
});

describe("app-started session (Harvia app: switch.power off, heater running)", () => {
  // The defining trait of an app-started session: the power switch stays off,
  // yet heat_on + real power draw report a running heater. Every on/off-facing
  // control must read the derived truth, not the raw switch.
  function appSessionHass(): {
    hass: Hass;
    calls: Array<[string, string, Record<string, unknown>]>;
  } {
    const calls: Array<[string, string, Record<string, unknown>]> = [];
    const reg: Array<[string, string, string]> = [
      ["switch.p", "power", "off"],
      ["binary_sensor.h", "heat_on", "on"],
      ["sensor.e", "power", "6800"],
      ["climate.t", "thermostat", "off"],
    ];
    const states: Record<string, unknown> = {};
    const entities: Record<string, unknown> = {};
    for (const [id, tk, st] of reg) {
      states[id] = { entity_id: id, state: st, attributes: {} };
      entities[id] = {
        entity_id: id,
        platform: "harvia_sauna",
        translation_key: tk,
        device_id: "d1",
      };
    }
    const hass = {
      states,
      entities,
      devices: { d1: { id: "d1", name: "Bastu" } },
      callService: (
        domain: string,
        service: string,
        data: Record<string, unknown>,
      ) => {
        calls.push([domain, service, data]);
        return Promise.resolve();
      },
    } as unknown as Hass;
    return { hass, calls };
  }

  async function mount(hass: Hass): Promise<SaunaCard> {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    document.body.appendChild(card);
    card.hass = hass;
    await card.updateComplete;
    return card;
  }

  const powerChip = (c: SaunaCard) =>
    Array.from(
      c.shadowRoot!.querySelectorAll(".chips:not(.presets) .chip"),
    ).find((b) =>
      b.textContent!.trim().includes("Power"),
    ) as HTMLButtonElement | null;

  it("derives the session as on (powerOn) despite switch.power being off", async () => {
    const { hass } = appSessionHass();
    const c = await mount(hass);
    const priv = c as unknown as { _state(): { powerOn?: boolean } };
    expect(priv._state().powerOn).toBe(true);
    document.body.removeChild(c);
  });

  it("the CTA offers to turn off, not to start", async () => {
    const { hass } = appSessionHass();
    const c = await mount(hass);
    const cta = c.shadowRoot!.querySelector(".cta button") as HTMLButtonElement;
    expect(cta.textContent!.trim()).toBe("Turn off");
    document.body.removeChild(c);
  });

  it("marks the power chip as on", async () => {
    const { hass } = appSessionHass();
    const c = await mount(hass);
    const chip = powerChip(c)!;
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.classList.contains("on")).toBe(true);
    document.body.removeChild(c);
  });

  it("stops the session via set_session (not a raw switch toggle) when the power chip is tapped", async () => {
    const { hass, calls } = appSessionHass();
    const c = await mount(hass);
    powerChip(c)!.click();
    const setSession = calls.find(([, service]) => service === "set_session");
    expect(setSession).toBeTruthy();
    expect(setSession![0]).toBe("harvia_sauna");
    expect(setSession![2].active).toBe(false);
    // It must NOT fall back to a raw homeassistant.toggle of switch.power.
    expect(calls.some(([, service]) => service === "toggle")).toBe(false);
    document.body.removeChild(c);
  });
});

describe("app-started hold phase (PID gaps must not blip the card to off)", () => {
  // Steady-state hold of an app-started session: switch.power off, climate off,
  // ready latch off. The heater PID-cycles, so between pulses heat_on and the
  // power-draw sensor also fall to off/0 — every raw on/off signal goes quiet
  // while the sauna sits at target. The hold-phase latch bridges those gaps.
  const TARGET = 90;
  const reg: Array<[string, string]> = [
    ["switch.p", "power"],
    ["binary_sensor.h", "heat_on"],
    ["sensor.e", "power"],
    ["sensor.cur", "current_temperature"],
    ["sensor.tgt", "target_temperature"],
  ];
  const entities: Record<string, unknown> = {};
  for (const [id, tk] of reg) {
    entities[id] = {
      entity_id: id,
      platform: "harvia_sauna",
      translation_key: tk,
      device_id: "d1",
    };
  }
  // heat: a PID pulse (on, drawing) vs a gap (off, 0W). cur: current temp.
  const mk = (heat: boolean, cur: number): Hass =>
    ({
      states: {
        "switch.p": { entity_id: "switch.p", state: "off", attributes: {} },
        "binary_sensor.h": {
          entity_id: "binary_sensor.h",
          state: heat ? "on" : "off",
          attributes: {},
        },
        "sensor.e": {
          entity_id: "sensor.e",
          state: heat ? "6800" : "0",
          attributes: {},
        },
        "sensor.cur": {
          entity_id: "sensor.cur",
          state: String(cur),
          attributes: {},
        },
        "sensor.tgt": {
          entity_id: "sensor.tgt",
          state: String(TARGET),
          attributes: {},
        },
      },
      entities,
      devices: { d1: { id: "d1", name: "Bastu" } },
      callService: () => Promise.resolve(),
    }) as unknown as Hass;

  async function mountHolding(): Promise<SaunaCard> {
    // First beat: a pulse at target arms the latch.
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    document.body.appendChild(card);
    card.hass = mk(true, TARGET);
    await card.updateComplete;
    return card;
  }

  const powerOn = (c: SaunaCard) =>
    (c as unknown as { _state(): { powerOn?: boolean } })._state().powerOn;
  const status = (c: SaunaCard) =>
    (c as unknown as { _state(): { status?: string } })._state().status;
  const prevStatus = (c: SaunaCard) =>
    (c as unknown as { _prevStatus?: string })._prevStatus;

  it("stays on through a quiet PID gap while holding at target", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const c = await mountHolding();
      expect(powerOn(c)).toBe(true);

      // A minute later: heat_on off, 0 W, still at target — a PID gap.
      vi.advanceTimersByTime(60_000);
      c.hass = mk(false, TARGET);
      await c.updateComplete;
      expect(powerOn(c)).toBe(true);
      expect(status(c)).toBe("ready");
      const cta = c.shadowRoot!.querySelector(
        ".cta button",
      ) as HTMLButtonElement;
      expect(cta.textContent!.trim()).toBe("Turn off");

      document.body.removeChild(c);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns to off once the gap outlasts the grace window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const c = await mountHolding();
      // Quiet for longer than the 10-min grace, still warm.
      vi.advanceTimersByTime(11 * 60_000);
      c.hass = mk(false, TARGET);
      await c.updateComplete;
      expect(powerOn(c)).toBe(false);
      expect(status(c)).toBe("off");
      document.body.removeChild(c);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns to off immediately on a real cool-down within the grace window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const c = await mountHolding();
      // A minute later but the temperature has fallen well below target.
      vi.advanceTimersByTime(60_000);
      c.hass = mk(false, TARGET - 8);
      await c.updateComplete;
      expect(powerOn(c)).toBe(false);
      document.body.removeChild(c);
    } finally {
      vi.useRealTimers();
    }
  });

  it("advances the graph to off when the grace expires on a quiet hold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const c = await mountHolding(); // pulse arms the latch
      vi.advanceTimersByTime(60_000);
      c.hass = mk(false, TARGET); // gap: latch holds, status "ready"
      await c.updateComplete;
      expect(prevStatus(c)).toBe("ready");

      // Go quiet: no further hass updates. The wake timer fires at the grace and
      // must advance the graph past the held → off edge, not just the power flag.
      vi.advanceTimersByTime(10 * 60_000);
      await c.updateComplete;
      expect(powerOn(c)).toBe(false);
      expect(prevStatus(c)).toBe("off");

      document.body.removeChild(c);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the latch and re-renders at once when the user taps Turn off mid-gap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const c = await mountHolding(); // pulse arms the latch
      vi.advanceTimersByTime(60_000);
      c.hass = mk(false, TARGET); // gap: latch bridges → on, CTA "Turn off"
      await c.updateComplete;
      const cta = c.shadowRoot!.querySelector(
        ".cta button",
      ) as HTMLButtonElement;
      expect(cta.textContent!.trim()).toBe("Turn off");
      expect(powerOn(c)).toBe(true);

      // Tap Turn off. The raw states are already off/quiet, so the stop produces
      // NO further hass update — the release (deferred until the stop call
      // settles) must still reflect. Flush the microtasks then the render.
      cta.click();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      await c.updateComplete;
      expect(powerOn(c)).toBe(false);
      expect(status(c)).toBe("off");
      const cta2 = c.shadowRoot!.querySelector(
        ".cta button",
      ) as HTMLButtonElement;
      expect(cta2.textContent!.trim()).not.toBe("Turn off");

      document.body.removeChild(c);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the latch on when the stop service call fails", async () => {
    // callService rejects → the stop did not take; the heater may still be
    // running, so the latch must stay armed rather than show a false off.
    const rejectingHass = (heat: boolean): Hass =>
      ({
        ...(mk(heat, TARGET) as unknown as Record<string, unknown>),
        callService: () => Promise.reject(new Error("backend down")),
      }) as unknown as Hass;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const c = new SaunaCard();
      c.setConfig({ type: "custom:sauna-card" });
      document.body.appendChild(c);
      c.hass = rejectingHass(true); // pulse arms the latch
      await c.updateComplete;
      vi.advanceTimersByTime(60_000);
      c.hass = rejectingHass(false); // gap: latch bridges → on
      await c.updateComplete;
      expect(powerOn(c)).toBe(true);

      const cta = c.shadowRoot!.querySelector(
        ".cta button",
      ) as HTMLButtonElement;
      cta.click(); // stop attempt — rejects
      for (let i = 0; i < 5; i++) await Promise.resolve();
      await c.updateComplete;
      // Stop failed → still shown as running.
      expect(powerOn(c)).toBe(true);

      document.body.removeChild(c);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not latch a switch-controlled session: an explicit off reads off at once", async () => {
    // switch.power on (card/switch-started), at target. Turning it off while
    // still warm must read off immediately — the latch only scopes to the
    // app-started case (switch off throughout).
    const swMk = (power: string, cur: number): Hass =>
      ({
        states: {
          "switch.p": { entity_id: "switch.p", state: power, attributes: {} },
          "binary_sensor.h": {
            entity_id: "binary_sensor.h",
            state: "off",
            attributes: {},
          },
          "sensor.e": { entity_id: "sensor.e", state: "0", attributes: {} },
          "sensor.cur": {
            entity_id: "sensor.cur",
            state: String(cur),
            attributes: {},
          },
          "sensor.tgt": {
            entity_id: "sensor.tgt",
            state: String(TARGET),
            attributes: {},
          },
        },
        entities,
        devices: { d1: { id: "d1", name: "Bastu" } },
      }) as unknown as Hass;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const c = new SaunaCard();
      c.setConfig({ type: "custom:sauna-card" });
      document.body.appendChild(c);
      c.hass = swMk("on", TARGET); // running on the switch, at target
      await c.updateComplete;
      expect(powerOn(c)).toBe(true);

      vi.advanceTimersByTime(60_000);
      c.hass = swMk("off", TARGET); // explicit off, still warm
      await c.updateComplete;
      expect(powerOn(c)).toBe(false);
      expect(status(c)).toBe("off");
      document.body.removeChild(c);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets the latch when the config points at a different device", async () => {
    // Two devices: d1 app-started and holding (arms the latch), d2 off but still
    // warm. Re-pointing device_id to d2 must not apply d1's armed latch to d2.
    const twoDeviceHass = (): Hass => {
      const reg2: Array<[string, string, string]> = [
        ["switch.p1", "power", "d1"],
        ["binary_sensor.h1", "heat_on", "d1"],
        ["sensor.e1", "power", "d1"],
        ["sensor.cur1", "current_temperature", "d1"],
        ["sensor.tgt1", "target_temperature", "d1"],
        ["switch.p2", "power", "d2"],
        ["binary_sensor.h2", "heat_on", "d2"],
        ["sensor.e2", "power", "d2"],
        ["sensor.cur2", "current_temperature", "d2"],
        ["sensor.tgt2", "target_temperature", "d2"],
      ];
      const ent: Record<string, unknown> = {};
      for (const [id, tk, dev] of reg2) {
        ent[id] = {
          entity_id: id,
          platform: "harvia_sauna",
          translation_key: tk,
          device_id: dev,
        };
      }
      const st: Record<string, [string]> = {
        // d1: app-started pulse at target (running, switch off)
        "switch.p1": ["off"],
        "binary_sensor.h1": ["on"],
        "sensor.e1": ["6800"],
        "sensor.cur1": [String(TARGET)],
        "sensor.tgt1": [String(TARGET)],
        // d2: off, but still warm
        "switch.p2": ["off"],
        "binary_sensor.h2": ["off"],
        "sensor.e2": ["0"],
        "sensor.cur2": [String(TARGET)],
        "sensor.tgt2": [String(TARGET)],
      };
      const states: Record<string, unknown> = {};
      for (const [id, [state]] of Object.entries(st)) {
        states[id] = { entity_id: id, state, attributes: {} };
      }
      return {
        states,
        entities: ent,
        devices: {
          d1: { id: "d1", name: "Bastu 1" },
          d2: { id: "d2", name: "Bastu 2" },
        },
        callService: () => Promise.resolve(),
      } as unknown as Hass;
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    try {
      const c = new SaunaCard();
      c.setConfig({ type: "custom:sauna-card", device_id: "d1" });
      document.body.appendChild(c);
      c.hass = twoDeviceHass();
      await c.updateComplete;
      expect(powerOn(c)).toBe(true); // d1 latched

      // Re-point to d2 (off) without any new hass update.
      vi.advanceTimersByTime(60_000);
      c.setConfig({ type: "custom:sauna-card", device_id: "d2" });
      await c.updateComplete;
      expect(powerOn(c)).toBe(false); // d1's latch must not carry to d2
      document.body.removeChild(c);
    } finally {
      vi.useRealTimers();
    }
  });
});
