import { describe, it, expect, vi } from "vitest";
import { fetchHistory } from "../../src/utils/history";
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
    const out = await fetchHistory(hass, "sensor.t", new Date(0), new Date(1));
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
    const out = await fetchHistory(hass, "sensor.t", new Date(0), new Date(1));
    expect(out).toEqual([{ t: 1_200_000, temp: 60 }]);
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
