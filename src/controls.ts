import { dlog } from "./log";
import type { Hass, SaunaState } from "./types";

export const MIN_TEMP = 40;
export const MAX_TEMP = 110;

function clampTemp(t: number): number {
  return Math.max(MIN_TEMP, Math.min(MAX_TEMP, Math.round(t)));
}

/**
 * Invoke a service, swallowing rejections so callers can safely fire-and-forget
 * without producing unhandled promise rejections. When `debug` is set, the call
 * (domain.service + payload) is logged before dispatch.
 */
function call(
  hass: Hass,
  domain: string,
  service: string,
  data: Record<string, unknown>,
  debug = false,
): Promise<unknown> | undefined {
  dlog(debug, `call ${domain}.${service}`, data);
  const result = hass.callService?.(domain, service, data);
  return result?.catch((err: unknown) => {
    console.error(`[sauna-card] ${domain}.${service} failed`, err);
  });
}

/**
 * Toggle an on/off entity (power, light, fan, steamer, …). Uses the
 * domain-agnostic `homeassistant.toggle` so a manually mapped control works
 * whether it's a switch, light, fan or input_boolean — not only `switch.*`.
 */
export function toggleSwitch(
  hass: Hass,
  entityId: string,
  debug = false,
): Promise<unknown> | undefined {
  return call(hass, "homeassistant", "toggle", { entity_id: entityId }, debug);
}

/** Set the thermostat target temperature (clamped to the Harvia range). */
export function setTargetTemperature(
  hass: Hass,
  state: SaunaState,
  temperature: number,
  debug = false,
): Promise<unknown> | undefined {
  const entityId = state.entities.thermostat;
  if (!entityId) return undefined;
  return call(
    hass,
    "climate",
    "set_temperature",
    {
      entity_id: entityId,
      temperature: clampTemp(temperature),
    },
    debug,
  );
}

/** Nudge the target temperature by `delta` °C from the current target. */
export function stepTargetTemperature(
  hass: Hass,
  state: SaunaState,
  delta: number,
  debug = false,
): Promise<unknown> | undefined {
  if (state.targetTemp === undefined) return undefined;
  return setTargetTemperature(hass, state, state.targetTemp + delta, debug);
}

/**
 * Apply a climate preset (climate.set_preset_mode). The integration sets the
 * preset's target temperature and duration but does NOT start the heater.
 */
export function setPresetMode(
  hass: Hass,
  state: SaunaState,
  preset: string,
  debug = false,
): Promise<unknown> | undefined {
  const entityId = state.entities.thermostat;
  if (!entityId) return undefined;
  return call(
    hass,
    "climate",
    "set_preset_mode",
    { entity_id: entityId, preset_mode: preset },
    debug,
  );
}

/**
 * Schedule smart preheat (harvia_sauna.ready_at): start the heater so the sauna
 * reaches its target by `ready_at` (an ISO datetime). Targets the device by id.
 */
export function scheduleReadyAt(
  hass: Hass,
  state: SaunaState,
  opts: { ready_at: string; target_temp?: number },
  debug = false,
): Promise<unknown> | undefined {
  const data: Record<string, unknown> = {
    device_id: state.deviceId,
    ready_at: opts.ready_at,
  };
  if (opts.target_temp !== undefined)
    data.target_temp = clampTemp(opts.target_temp);
  return call(hass, "harvia_sauna", "ready_at", data, debug);
}

/** Cancel an active preheat schedule (harvia_sauna.cancel_preheat). */
export function cancelPreheat(
  hass: Hass,
  state: SaunaState,
  debug = false,
): Promise<unknown> | undefined {
  return call(
    hass,
    "harvia_sauna",
    "cancel_preheat",
    { device_id: state.deviceId },
    debug,
  );
}

/**
 * Configure/start/stop a session in one call (harvia_sauna.set_session).
 * Targets the device by id; all session fields are optional.
 */
export function setSession(
  hass: Hass,
  state: SaunaState,
  opts: { target_temp?: number; duration?: number; active?: boolean },
  debug = false,
): Promise<unknown> | undefined {
  const data: Record<string, unknown> = { device_id: state.deviceId };
  if (opts.target_temp !== undefined)
    data.target_temp = clampTemp(opts.target_temp);
  if (opts.duration !== undefined) data.duration = opts.duration;
  if (opts.active !== undefined) data.active = opts.active;
  return call(hass, "harvia_sauna", "set_session", data, debug);
}

/**
 * Start the heater at the current target; stop turns it off. Harvia drives a
 * timed session via its own service. A manual sauna has no such service, so it
 * switches the mapped power entity on/off (domain-agnostic); with no power
 * entity mapped there is nothing to start (the CTA is disabled in that case).
 */
export function setActive(
  hass: Hass,
  state: SaunaState,
  active: boolean,
  debug = false,
): Promise<unknown> | undefined {
  if (state.integration === "manual") {
    const power = state.entities.power;
    if (power) {
      return call(
        hass,
        "homeassistant",
        active ? "turn_on" : "turn_off",
        { entity_id: power },
        debug,
      );
    }
    // No dedicated power switch: switch the mapped thermostat (climate) on/off
    // directly, so a climate-only sauna still has a working power button.
    const thermo = state.entities.thermostat;
    if (thermo) {
      return call(
        hass,
        "climate",
        active ? "turn_on" : "turn_off",
        { entity_id: thermo },
        debug,
      );
    }
    return undefined;
  }
  return setSession(
    hass,
    state,
    {
      active,
      ...(active && state.targetTemp !== undefined
        ? { target_temp: state.targetTemp }
        : {}),
    },
    debug,
  );
}
