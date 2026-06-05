# Configuration

Everything can be set in the **visual editor**; this page is the YAML reference.
The card and badge auto-detect the Harvia device, so most options are optional.

- [Card options](#card-options)
- [Layouts](#layouts)
- [Choosing what to show](#choosing-what-to-show) — tiles, slots, the value catalog
- [Controls](#controls)
- [Badge options](#badge-options)
- [Examples](#examples)

## Card options

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `string` | **Required** | `custom:sauna-card`. |
| `name` | `string` | *(device name)* | Card title. |
| `integration` | `string` | *(auto)* | Integration id; auto-detected (`harvia_sauna`). |
| `device_id` | `string` | *(auto)* | Device within the integration; auto-selected when omitted. |
| `layout` | `string` | `status-dashboard` | `status-dashboard`, `thermostat-hero`, or `compact`. |
| `controls` | `string` | `power+temp` | Interactive controls: `none`, `power`, or `power+temp`. See [Controls](#controls). |
| `language` | `string` | *(HA locale)* | Locale override (`sv`, `fi`, `en`, `de`, …). |
| `dashboard_tiles` | `array<string>` | *(see below)* | Ordered item keys shown as tiles in `status-dashboard`. |
| `hero_items` | `array<string>` | `[]` | Ordered item keys shown as tiles in `thermostat-hero`. |
| `compact_slots` | `object` | `{left: status, mid: name, right: current_temp}` | The compact layout's three slots. |

Each content option is **saved per layout** — switching layouts never clears
another layout's selection. Leaving an option unset uses its default; setting an
empty list (`[]`) shows nothing.

## Layouts

- **`status-dashboard`** (default) — big current temperature, a target stepper, a
  heating progress bar, a grid of tiles, control chips and a start/stop button.
- **`thermostat-hero`** — a 270° temperature dial; the same controls and an
  optional tile row below.
- **`compact`** — a single row of three slots, with an optional controls row.

## Choosing what to show

`status-dashboard` and `thermostat-hero` render an **ordered list** of tiles
(`dashboard_tiles` / `hero_items`); `compact` renders three **slots**
(`compact_slots`). The list/slot values are **item keys** from the catalog below.
A `compact_slots` value may also be `name` (the device name) or `none`/empty.

Items **hide when their entity is absent or disabled** in the integration — many
diagnostics are disabled by default, so they only appear once you enable them.

Default `dashboard_tiles`: `humidity`, `power`, `energy`, `remaining`, `door`,
`sessions`.

### Value catalog

| Key | Shows |
|-----|-------|
| `status` | Overall status (off / heating / ready / idle) |
| `current_temp` · `target_temp` | Current / target temperature |
| `eta` | Estimated time until ready |
| `humidity` · `target_humidity` | Humidity / target humidity |
| `temp_trend` | Temperature change per minute |
| `remaining` · `session_length` | Remaining time / configured session length |
| `power` · `energy` | Power draw (W) / energy (kWh) |
| `sessions` | Sessions today |
| `last_session_duration` · `last_session_max_temp` | Previous session duration / peak temp |
| `aroma_level` | Aroma intensity (%) |
| `wifi` | Wi-Fi signal (dBm) |
| `door` · `heating` · `steam` | Door, heating element, steam state |
| `power_switch` · `light` · `fan` · `steamer` · `aroma` · `dehumidifier` · `auto_light` · `auto_fan` | On/off of each switch |
| `heater_power_actual` | Actual heater output (W) |
| `main_sensor_temp` · `ext_sensor_temp` · `panel_temp` | Probe temperatures |
| `status_codes` · `active_profile` | Raw status codes / active profile |
| `heat_on_counter` · `steam_on_counter` · `ph1_relay_counter` · `ph2_relay_counter` · `ph3_relay_counter` | Lifetime cycle/relay counters |
| `total_hours` · `total_bathing_hours` · `total_sessions` | Lifetime totals |
| `remote_allowed` · `safety_relay` · `screen_lock` | Diagnostic binaries |

## Controls

`controls` governs the interactive elements on every layout:

| Value | Shows |
|-------|-------|
| `none` | Display only — no stepper, start/stop or chips. |
| `power` | Start/stop button + control chips. |
| `power+temp` *(default)* | Temperature stepper + start/stop + chips. |

On `compact`, any value other than `none` adds a controls row (so the compact
layout becomes interactive).

## Badge options

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `string` | **Required** | `custom:sauna-badge`. |
| `name` | `string` | *(device name)* | Override label / aria text. |
| `integration` · `device_id` · `language` | `string` | *(auto)* | As for the card. |
| `content` | `string` | `primary` | `primary` (status + temperature), `single` (one value), or `row` (several). |
| `visual` | `string` | `chip` | `chip`, `icon`, `value`, `ring_value`, `ring_icon`, or `ring`. |
| `single_item` | `string` | `current_temp` | The value shown when `content: single` (a catalog key). |
| `items` | `array<string>` | `[status, current_temp, humidity]` | The values shown when `content: row`. |
| `show_label` | `boolean` | `false` | Show each value's label. |
| `label_position` | `string` | `right` | `right` or `below` (when `show_label`). |
| `scale` | `number` | `1` | Overall size multiplier (any positive number; the editor slider offers 0.5–3). |

## Examples

Default card (auto-detected device):

```yaml
type: custom:sauna-card
```

A status dashboard with a custom tile list:

```yaml
type: custom:sauna-card
layout: status-dashboard
dashboard_tiles:
  - current_temp
  - target_temp
  - humidity
  - remaining
  - heating
  - steam
```

A read-only compact card showing status, temperature and the door:

```yaml
type: custom:sauna-card
layout: compact
controls: none
compact_slots:
  left: status
  mid: current_temp
  right: door
```

A gauge badge, and a labelled multi-value badge:

```yaml
# in a view's badges: list
- type: custom:sauna-badge
  visual: ring_value
- type: custom:sauna-badge
  content: row
  items: [current_temp, humidity, power]
  show_label: true
  label_position: below
```
