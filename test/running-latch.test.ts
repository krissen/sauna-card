import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SaunaState } from "../src/types";
import { RunningLatch } from "../src/running-latch";

const T0 = 1_700_000_000_000;

// Minimal SaunaState — only the fields the latch reads (deviceId, targetTemp,
// currentTemp, powerOn, status). The rest is filler to satisfy the type.
function makeState(p: Partial<SaunaState>): SaunaState {
  return {
    integration: "harvia",
    deviceId: "dev1",
    serviceDeviceId: "dev1",
    available: true,
    status: "off",
    entities: {},
    switches: {},
    ...p,
  } as SaunaState;
}

describe("RunningLatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds 'on' through a brief quiet gap once armed near target", () => {
    const latch = new RunningLatch();
    // Hold phase: running and at target.
    const running = makeState({
      powerOn: true,
      status: "ready",
      currentTemp: 90,
      targetTemp: 90,
    });
    latch.advance(running);

    // A PID gap a minute later: every raw signal quiet → powerOn false.
    vi.advanceTimersByTime(60_000);
    const gap = makeState({
      powerOn: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 90,
    });
    latch.advance(gap);
    const out = latch.apply(gap);
    expect(out!.powerOn).toBe(true);
    expect(out!.status).toBe("ready");
  });

  it("releases after the grace window elapses (sustained off)", () => {
    const latch = new RunningLatch();
    latch.advance(
      makeState({
        powerOn: true,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      }),
    );

    // Quiet, still warm, but well past the 10-min grace.
    vi.advanceTimersByTime(11 * 60_000);
    const late = makeState({
      powerOn: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 90,
    });
    latch.advance(late);
    const out = latch.apply(late);
    expect(out!.powerOn).toBe(false);
    expect(out!.status).toBe("off");
  });

  it("releases immediately on a real cool-down even within grace", () => {
    const latch = new RunningLatch();
    latch.advance(
      makeState({
        powerOn: true,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      }),
    );

    // A minute later (within grace) but temp has dropped > 5 °C below target.
    vi.advanceTimersByTime(60_000);
    const cooling = makeState({
      powerOn: false,
      status: "off",
      currentTemp: 84,
      targetTemp: 90,
    });
    latch.advance(cooling);
    const out = latch.apply(cooling);
    expect(out!.powerOn).toBe(false);
  });

  it("never arms during heat-up (running but below the near-target band)", () => {
    const latch = new RunningLatch();
    // Running, but still climbing — 10 °C below target.
    latch.advance(
      makeState({
        powerOn: true,
        status: "heating",
        currentTemp: 80,
        targetTemp: 90,
      }),
    );

    vi.advanceTimersByTime(60_000);
    const gap = makeState({
      powerOn: false,
      status: "off",
      currentTemp: 80,
      targetTemp: 90,
    });
    latch.advance(gap);
    expect(latch.apply(gap)!.powerOn).toBe(false);
  });

  it("does not arm a switch-controlled session (explicit off stays immediate)", () => {
    const latch = new RunningLatch();
    // Card/switch-started: the switch holds it on, so switchPower is true at
    // target. No PID gap to bridge — the latch must not arm.
    latch.advance(
      makeState({
        powerOn: true,
        switchPower: true,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      }),
    );

    // User turns it off while still warm: switch off, powerOn false, temp near
    // target. Without the gate this would be masked for 10 min; it must read off.
    vi.advanceTimersByTime(60_000);
    const off = makeState({
      powerOn: false,
      switchPower: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 90,
    });
    latch.advance(off);
    expect(latch.apply(off)!.powerOn).toBe(false);
  });

  it("releases on an explicit stop and suppresses a stale re-arming pulse", () => {
    const latch = new RunningLatch();
    const armed = () =>
      makeState({
        powerOn: true,
        switchPower: false,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      });
    latch.advance(armed()); // app-started hold, latched

    // User stops. The post-stop gap (still warm, every signal quiet) must read
    // off, not be bridged.
    latch.notifyStopped();
    const gap = makeState({
      powerOn: false,
      switchPower: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 90,
    });
    latch.advance(gap);
    expect(latch.apply(gap)!.powerOn).toBe(false);

    // A stale pulse a few seconds later must NOT re-latch the ended session.
    vi.advanceTimersByTime(10_000);
    latch.advance(armed());
    const gap2 = makeState({
      powerOn: false,
      switchPower: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 90,
    });
    latch.advance(gap2);
    expect(latch.apply(gap2)!.powerOn).toBe(false);

    // Once the suppression window passes, a genuine new hold can arm again.
    vi.advanceTimersByTime(60_000);
    latch.advance(armed());
    vi.advanceTimersByTime(60_000);
    const gap3 = makeState({
      powerOn: false,
      switchPower: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 90,
    });
    latch.advance(gap3);
    expect(latch.apply(gap3)!.powerOn).toBe(true);
  });

  it("drops an app-started latch once an explicit switch takes over", () => {
    const latch = new RunningLatch();
    // App-started hold arms the latch (switch off, running near target).
    latch.advance(
      makeState({
        powerOn: true,
        switchPower: false,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      }),
    );

    // The explicit switch is turned on mid-session: it now controls the session.
    vi.advanceTimersByTime(60_000);
    latch.advance(
      makeState({
        powerOn: true,
        switchPower: true,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      }),
    );

    // Turning that switch off while still warm must read off at once — the stale
    // app-started latch must not bridge a switch-controlled off.
    vi.advanceTimersByTime(60_000);
    const off = makeState({
      powerOn: false,
      switchPower: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 90,
    });
    latch.advance(off);
    expect(latch.apply(off)!.powerOn).toBe(false);
  });

  it("resets when the target changes", () => {
    const latch = new RunningLatch();
    latch.advance(
      makeState({
        powerOn: true,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      }),
    );

    // New target → fresh context; the prior arm must not carry over.
    vi.advanceTimersByTime(60_000);
    const newTarget = makeState({
      powerOn: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 100,
    });
    latch.advance(newTarget);
    expect(latch.apply(newTarget)!.powerOn).toBe(false);
  });

  it("resets when the device changes", () => {
    const latch = new RunningLatch();
    latch.advance(
      makeState({
        powerOn: true,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      }),
    );

    vi.advanceTimersByTime(60_000);
    const otherDevice = makeState({
      deviceId: "dev2",
      powerOn: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 90,
    });
    latch.advance(otherDevice);
    expect(latch.apply(otherDevice)!.powerOn).toBe(false);
  });

  it("keeps refreshing across repeated hold pulses (long session)", () => {
    const latch = new RunningLatch();
    const target = 90;
    // Pulse, 3-min gap, pulse, 3-min gap... over 20 minutes. Each pulse refreshes
    // the grace, so a gap after the last pulse still reads on.
    for (let i = 0; i < 6; i++) {
      latch.advance(
        makeState({
          powerOn: true,
          status: "ready",
          currentTemp: target,
          targetTemp: target,
        }),
      );
      vi.advanceTimersByTime(3 * 60_000);
      const gap = makeState({
        powerOn: false,
        status: "off",
        currentTemp: target,
        targetTemp: target,
      });
      latch.advance(gap);
      expect(latch.apply(gap)!.powerOn).toBe(true);
    }
  });

  it("passes a genuinely running state through unchanged", () => {
    const latch = new RunningLatch();
    const running = makeState({
      powerOn: true,
      status: "heating",
      currentTemp: 70,
      targetTemp: 90,
    });
    latch.advance(running);
    expect(latch.apply(running)).toBe(running);
  });

  it("passes null through unchanged", () => {
    const latch = new RunningLatch();
    latch.advance(null);
    expect(latch.apply(null)).toBe(null);
  });

  it("fires onExpire at the grace window so a quiet hold still releases", () => {
    const onExpire = vi.fn();
    const latch = new RunningLatch(onExpire);
    latch.advance(
      makeState({
        powerOn: true,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      }),
    );
    // No further advance() (no hass update); the timer must still fire at grace.
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10 * 60_000);
    expect(onExpire).toHaveBeenCalledTimes(1);

    // And by then apply() reports off, so the re-render the callback triggers
    // would show the released state.
    const quiet = makeState({
      powerOn: false,
      status: "off",
      currentTemp: 90,
      targetTemp: 90,
    });
    expect(latch.apply(quiet)!.powerOn).toBe(false);
  });

  it("reschedules a single wake across refreshes (no pile-up)", () => {
    const onExpire = vi.fn();
    const latch = new RunningLatch(onExpire);
    const pulse = () =>
      latch.advance(
        makeState({
          powerOn: true,
          status: "ready",
          currentTemp: 90,
          targetTemp: 90,
        }),
      );
    pulse();
    vi.advanceTimersByTime(5 * 60_000);
    pulse(); // refresh: old timer cleared, new one at now+grace
    vi.advanceTimersByTime(5 * 60_000); // 5 min after the refresh — not yet expired
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * 60_000); // now grace from the refresh has elapsed
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("dispose cancels a pending wake", () => {
    const onExpire = vi.fn();
    const latch = new RunningLatch(onExpire);
    latch.advance(
      makeState({
        powerOn: true,
        status: "ready",
        currentTemp: 90,
        targetTemp: 90,
      }),
    );
    latch.dispose();
    vi.advanceTimersByTime(20 * 60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
