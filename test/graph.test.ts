import { describe, it, expect } from "vitest";
import {
  graphPhase,
  isCooldownExpired,
  mergeHistory,
  COOLDOWN_MAX_MS,
  type CooldownAnchor,
  type TempSample,
} from "../src/graph-phase";

describe("graphPhase", () => {
  it("is heatup while heating below target", () => {
    expect(graphPhase("heating", 60, 90, undefined)).toBe("heatup");
  });

  it("is null once heating has reached (or passed) target", () => {
    expect(graphPhase("heating", 90, 90, undefined)).toBeNull();
    expect(graphPhase("heating", 92, 90, undefined)).toBeNull();
  });

  it("is null when off with no cooldown anchor", () => {
    expect(graphPhase("off", 40, 90, undefined)).toBeNull();
  });

  it("is cooldown when off with an anchor open and still above baseline", () => {
    const anchor: CooldownAnchor = { startedAt: 0, baselineTemp: 25 };
    expect(graphPhase("off", 70, undefined, anchor)).toBe("cooldown");
  });

  it("hides cooldown once the sauna is powered back on", () => {
    // A lingering anchor must not show a cooldown during an active session —
    // heating/ready/idle are powered states, not cooling.
    const anchor: CooldownAnchor = { startedAt: 0, baselineTemp: 25 };
    expect(graphPhase("idle", 70, 90, anchor)).toBeNull();
    expect(graphPhase("ready", 92, 90, anchor)).toBeNull();
    expect(graphPhase("heating", 92, 90, anchor)).toBeNull();
  });

  it("is null once cooled back to baseline (anchor still set)", () => {
    const anchor: CooldownAnchor = { startedAt: 0, baselineTemp: 25 };
    expect(graphPhase("off", 25, undefined, anchor)).toBeNull();
    expect(graphPhase("off", 24, undefined, anchor)).toBeNull();
  });

  it("keeps cooldown open through a brief unavailability (unknown temp)", () => {
    const anchor: CooldownAnchor = { startedAt: 0, baselineTemp: 25 };
    expect(graphPhase("off", undefined, undefined, anchor)).toBe("cooldown");
  });

  it("prefers heatup over a lingering cooldown anchor", () => {
    const anchor: CooldownAnchor = { startedAt: 0, baselineTemp: 25 };
    expect(graphPhase("heating", 60, 90, anchor)).toBe("heatup");
  });
});

describe("isCooldownExpired", () => {
  const anchor: CooldownAnchor = { startedAt: 1_000_000, baselineTemp: 25 };

  it("expires once back at or below baseline", () => {
    expect(isCooldownExpired(anchor, 25, anchor.startedAt + 60_000)).toBe(true);
    expect(isCooldownExpired(anchor, 24, anchor.startedAt + 60_000)).toBe(true);
  });

  it("stays open while still warm", () => {
    expect(isCooldownExpired(anchor, 40, anchor.startedAt + 60_000)).toBe(
      false,
    );
  });

  it("expires after the 24h cap regardless of temperature", () => {
    const t = anchor.startedAt + COOLDOWN_MAX_MS + 1;
    expect(isCooldownExpired(anchor, 80, t)).toBe(true);
  });

  it("stays open on unknown temp before the cap", () => {
    expect(
      isCooldownExpired(anchor, undefined, anchor.startedAt + 60_000),
    ).toBe(false);
  });
});

describe("mergeHistory", () => {
  it("merges and sorts ascending by time", () => {
    const live: TempSample[] = [
      { t: 30, temp: 70 },
      { t: 10, temp: 50 },
    ];
    const remote: TempSample[] = [{ t: 20, temp: 60 }];
    expect(mergeHistory(live, remote)).toEqual([
      { t: 10, temp: 50 },
      { t: 20, temp: 60 },
      { t: 30, temp: 70 },
    ]);
  });

  it("lets the remote value win a timestamp tie", () => {
    const live: TempSample[] = [{ t: 10, temp: 50 }];
    const remote: TempSample[] = [{ t: 10, temp: 55 }];
    expect(mergeHistory(live, remote)).toEqual([{ t: 10, temp: 55 }]);
  });

  it("returns the live samples unchanged when remote is empty", () => {
    const live: TempSample[] = [
      { t: 10, temp: 50 },
      { t: 20, temp: 60 },
    ];
    expect(mergeHistory(live, [])).toEqual(live);
  });
});
