// Stage B data source for the temperature graph: a one-shot fetch of a sensor's
// recorded history, so the heatup/cooldown curve covers the whole session (not
// just samples seen since the card mounted) and survives a page reload.
//
// Uses the WebSocket command `history/history_during_period` (the REST
// `history/period` endpoint is being phased out). Verified against the HA core
// history websocket_api and the frontend's own history fetch.

import type { Hass } from "../types";
import type { TempSample } from "../graph-phase";

// One recorded state row, in the compact shape the history WS returns:
// `s` = state value, `lu` = last_updated (epoch seconds, float), `lc` =
// last_changed (omitted when equal to lu).
interface HistoryRow {
  s: string;
  lu: number;
  lc?: number;
}

/**
 * Fetch numeric (time, temperature) samples for one sensor over [start, end].
 * Returns an empty array when history is unavailable (no `callWS`, recorder gap,
 * or the sensor was unavailable) — callers treat history as additive backfill,
 * so an empty result simply means "nothing to backfill".
 */
export async function fetchHistory(
  hass: Hass,
  entityId: string,
  start: Date,
  end: Date,
): Promise<TempSample[]> {
  if (!hass.callWS) return [];
  let res: Record<string, HistoryRow[]>;
  try {
    res = await hass.callWS<Record<string, HistoryRow[]>>({
      type: "history/history_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      entity_ids: [entityId],
      // Include the state at start_time so a curve that began before the window
      // still has a leading point; take every change for a smooth line; drop
      // attributes — we only read the numeric state.
      include_start_time_state: true,
      significant_changes_only: false,
      minimal_response: true,
      no_attributes: true,
    });
  } catch {
    return [];
  }

  const rows = res?.[entityId] ?? [];
  const startMs = start.getTime();
  const endMs = end.getTime();
  const out: TempSample[] = [];
  for (const r of rows) {
    const temp = Number.parseFloat(r.s);
    if (!Number.isFinite(temp)) continue; // skips unavailable / unknown
    const secs = r.lc ?? r.lu;
    if (!Number.isFinite(secs)) continue;
    let t = Math.round(secs * 1000);
    // With include_start_time_state, HA returns the value already active at
    // start_time stamped with its original (possibly much older) timestamp.
    // Clamp it to the window start so it anchors the curve there instead of
    // becoming a far-left tMin that compresses the real curve; drop anything
    // past the requested end.
    if (t > endMs) continue;
    if (t < startMs) t = startMs;
    out.push({ t, temp });
  }
  return out;
}
