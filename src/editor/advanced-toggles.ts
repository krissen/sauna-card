import { html, type TemplateResult } from "lit";
import type { Hass } from "../types";
import { t } from "../i18n";

/** The two diagnostic toggles shared by the card and badge editors. */
export interface AdvancedToggleConfig {
  show_version?: boolean;
  debug?: boolean;
}

const SCHEMA = [
  { name: "show_version", selector: { boolean: {} } },
  { name: "debug", selector: { boolean: {} } },
];

const LABEL_KEY: Record<string, string> = {
  show_version: "editor.show_version",
  debug: "editor.debug",
};

/** Form data for the toggles, with each key at its effective value. */
export function advancedToggleData(
  cfg: AdvancedToggleConfig,
): Required<AdvancedToggleConfig> {
  return {
    show_version: cfg.show_version !== false,
    debug: cfg.debug === true,
  };
}

/**
 * Map the form value back to a config patch that stores only non-defaults:
 * `show_version` defaults on (stored only as `false`), `debug` defaults off
 * (stored only as `true`). Keys set to undefined are dropped by the editor.
 */
export function advancedTogglePatch(
  value: AdvancedToggleConfig,
): AdvancedToggleConfig {
  return {
    show_version: value.show_version === false ? false : undefined,
    debug: value.debug === true ? true : undefined,
  };
}

/**
 * Render the toggles through ha-form's boolean selector, which renders its own
 * labels on every supported Home Assistant version. (A bare ha-switch wrapped
 * in ha-formfield loses its label from HA 2026.11, where ha-formfield was
 * removed.)
 */
export function renderAdvancedToggles(
  hass: Hass | undefined,
  cfg: AdvancedToggleConfig,
  lang: string,
  emit: (patch: AdvancedToggleConfig) => void,
): TemplateResult {
  return html`<ha-form
    .hass=${hass}
    .data=${advancedToggleData(cfg)}
    .schema=${SCHEMA}
    .computeLabel=${(s: { name: string }) =>
      t(LABEL_KEY[s.name] ?? s.name, lang)}
    @value-changed=${(ev: CustomEvent) => {
      ev.stopPropagation();
      emit(
        advancedTogglePatch(
          (ev.detail as { value: AdvancedToggleConfig }).value,
        ),
      );
    }}
  ></ha-form>`;
}
