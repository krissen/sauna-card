// Pure, DOM-free logic for the heatup/cooldown temperature graph. Kept separate
// from the card so the phase model and buffer maths are trivially unit-testable.

import type { SaunaStatus } from "./types";

/** One observed (time, temperature) point. `t` is epoch ms. */
export interface TempSample {
  t: number;
  temp: number;
}

/**
 * A cooldown window in progress. `baselineTemp` is the temperature the sauna
 * started a session from (≈ room temperature) — cooldown is "interesting" until
 * the sauna falls back to it. `startedAt` is when the window opened (epoch ms).
 */
export interface CooldownAnchor {
  startedAt: number;
  baselineTemp: number;
}

/** Heatup is fast (minutes → ~1h); cap the live buffer well above a cold start. */
export const HEATUP_WINDOW_MS = 2 * 3600_000;
/** Cooldown is slow (up to a day); sample sparsely rather than on every change. */
export const COOLDOWN_SAMPLE_INTERVAL_MS = 5 * 60_000;
/** A cooldown window never stays open longer than this, even if still warm. */
export const COOLDOWN_MAX_MS = 24 * 3600_000;

/**
 * Which graph window, if any, is open right now. Heatup takes precedence (a
 * fresh session supersedes a lingering cooldown). Cooldown stays open while an
 * anchor is set and the sauna is still above its baseline; the time-based 24h
 * expiry is the card's responsibility (it clears the anchor via
 * `isCooldownExpired`, after which this returns null).
 */
export function graphPhase(
  status: SaunaStatus,
  currentTemp: number | undefined,
  targetTemp: number | undefined,
  anchor: CooldownAnchor | undefined,
): "heatup" | "cooldown" | null {
  if (
    status === "heating" &&
    currentTemp !== undefined &&
    targetTemp !== undefined &&
    currentTemp < targetTemp
  ) {
    return "heatup";
  }
  // Cooldown is only meaningful while the sauna is off (or briefly unavailable).
  // Once it's powered back on — heating, ready or idle — an active session, not a
  // cooldown, owns the view, even if the anchor hasn't been cleared yet.
  if (anchor && (status === "off" || status === "unknown")) {
    // Back to baseline → done. Unknown temp (brief unavailability) keeps the
    // window open rather than dropping it.
    if (currentTemp !== undefined && currentTemp <= anchor.baselineTemp) {
      return null;
    }
    return "cooldown";
  }
  return null;
}

/** True once a cooldown window should close: back to baseline, or aged out. */
export function isCooldownExpired(
  anchor: CooldownAnchor,
  currentTemp: number | undefined,
  now: number,
): boolean {
  if (now - anchor.startedAt > COOLDOWN_MAX_MS) return true;
  if (currentTemp !== undefined && currentTemp <= anchor.baselineTemp) {
    return true;
  }
  return false;
}

/**
 * Merge recorder-fetched samples into live ones, de-duplicated by timestamp
 * (remote wins on a tie — it's the authoritative recorded value) and sorted
 * ascending in time. Stage B is additive: it fills history without clobbering
 * the live tail.
 */
export function mergeHistory(
  live: readonly TempSample[],
  remote: readonly TempSample[],
): TempSample[] {
  const byT = new Map<number, TempSample>();
  for (const s of live) byT.set(s.t, s);
  for (const s of remote) byT.set(s.t, s);
  return [...byT.values()].sort((a, b) => a.t - b.t);
}
