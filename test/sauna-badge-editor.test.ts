import { describe, it, expect } from "vitest";
import { SaunaBadgeEditor } from "../src/sauna-badge-editor";
import { SaunaBadge } from "../src/sauna-badge";
import type { SaunaBadgeConfig } from "../src/types";

type SchemaItem = { name: string; selector: Record<string, unknown> };

function schemaOf(editor: SaunaBadgeEditor): SchemaItem[] {
  return (editor as unknown as { _schema(): SchemaItem[] })._schema();
}

describe("sauna-badge-editor", () => {
  it("registers the editor element", () => {
    expect(customElements.get("sauna-badge-editor")).toBe(SaunaBadgeEditor);
  });

  it("is returned by the badge's getConfigElement", () => {
    const el = SaunaBadge.getConfigElement();
    expect(el.tagName.toLowerCase()).toBe("sauna-badge-editor");
  });

  it("back-fills the type via setConfig", () => {
    const editor = new SaunaBadgeEditor();
    editor.setConfig({ content: "single" } as SaunaBadgeConfig);
    // @ts-expect-error reading the private field for the test
    expect(editor._config.type).toBe("custom:sauna-badge");
  });

  it("shows single_item only in single mode", () => {
    const editor = new SaunaBadgeEditor();
    editor.setConfig({ type: "custom:sauna-badge", content: "single" });
    const names = schemaOf(editor).map((s) => s.name);
    expect(names).toContain("single_item");
    expect(names).not.toContain("items");
  });

  it("shows items (multiple) only in row mode", () => {
    const editor = new SaunaBadgeEditor();
    editor.setConfig({ type: "custom:sauna-badge", content: "row" });
    const items = schemaOf(editor).find((s) => s.name === "items");
    expect(items).toBeTruthy();
    const sel = items!.selector.select as { multiple?: boolean };
    expect(sel.multiple).toBe(true);
    expect(schemaOf(editor).map((s) => s.name)).not.toContain("single_item");
  });

  it("shows label_position only when show_label is set", () => {
    const editor = new SaunaBadgeEditor();
    editor.setConfig({ type: "custom:sauna-badge" });
    expect(schemaOf(editor).map((s) => s.name)).not.toContain("label_position");
    editor.setConfig({ type: "custom:sauna-badge", show_label: true });
    expect(schemaOf(editor).map((s) => s.name)).toContain("label_position");
  });

  it("merges ha-form changes over config, preserving hidden keys", () => {
    const editor = new SaunaBadgeEditor();
    // integration is not in the form schema and must survive an edit.
    editor.setConfig({
      type: "custom:sauna-badge",
      integration: "harvia_sauna",
    });
    const received: SaunaBadgeConfig[] = [];
    editor.addEventListener("config-changed", (e) => {
      received.push((e as CustomEvent).detail.config);
    });
    (
      editor as unknown as { _valueChanged(e: CustomEvent): void }
    )._valueChanged(
      new CustomEvent("value-changed", {
        detail: { value: { type: "custom:sauna-badge", visual: "ring_value" } },
      }),
    );
    expect(received).toEqual([
      {
        type: "custom:sauna-badge",
        integration: "harvia_sauna",
        visual: "ring_value",
      },
    ]);
  });
});
