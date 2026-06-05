import type { Hass, SaunaState } from "./types";

export const MIN_TEMP = 40;
export const MAX_TEMP = 110;

function clampTemp(t: number): number {
  return Math.max(MIN_TEMP, Math.min(MAX_TEMP, Math.round(t)));
}

/**
 * Invoke a service, swallowing rejections so callers can safely fire-and-forget
 * without producing unhandled promise rejections.
 */
function call(
  hass: Hass,
  domain: string,
  service: string,
  data: Record<string, unknown>,
): Promise<unknown> | undefined {
  const result = hass.callService?.(domain, service, data);
  return result?.catch((err: unknown) => {
    console.error(`[sauna-card] ${domain}.${service} failed`, err);
  });
}

/** Toggle a switch entity (power, light, fan, steamer, …). */
export function toggleSwitch(
  hass: Hass,
  entityId: string,
): Promise<unknown> | undefined {
  return call(hass, "switch", "toggle", { entity_id: entityId });
}

/** Set the thermostat target temperature (clamped to the Harvia range). */
export function setTargetTemperature(
  hass: Hass,
  state: SaunaState,
  temperature: number,
): Promise<unknown> | undefined {
  const entityId = state.entities.thermostat;
  if (!entityId) return undefined;
  return call(hass, "climate", "set_temperature", {
    entity_id: entityId,
    temperature: clampTemp(temperature),
  });
}

/** Nudge the target temperature by `delta` °C from the current target. */
export function stepTargetTemperature(
  hass: Hass,
  state: SaunaState,
  delta: number,
): Promise<unknown> | undefined {
  if (state.targetTemp === undefined) return undefined;
  return setTargetTemperature(hass, state, state.targetTemp + delta);
}

/**
 * Configure/start/stop a session in one call (harvia_sauna.set_session).
 * Targets the device by id; all session fields are optional.
 */
export function setSession(
  hass: Hass,
  state: SaunaState,
  opts: { target_temp?: number; duration?: number; active?: boolean },
): Promise<unknown> | undefined {
  const data: Record<string, unknown> = { device_id: state.deviceId };
  if (opts.target_temp !== undefined)
    data.target_temp = clampTemp(opts.target_temp);
  if (opts.duration !== undefined) data.duration = opts.duration;
  if (opts.active !== undefined) data.active = opts.active;
  return call(hass, "harvia_sauna", "set_session", data);
}

/** Start the heater at the current target; stop turns it off. */
export function setActive(
  hass: Hass,
  state: SaunaState,
  active: boolean,
): Promise<unknown> | undefined {
  return setSession(hass, state, {
    active,
    ...(active && state.targetTemp !== undefined
      ? { target_temp: state.targetTemp }
      : {}),
  });
}
