import type { SaunaState } from "./types";

// During the steady-state hold at target temperature the heater PID-cycles, so a
// session started from the Harvia app — which leaves switch.power, climate mode
// and the per-session `ready` latch all off — has *every* on/off signal go quiet
// in the gaps between pulses (heat_on off, power draw 0). buildSaunaState then
// derives `powerOn` from the raw (off) switch and the UI blips to off mid-session.
//
// This is a small time-based latch that bridges those gaps: once a running
// session is recognized *near target*, keep it "on" through brief quiet spans,
// releasing on a sustained off (grace expiry) or a real cool-down (temperature
// falling well below target). It is stateful across hass updates, so it lives
// here in the UI layer rather than in the pure, shared buildSaunaState. The card
// and badge each own an instance.
//
// The heat-up phase is unaffected: heat_on and draw are continuous while heating
// (PR #33 handles it), and we deliberately arm only near target so heat-up never
// engages the latch.

/** Arm only when within this many °C of target — matches the "ready" band in
 * deriveStatus (build-state.ts). Heat-up stays below it and never arms. */
const HOLD_NEAR_TARGET_C = 2;

/** Release when the temperature has fallen this far below target: a genuine
 * cool-down, not normal PID sag. Wider than the arm band, so the boundary has
 * hysteresis and the latch doesn't flap. */
const HOLD_COOLDOWN_BAND_C = 5;

/** Longest quiet gap to bridge. Must exceed the real hold-phase PID off-gap;
 * validate live against an app-started session and tune if pulses are spaced
 * further apart. Too long delays recognizing a genuine off while still warm. */
const HOLD_GRACE_MS = 10 * 60_000;

/**
 * A per-component hold-phase running latch. Advance it once per hass update from
 * the *raw* derived state, then apply it (read-only, any number of times) to
 * correct the state the UI reads.
 */
export class RunningLatch {
  /** Epoch ms until which the hold latch is trusted; undefined when disarmed. */
  private until?: number;
  /** Context key (`deviceId|targetTemp`); a change resets the latch. */
  private ctx?: string;

  /**
   * Advance the latch. Call exactly once per hass update, with the raw state
   * (before apply), so the decision isn't taken on an already-corrected value.
   */
  advance(s: SaunaState | null): void {
    const now = Date.now();
    const ctx = s ? `${s.deviceId}|${s.targetTemp ?? ""}` : undefined;
    if (ctx !== this.ctx) {
      this.ctx = ctx;
      this.until = undefined;
    }
    if (!s) return;

    const nearTarget =
      s.currentTemp !== undefined &&
      s.targetTemp !== undefined &&
      s.currentTemp >= s.targetTemp - HOLD_NEAR_TARGET_C;

    if (s.powerOn === true) {
      // A genuine running signal. Arm/refresh only while holding near target —
      // during heat-up the signals are continuous and need no bridging, and we
      // don't want to arm before the session has reached temperature.
      if (nearTarget) this.until = now + HOLD_GRACE_MS;
      return;
    }

    // Raw signal says off/undefined. Keep the latch unless it has expired or the
    // temperature shows a real cool-down (or temps are unknown — can't confirm a
    // hold, so don't keep pretending it's on).
    if (this.until === undefined) return;
    const coolingDown =
      s.currentTemp === undefined ||
      s.targetTemp === undefined ||
      s.currentTemp < s.targetTemp - HOLD_COOLDOWN_BAND_C;
    if (now >= this.until || coolingDown) this.until = undefined;
  }

  /**
   * Return a state corrected by the latch. While the latch holds, an
   * otherwise-off state reads on and "ready" (hold = at temperature). A genuine
   * running state, or null, passes through unchanged. Safe to call repeatedly.
   */
  apply(s: SaunaState | null): SaunaState | null {
    if (!s || s.powerOn === true) return s;
    if (this.until !== undefined && Date.now() < this.until) {
      return { ...s, powerOn: true, status: "ready" };
    }
    return s;
  }
}
