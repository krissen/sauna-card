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

/** After an explicit user stop, block re-arming for this long. The post-stop
 * raw state (app-started: switch off, still warm) looks like a PID gap, and a
 * stale heat_on/draw pulse can still arrive a poll or two later (cloud lag);
 * this stops such a pulse from re-latching a session the user just ended. */
const STOP_ARM_SUPPRESS_MS = 60_000;

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
  /** Epoch ms before which arming is blocked, after an explicit user stop. */
  private armBlockedUntil?: number;
  /** One-shot timer that fires onExpire at `until`, so the UI re-renders and
   * releases even if no hass update arrives in the meantime. */
  private wakeTimer?: number;

  /**
   * @param onExpire optional callback (e.g. the host's requestUpdate) invoked
   *   when the grace window elapses, so a quiet hold (no further hass updates
   *   after a shutoff while still warm) still drops to off at the grace, not
   *   whenever the next unrelated update happens. Omit it (tests) for a passive
   *   latch with no timers.
   */
  constructor(private readonly onExpire?: () => void) {}

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
      this.armBlockedUntil = undefined;
    }

    if (s) {
      const nearTarget =
        s.currentTemp !== undefined &&
        s.targetTemp !== undefined &&
        s.currentTemp >= s.targetTemp - HOLD_NEAR_TARGET_C;

      if (s.powerOn === true) {
        // A genuine running signal. Arm/refresh only while holding near target,
        // AND only when no explicit switch/climate is holding the session on
        // (switchPower !== true). A switch-controlled session has an authoritative
        // off and must not be latched — otherwise turning it off while still warm
        // would read on until the grace expires. This scopes the latch to the
        // app-started case (switch off throughout), the only one with PID gaps to
        // bridge. Heat-up is excluded too: it isn't near target. After an
        // explicit stop, arming is briefly suppressed so a stale pulse can't
        // re-latch the just-ended session.
        const armBlocked =
          this.armBlockedUntil !== undefined && now < this.armBlockedUntil;
        if (nearTarget && s.switchPower !== true && !armBlocked) {
          this.until = now + HOLD_GRACE_MS;
        }
      } else if (this.until !== undefined) {
        // Raw signal says off/undefined. Keep the latch unless it has expired or
        // the temperature shows a real cool-down (or temps are unknown — can't
        // confirm a hold, so don't keep pretending it's on).
        const coolingDown =
          s.currentTemp === undefined ||
          s.targetTemp === undefined ||
          s.currentTemp < s.targetTemp - HOLD_COOLDOWN_BAND_C;
        if (now >= this.until || coolingDown) this.until = undefined;
      }
    }

    this.scheduleWake();
  }

  // Re-arm the one-shot wake at the current expiry. apply() is time-based, so a
  // bare re-render at `until` releases the latch without needing a hass update.
  private scheduleWake(): void {
    if (!this.onExpire) return;
    if (this.wakeTimer !== undefined) {
      window.clearTimeout(this.wakeTimer);
      this.wakeTimer = undefined;
    }
    if (this.until === undefined) return;
    const delay = this.until - Date.now();
    if (delay <= 0) return;
    this.wakeTimer = window.setTimeout(() => {
      this.wakeTimer = undefined;
      // Grace elapsed — release here, not via a re-arming advance(). The host's
      // callback then only re-renders (and re-reads the now-released state).
      this.until = undefined;
      this.onExpire!();
    }, delay);
  }

  /**
   * Release the latch on an explicit user stop. The post-stop raw state is
   * indistinguishable from a PID gap (app-started: switch off, still warm), so
   * without this the latch would keep reporting on until the grace expired even
   * though the user just stopped. Also suppresses re-arming briefly so a stale
   * pulse can't re-latch the ended session.
   */
  notifyStopped(): void {
    this.until = undefined;
    this.armBlockedUntil = Date.now() + STOP_ARM_SUPPRESS_MS;
    this.scheduleWake();
  }

  /** Cancel any pending wake timer. Call from the host's disconnectedCallback. */
  dispose(): void {
    if (this.wakeTimer !== undefined) {
      window.clearTimeout(this.wakeTimer);
      this.wakeTimer = undefined;
    }
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
