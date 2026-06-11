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

  it("exposes both graph toggles as boolean form fields", () => {
    const editor = new SaunaCardEditor();
    editor.setConfig({ type: "custom:sauna-card" });
    const schema = (
      editor as unknown as {
        _schema(): Array<{ name: string; selector: Record<string, unknown> }>;
      }
    )._schema();
    const heatup = schema.find((f) => f.name === "show_heatup_graph");
    const cooldown = schema.find((f) => f.name === "show_cooldown_graph");
    expect(heatup?.selector).toHaveProperty("boolean");
    expect(cooldown?.selector).toHaveProperty("boolean");
  });

  it("exposes tap_more_info as a boolean form field", () => {
    const editor = new SaunaCardEditor();
    editor.setConfig({ type: "custom:sauna-card" });
    const schema = (
      editor as unknown as {
        _schema(): Array<{ name: string; selector: Record<string, unknown> }>;
      }
    )._schema();
    const tap = schema.find((f) => f.name === "tap_more_info");
    expect(tap?.selector).toHaveProperty("boolean");
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

  it("does not bake the default-on toggles into config on an unrelated edit", () => {
    const editor = new SaunaCardEditor();
    editor.setConfig({ type: "custom:sauna-card" });
    const received: SaunaCardConfig[] = [];
    editor.addEventListener("config-changed", (e) =>
      received.push((e as CustomEvent).detail.config),
    );
    // ha-form re-emits the full data, including the normalised default-on toggles.
    (
      editor as unknown as { _valueChanged(e: CustomEvent): void }
    )._valueChanged(
      new CustomEvent("value-changed", {
        detail: {
          value: {
            type: "custom:sauna-card",
            name: "Bastu",
            show_heatup_graph: true,
            show_cooldown_graph: true,
            cooldown_include_heatup: true,
            tap_more_info: true,
          },
        },
      }),
    );
    const cfg = received.at(-1)! as unknown as Record<string, unknown>;
    expect(cfg.name).toBe("Bastu");
    for (const k of [
      "show_heatup_graph",
      "show_cooldown_graph",
      "cooldown_include_heatup",
      "tap_more_info",
    ]) {
      expect(k in cfg).toBe(false);
    }
  });

  it("keeps a toggle set to a non-default value", () => {
    const editor = new SaunaCardEditor();
    editor.setConfig({ type: "custom:sauna-card" });
    const received: SaunaCardConfig[] = [];
    editor.addEventListener("config-changed", (e) =>
      received.push((e as CustomEvent).detail.config),
    );
    (
      editor as unknown as { _valueChanged(e: CustomEvent): void }
    )._valueChanged(
      new CustomEvent("value-changed", {
        detail: {
          value: { type: "custom:sauna-card", show_heatup_graph: false },
        },
      }),
    );
    expect(received.at(-1)!.show_heatup_graph).toBe(false);
  });
});

// Access the editor's private tile-list API for focused unit tests.
interface TileSpec {
  configKey: "dashboard_tiles" | "hero_items";
  defaults: readonly string[];
  titleKey: string;
}
interface TileApi {
  _activeSpec: TileSpec | undefined;
  _list(spec: TileSpec): string[];
  _move(spec: TileSpec, i: number, dir: -1 | 1): void;
  _remove(spec: TileSpec, i: number): void;
  _add(spec: TileSpec, key: string): void;
  _resetSection(spec: TileSpec): void;
  _resetAll(): void;
  _setSlot(pos: "left" | "mid" | "right", value: string): void;
  _resetCompact(): void;
}

function makeEditor(config: Partial<SaunaCardConfig> = {}): {
  editor: SaunaCardEditor;
  api: TileApi;
  emitted: SaunaCardConfig[];
} {
  const editor = new SaunaCardEditor();
  editor.setConfig({ type: "custom:sauna-card", ...config });
  const emitted: SaunaCardConfig[] = [];
  editor.addEventListener("config-changed", (e) =>
    emitted.push((e as CustomEvent).detail.config),
  );
  return { editor, api: editor as unknown as TileApi, emitted };
}

describe("sauna-card-editor tile list", () => {
  it("the active spec follows the selected layout", () => {
    expect(makeEditor().api._activeSpec?.configKey).toBe("dashboard_tiles");
    expect(
      makeEditor({ layout: "thermostat-hero" }).api._activeSpec?.configKey,
    ).toBe("hero_items");
    // Compact has no tile section yet.
    expect(makeEditor({ layout: "compact" }).api._activeSpec).toBeUndefined();
  });

  it("falls back to the dashboard defaults when unset", () => {
    const { api } = makeEditor();
    const spec = api._activeSpec!;
    expect(api._list(spec)).toEqual([
      "humidity",
      "power",
      "energy",
      "remaining",
      "door",
      "sessions",
    ]);
  });

  it("adds, reorders and removes items", () => {
    const { api, emitted } = makeEditor({
      dashboard_tiles: ["humidity", "power"],
    });
    const spec = api._activeSpec!;
    api._add(spec, "status");
    expect(emitted.at(-1)!.dashboard_tiles).toEqual([
      "humidity",
      "power",
      "status",
    ]);
    // Each op reads back the editor's now-updated config.
    api._move(spec, 0, 1);
    expect(emitted.at(-1)!.dashboard_tiles).toEqual([
      "power",
      "humidity",
      "status",
    ]);
    api._remove(spec, 0);
    expect(emitted.at(-1)!.dashboard_tiles).toEqual(["humidity", "status"]);
  });

  it("ignores invalid added keys (prototype-safe)", () => {
    const { api, emitted } = makeEditor({ dashboard_tiles: ["power"] });
    api._add(api._activeSpec!, "toString");
    expect(emitted).toHaveLength(0);
  });

  it("section reset clears just that layout's key", () => {
    const { api, emitted } = makeEditor({
      dashboard_tiles: ["humidity"],
      hero_items: ["status"],
    });
    api._resetSection(api._activeSpec!);
    const cfg = emitted.at(-1)!;
    expect("dashboard_tiles" in cfg).toBe(false);
    expect(cfg.hero_items).toEqual(["status"]); // other layout untouched
  });

  it("reset-all strips every per-layout list", () => {
    const { api, emitted } = makeEditor({
      dashboard_tiles: ["humidity"],
      hero_items: ["status"],
      compact_slots: { left: "status" },
    });
    api._resetAll();
    const cfg = emitted.at(-1)!;
    expect("dashboard_tiles" in cfg).toBe(false);
    expect("hero_items" in cfg).toBe(false);
    expect("compact_slots" in cfg).toBe(false);
  });

  it("compact slots: set one, keep the rest, reset all three", () => {
    const { api, emitted } = makeEditor({ layout: "compact" });
    // No tile spec for compact; slots are edited via _setSlot.
    expect(api._activeSpec).toBeUndefined();
    api._setSlot("right", "humidity");
    const cfg = emitted.at(-1)!;
    // Defaults fill the untouched slots; the chosen one overrides.
    expect(cfg.compact_slots).toEqual({
      left: "status",
      mid: "name",
      right: "humidity",
    });
    api._resetCompact();
    expect("compact_slots" in emitted.at(-1)!).toBe(false);
  });
});
