# Troubleshooting

If your issue isn't covered here, open a
[GitHub issue](https://github.com/krissen/sauna-card/issues) with the diagnostics
from [What to include when reporting a bug](#what-to-include-when-reporting-a-bug).

## Before you report

Most issues fall into a few categories — work through these first:

1. **Check the running card version** and that it matches what HACS shows (see
   [Checking the version and opening the browser console](#checking-the-version-and-opening-the-browser-console)).
2. **Hard-refresh the browser** to clear a stale cached bundle.
3. **Test with a minimal config** to rule out a config problem.
4. **Enable debug logging** and look in the browser console for `[sauna-card]`
   lines (see [the console section](#checking-the-version-and-opening-the-browser-console)).

## Common issues

### "No sauna device found"

The card couldn't resolve a sauna to show.

- **Harvia:** the card auto-detects a Harvia device. Check that the
  [`ha-harvia-sauna`](https://github.com/WiesiDeluxe/ha-harvia-sauna) integration
  is installed and has created a device (Settings → Devices & services → Harvia).
  If you have more than one, pin it with `device_id` (the editor's device picker).
- **Manual mapping:** for a non-Harvia sauna, set **Source → Custom mapping** in
  the editor and map your entities. If you've mapped entities but still see this,
  the mapped entity IDs probably don't exist — confirm them in
  **Developer Tools → States** (see [below](#what-to-include-when-reporting-a-bug)).

### A value I selected doesn't show

Items **hide when their entity is missing, unavailable or disabled**.

- **Harvia:** many diagnostic values (relay counters, probe temperatures,
  `status_codes`, `active_profile`, the totals, the safety/screen-lock binaries)
  are **disabled by default** by the integration. Enable the entity (Settings →
  Devices & services → the entity → ⚙ → *Enabled*) and it will appear.
- **Manual mapping:** make sure that type is **ticked** in the editor's *Entity
  mapping* list and points at an entity that exists and has a value.

Some values also only have data in certain states — e.g. `remaining`/`eta` while
a session is running, `last_session_*` after the first session.

### The card or badge doesn't appear in the picker

Make sure the dashboard **resource** is registered (HACS does this automatically;
for a manual install see [installation](installation.md)) and reload the browser.
A hard refresh clears a stale cached bundle.

### The editor doesn't open

The visual editor uses Home Assistant's `ha-form`. If it appears blank, reload
the browser; an outdated cached bundle is the usual cause.

## Checking the version and opening the browser console

The card prints its version to the **browser console** on load. The console is a
built-in panel in every desktop browser that shows technical messages from the
page — you don't need to install anything.

1. Open your dashboard with the card.
2. Open the browser console:
   - **Chrome / Edge:** press <kbd>F12</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>
     on Windows, <kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>J</kbd> on Mac), then the
     **Console** tab.
   - **Firefox:** press <kbd>F12</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>
     / <kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>K</kbd>).
   - **Safari:** first enable the Develop menu (Safari → Settings → Advanced →
     *Show features for web developers*), then press
     <kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>C</kbd>.
   - **Home Assistant Companion app:** the console isn't directly accessible —
     open the same dashboard in a desktop browser instead.
3. Look for a line like `♨️ Sauna Card: version X.Y.Z`. This is the **actually
   running** version (a git tag, or a short commit hash off-tag). If it doesn't
   match what HACS shows as installed, you have a cache problem — hard-refresh.

The banner is on by default. The visual editor's **Advanced** section also shows
the version; you can silence the banner with `show_version: false`.

### Enabling debug logging

For a deeper trace, enable **debug logging**:

- **Visual editor:** edit the card, open the **Advanced** section, toggle
  **Debug logging** on.
- **YAML:** add `debug: true` to the card (or badge) config.

Reload the page, then read the console: the card and badge write verbose
`console.debug` lines prefixed `[sauna-card]`, covering integration detection,
service calls, the manual entity mapping (including any unreadable or missing
mappings), and graph/session computation. See
[Configuration → Advanced](configuration.md#advanced).

## What to include when reporting a bug

Including this up front lets us diagnose without rounds of back-and-forth:

1. **Card version (required)** — the running version from the console, not what
   HACS shows. See [above](#checking-the-version-and-opening-the-browser-console).
2. **Environment (required)** — Home Assistant Core version (Settings → About);
   the **source** you use (Harvia integration + its version, or *manual mapping*);
   and your browser / platform.
3. **Card YAML config (required)** — edit the card → *Show code editor* → copy the
   full YAML (for manual mapping this includes your `entity_map`).
4. **Entity IDs / states (required for "nothing shows" issues)** — open
   **Developer Tools → States** (Settings sidebar, or quick search
   <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>K</kbd>) and confirm the relevant entities
   exist and aren't `unavailable`/`unknown`. For manual mapping, check each entity
   you mapped (the `climate` entity and any switches/sensors).
5. **Entity attributes (helpful for display issues)** — click the entity in
   Developer Tools → States and copy its attributes. For a manual `climate`
   entity, the `current_temperature`, `temperature` and `hvac_action` attributes
   are what the card reads.
6. **Debug console output (helpful for detection/mapping issues)** — enable debug
   (above), reload, and copy the `[sauna-card]` lines.
7. **Browser console errors (required for errors/crashes)** — copy any red error
   text in full (not just a screenshot).
8. **Home Assistant logs (helpful for integration errors)** — Settings → System →
   Logs; copy any entries from your sauna integration.

## Is it a card issue or a setup issue?

Many reports turn out to be the underlying entity/integration, not the card:

| Symptom | Likely in |
|---------|-----------|
| The entity is missing, `unavailable` or `unknown` in Developer Tools → States | **Your setup / integration** |
| The entity's attributes are empty or wrong | **Your setup / integration** |
| HA logs show errors from the sauna integration | **Integration** |
| "No sauna device found" with `ha-harvia-sauna` installed and a Harvia device present | **Card** (detection) |
| A value is blank for an entity that exists and has a value | **Card** |
| Wrong status/temperature for an entity whose state is correct | **Card** |
| Editor options missing or broken | **Card** |

For a Harvia integration problem, report it on the
[`ha-harvia-sauna`](https://github.com/WiesiDeluxe/ha-harvia-sauna) repository. For
a card problem, [open an issue here](https://github.com/krissen/sauna-card/issues)
with the diagnostics above.

## Developing locally

When testing a local build against a `www/`-served copy, Home Assistant serves
the gzipped file — regenerate it after each build
(`gzip -kf .../sauna-card.js`). This does **not** apply to a normal HACS install,
which serves the file as published.
