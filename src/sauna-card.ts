import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/**
 * Minimal placeholder card. Real status/control rendering arrives in later
 * increments (see docs/dev/ROADMAP.md). This skeleton only proves the build,
 * registration, and Home Assistant card lifecycle wiring.
 */
@customElement("sauna-card")
export class SaunaCard extends LitElement {
  @property({ attribute: false }) hass?: unknown;

  @state() private _config: Record<string, unknown> = {};

  static getStubConfig(): Record<string, unknown> {
    return { type: "custom:sauna-card" };
  }

  setConfig(config: unknown): void {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid configuration");
    }
    this._config = config as Record<string, unknown>;
  }

  getCardSize(): number {
    return 3;
  }

  override render(): TemplateResult {
    const header = (this._config.name as string | undefined) ?? "Sauna";
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

declare global {
  interface HTMLElementTagNameMap {
    "sauna-card": SaunaCard;
  }
}
