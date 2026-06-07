import { describe, it, expect, vi } from "vitest";
import { fetchHistory, fetchLastOffTime } from "../../src/utils/history";
import type { Hass } from "../../src/types";

describe("fetchHistory", () => {
  it("returns [] when hass has no callWS", async () => {
    const hass = { states: {} } as unknown as Hass;
    expect(
      await fetchHistory(hass, "sensor.t", new Date(0), new Date(1000)),
    ).toEqual([]);
  });

  it("builds a UTC history_during_period request for the entity", async () => {
    const callWS = vi.fn().mockResolvedValue({ "sensor.t": [] });
    const hass = { states: {}, callWS } as unknown as Hass;
    const start = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    const end = new Date(Date.UTC(2026, 0, 2, 4, 0, 0));
    await fetchHistory(hass, "sensor.t", start, end);
    expect(callWS).toHaveBeenCalledTimes(1);
    const msg = callWS.mock.calls[0][0];
    expect(msg).toMatchObject({
      type: "history/history_during_period",
      start_time: "2026-01-02T03:04:05.000Z",
      end_time: "2026-01-02T04:00:00.000Z",
      entity_ids: ["sensor.t"],
      no_attributes: true,
      significant_changes_only: false,
    });
  });

  it("parses rows into (ms, temp) and prefers last_changed", async () => {
    const callWS = vi.fn().mockResolvedValue({
      "sensor.t": [
        { s: "40.5", lu: 1000, lc: 1000 },
        { s: "55", lu: 1200, lc: 1180 },
      ],
    });
    const hass = { states: {}, callWS } as unknown as Hass;
    const out = await fetchHistory(
      hass,
      "sensor.t",
      new Date(0),
      new Date(5_000_000),
    );
    expect(out).toEqual([
      { t: 1_000_000, temp: 40.5 },
      { t: 1_180_000, temp: 55 },
    ]);
  });

  it("skips unavailable / non-numeric rows", async () => {
    const callWS = vi.fn().mockResolvedValue({
      "sensor.t": [
        { s: "unavailable", lu: 1000 },
        { s: "unknown", lu: 1100 },
        { s: "60", lu: 1200 },
      ],
    });
    const hass = { states: {}, callWS } as unknown as Hass;
    const out = await fetchHistory(
      hass,
      "sensor.t",
      new Date(0),
      new Date(5_000_000),
    );
    expect(out).toEqual([{ t: 1_200_000, temp: 60 }]);
  });

  it("clamps a pre-window start-state row to start and drops post-end rows", async () => {
    const start = new Date(1_000_000);
    const end = new Date(2_000_000);
    const callWS = vi.fn().mockResolvedValue({
      "sensor.t": [
        { s: "20", lu: 100 }, // 100_000 ms — well before start → clamp to start
        { s: "50", lu: 1500 }, // 1_500_000 ms — inside the window
        { s: "99", lu: 3000 }, // 3_000_000 ms — after end → dropped
      ],
    });
    const hass = { states: {}, callWS } as unknown as Hass;
    const out = await fetchHistory(hass, "sensor.t", start, end);
    expect(out).toEqual([
      { t: 1_000_000, temp: 20 },
      { t: 1_500_000, temp: 50 },
    ]);
  });

  it("returns [] when the entity is absent from the response", async () => {
    const callWS = vi.fn().mockResolvedValue({});
    const hass = { states: {}, callWS } as unknown as Hass;
    expect(
      await fetchHistory(hass, "sensor.t", new Date(0), new Date(1)),
    ).toEqual([]);
  });

  it("returns [] when the websocket call rejects", async () => {
    const callWS = vi.fn().mockRejectedValue(new Error("boom"));
    const hass = { states: {}, callWS } as unknown as Hass;
    expect(
      await fetchHistory(hass, "sensor.t", new Date(0), new Date(1)),
    ).toEqual([]);
  });
});

describe("fetchLastOffTime", () => {
  const start = new Date(1_000_000);
  const end = new Date(10_000_000);

  it("returns null without callWS", async () => {
    const hass = { states: {} } as unknown as Hass;
    expect(await fetchLastOffTime(hass, "switch.p", start, end)).toBeNull();
  });

  it("returns the time of the last on→off transition (ms)", async () => {
    const callWS = vi.fn().mockResolvedValue({
      "switch.p": [
        { s: "off", lu: 1000 },
        { s: "on", lu: 2000 },
        { s: "off", lu: 4000 }, // 4_000_000 ms — the on→off edge
      ],
    });
    const hass = { states: {}, callWS } as unknown as Hass;
    expect(await fetchLastOffTime(hass, "switch.p", start, end)).toBe(
      4_000_000,
    );
  });

  it("returns the most recent edge when there are several", async () => {
    const callWS = vi.fn().mockResolvedValue({
      "switch.p": [
        { s: "on", lu: 1500 },
        { s: "off", lu: 2000 },
        { s: "on", lu: 5000 },
        { s: "off", lu: 6000 }, // last edge → 6_000_000 ms
      ],
    });
    const hass = { states: {}, callWS } as unknown as Hass;
    expect(await fetchLastOffTime(hass, "switch.p", start, end)).toBe(
      6_000_000,
    );
  });

  it("returns null when the switch was never on in the window", async () => {
    const callWS = vi.fn().mockResolvedValue({
      "switch.p": [{ s: "off", lu: 2000 }],
    });
    const hass = { states: {}, callWS } as unknown as Hass;
    expect(await fetchLastOffTime(hass, "switch.p", start, end)).toBeNull();
  });

  it("returns null when the switch is still on at the end", async () => {
    const callWS = vi.fn().mockResolvedValue({
      "switch.p": [
        { s: "off", lu: 1500 },
        { s: "on", lu: 3000 },
      ],
    });
    const hass = { states: {}, callWS } as unknown as Hass;
    expect(await fetchLastOffTime(hass, "switch.p", start, end)).toBeNull();
  });

  it("returns null on a websocket failure", async () => {
    const callWS = vi.fn().mockRejectedValue(new Error("boom"));
    const hass = { states: {}, callWS } as unknown as Hass;
    expect(await fetchLastOffTime(hass, "switch.p", start, end)).toBeNull();
  });
});
