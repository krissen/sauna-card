import { describe, it, expect } from "vitest";
import { SaunaCardEditor } from "../src/sauna-card-editor";
import { SaunaCard } from "../src/sauna-card";
import type { SaunaCardConfig } from "../src/types";

describe("sauna-card-editor", () => {
  it("registers the editor element", () => {
    expect(customElements.get("sauna-card-editor")).toBe(SaunaCardEditor);
  });

  it("is returned by the card's getConfigElement", () => {
    const el = SaunaCard.getConfigElement();
    expect(el.tagName.toLowerCase()).toBe("sauna-card-editor");
  });

  it("stores the config via setConfig", () => {
    const editor = new SaunaCardEditor();
    const cfg: SaunaCardConfig = {
      type: "custom:sauna-card",
      layout: "compact",
    };
    editor.setConfig(cfg);
    // @ts-expect-error reading the private field for the test
    expect(editor._config).toEqual(cfg);
  });

  it("merges ha-form changes over the config, preserving non-schema keys", () => {
    const editor = new SaunaCardEditor();
    // integration is not in the form schema and must survive an edit.
    editor.setConfig({
      type: "custom:sauna-card",
      integration: "harvia_sauna",
    });
    const received: SaunaCardConfig[] = [];
    editor.addEventListener("config-changed", (e) => {
      received.push((e as CustomEvent).detail.config);
    });
    // ha-form emits only the keys it knows (no `integration`).
    (
      editor as unknown as { _valueChanged(e: CustomEvent): void }
    )._valueChanged(
      new CustomEvent("value-changed", {
        detail: {
          value: {
            type: "custom:sauna-card",
            layout: "thermostat-hero",
            name: "Bastu",
          },
        },
      }),
    );
    expect(received).toEqual([
      {
        type: "custom:sauna-card",
        integration: "harvia_sauna",
        layout: "thermostat-hero",
        name: "Bastu",
      },
    ]);
  });
});
