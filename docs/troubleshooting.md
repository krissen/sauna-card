# Troubleshooting

## "No sauna device found"

The card couldn't auto-detect a Harvia device. Check that the
[`ha-harvia-sauna`](https://github.com/WiesiDeluxe/ha-harvia-sauna) integration
is installed and has created a device (Settings → Devices & services → Harvia).
If you have more than one, pin it with `device_id` (the editor's device picker).

## A value I selected doesn't show

Items **hide when their entity is missing or disabled**. Many of the diagnostic
values (relay counters, probe temperatures, `status_codes`, `active_profile`, the
totals, the safety/screen-lock binaries) are **disabled by default** by the
integration. Enable the entity (Settings → Devices & services → the entity →
⚙ → *Enabled*) and it will appear.

Some values also only have data in certain states — e.g. `remaining`/`eta` while
a session is running, `last_session_*` after the first session.

## The card or badge doesn't appear in the picker

Make sure the dashboard **resource** is registered (HACS does this automatically;
for a manual install see [installation](installation.md)) and reload the browser.
A hard refresh clears a stale cached bundle.

## The editor doesn't open

The visual editor uses Home Assistant's `ha-form`. If it appears blank, reload
the browser; an outdated cached bundle is the usual cause.

## Developing locally

When testing a local build against a `www/`-served copy, Home Assistant serves
the gzipped file — regenerate it after each build
(`gzip -kf .../sauna-card.js`). This does **not** apply to a normal HACS install,
which serves the file as published.
