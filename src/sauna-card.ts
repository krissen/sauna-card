import { LitElement, html, css, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Minimal placeholder card. Real status/control rendering arrives in later
 * increments (see docs/dev/ROADMAP.md). This skeleton only proves the build,
 * registration, and Home Assistant card lifecycle wiring.
 */
export class SaunaCard extends LitElement {
  @property({ attribute: false }) hass?: unknown;

  @state() private _config: Record<string, unknown> = {};

  static getStubConfig(): Record<string, unknown> {
    // Home Assistant supplies `type` from the window.customCards entry, so the
    // stub returns only the default config fragment (empty for now).
    return {};
  }

  setConfig(config: unknown): void {
    if (!isPlainObject(config)) {
      throw new Error("Invalid configuration");
    }
    this._config = config;
  }

  getCardSize(): number {
    return 3;
  }

  override render(): TemplateResult {
    const name = this._config.name;
    const header = typeof name === "string" ? name : "Sauna";
    return html`
      <ha-card .header=${header}>
        <div class="content">
          <p>sauna-card — early development (${__VERSION__}).</p>
        </div>
      </ha-card>
    `;
  }

  static override styles = css`
    .content {
      padding: 16px;
      color: var(--primary-text-color);
    }
  `;
}

// Guarded manual registration (instead of the @customElement decorator): avoids
// a "tag already defined" throw if the bundle is evaluated twice (Vite dev/HMR,
// or the resource loaded more than once).
if (!customElements.get("sauna-card")) {
  customElements.define("sauna-card", SaunaCard);
}

declare global {
  interface HTMLElementTagNameMap {
    "sauna-card": SaunaCard;
  }
}
