# Design: Heatup / cooldown temperature graph

> **Status: roadmap / future design — not committed, not scheduled.** This is a
> wishlist item with a plan, captured so the idea isn't lost. No product code
> exists for it yet. Referenced from [`../ROADMAP.md`](../ROADMAP.md) (Phase 2+).

## 1. Goal & scope

Show the temperature over time so the user can *watch* the sauna change, only
during the transitional phase where the curve is interesting:

- **Heatup graph** — a rising temperature curve while the sauna is heating toward
  its target.
- **Cooldown graph** — a falling curve that follows the sauna cooling down over
  roughly the next 24 hours after it has been on, down toward the temperature it
  was at when the session started; labelled "cooldown".

Visibility is the point: the graph appears **only in the in-between state** —
never when the sauna is `off`, and never once it has reached the target
(`ready`/at-target). Off → nothing; heating → heatup graph; reached target →
back to the normal view; turned off after a session → cooldown graph until cool.

## 2. Phase model — when the graph is shown

Phase detection already exists; the graph hooks into it.

- **Heatup window:** `s.status === "heating" && s.currentTemp < s.targetTemp`.
  `status` comes from `deriveStatus()` in `src/adapters/harvia.ts` (driven by
  `binary_sensor.heat_on`).
- **Cooldown window (new, derived):** opens when a session has just ended.
  Candidate triggers:
  - the `harvia_sauna_session_end` event, or
  - a `heating`/`ready` → `off`/`idle` status transition.

  On open, record a `cooldownAnchor = { startedAt, baselineTemp }`, where
  `baselineTemp` is the temperature at session *start*. The window stays open
  until `currentTemp <= baselineTemp` **or** `now - startedAt > 24h`, then closes
  (back to the normal view).

  `baselineTemp` / session start must be captured — either from the
  `harvia_sauna_session_start` event when the session begins, or via a recorder
  lookup of the current-temp sensor at session start (see §4, stage B).

## 3. UI integration — three options

**Recommendation: option A (conditional region-swap) for v1.**

### A. Conditional region-swap (recommended)

The graph replaces the hero temperature block inside the existing
`_renderDashboard` / `_renderHero` (`src/sauna-card.ts`, `render()` switch at the
layout dispatch) **only while the heatup/cooldown window is open**. The card frame
— head (title + status), tiles, control chips, CTA — stays unchanged, so there is
no layout jump (consistent with the existing layout-jump fix). Smallest new
surface, reuses the existing render methods. A config flag (e.g.
`show_temp_graph: boolean`) lets a user opt out; default likely on.

```
status-dashboard (frame unchanged)
┌──────────────────────────┐
│ head: title + status     │
│ ┌──────────────────────┐ │
│ │  [TEMP GRAPH]        │ │ ← replaces the hero temp block ONLY when
│ │   ╱                  │ │   status = heating / cooldown window open
│ │  ╱  85° → 90°        │ │
│ └──────────────────────┘ │
│ tiles · chips · CTA      │
└──────────────────────────┘
```

### B. Dedicated layout

A fourth layout `"heatup-graph"` added to `LAYOUTS` (`src/sauna-card.ts`) and the
`SaunaLayout` type (`src/types.ts`), with its own `_renderGraph(s)` method,
selected via the `layout` config. More isolated, but one more layout to maintain
and the user has to pick it explicitly (graph not shown in the default layouts).

### C. Standalone heatup / cooldown views

Separate `heatup` / `cooldown` views — either a dedicated card or a `mode` flag —
that can stand on their own. Most flexible, most new code, plus new registration
in `src/index.ts`. Keep the door open for this later (e.g. a separate roadmap
item) if there's demand; not needed for v1.

## 4. Data source — staged

**Recommendation: live samples first, recorder/history as the target.**

### Stage A — live in-memory samples (almost already there)

Reuse `_tempSamples` (`src/sauna-card.ts:112`), populated in `_trackTemp()`. Today
it is a ~20-minute trailing window used only by `_localEta()`, and it resets on a
fresh heat-up or target change. Enough to draw the **heatup curve for the current
session**.

Limitations / work needed:
- Resets on page reload (in-memory only).
- ~20-minute window — too short for a full heatup from cold and useless for
  cooldown over hours.
- The buffer is currently coupled to the ETA reset logic; the graph would need a
  longer window and to decouple from `_localEta`'s reset semantics (or keep a
  separate graph buffer).

### Stage B — HA recorder / history API (target)

Fetch history for the current-temperature sensor from the HA recorder, e.g.
`hass.callApi('GET', 'history/period/...')` or the websocket
`history/history_during_period`. Required for: the full curve from session start,
cooldown over hours/a day, and surviving a page reload. This is **greenfield** —
the card has no history/recorder integration today. Cache and throttle results;
history calls are expensive.

**Decision:** build the heatup curve on Stage A first; add cooldown and
reload-survival on Stage B.

## 5. Rendering approach

- A hand-rolled **SVG sparkline** — no new npm dependency (a new dependency
  requires product-owner approval). Reuse the SVG pattern already used for the
  dial / ring gauges.
- Axes: x = time, y = temperature. Draw the target line; for cooldown, draw the
  baseline line.
- Theme-vars-first (existing styling policy): line/area colours from HA CSS
  variables, no hard-coded colours.

## 6. i18n

New keys in all four `src/locales/{en,sv,fi,de}.json`, English as source/fallback
via `t()` in `src/i18n.ts` — e.g. `graph.heatup`, `graph.cooldown`,
`graph.axis_temp`, `graph.axis_time`.

## 7. Open questions / future

- Cooldown baseline: session-start temperature vs. room temperature.
- Persist the "last cooldown" between sessions, or live-only?
- Standalone views (option C) as a separate roadmap item if requested.

## 8. Out of scope

No product code now. This document is design / roadmap only.
