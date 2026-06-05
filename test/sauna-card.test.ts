import { describe, it, expect } from "vitest";
import { nothing } from "lit";
// Importing the named export evaluates the module, which runs the guarded
// customElements.define that registers the element.
import { SaunaCard } from "../src/sauna-card";
import type { Hass } from "../src/types";

describe("sauna-card", () => {
  it("registers the custom element", () => {
    expect(customElements.get("sauna-card")).toBe(SaunaCard);
  });

  it("provides a stub config without a type (HA supplies it)", () => {
    expect(SaunaCard.getStubConfig()).toEqual({});
  });

  it("rejects null, primitives, arrays and class instances", () => {
    const card = new SaunaCard();
    expect(() => card.setConfig(undefined)).toThrow();
    expect(() => card.setConfig(null)).toThrow();
    expect(() => card.setConfig([])).toThrow();
    expect(() => card.setConfig("x")).toThrow();
    expect(() => card.setConfig(new Date())).toThrow();
  });

  it("accepts a plain-object configuration (an empty object is valid)", () => {
    const card = new SaunaCard();
    expect(() => card.setConfig({})).not.toThrow();
    card.setConfig({ type: "custom:sauna-card" });
    expect(card.getCardSize()).toBe(5);
  });

  it("rejects wrong-typed fields and unknown layouts", () => {
    const card = new SaunaCard();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", language: 123 }),
    ).toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", layout: "fancy" }),
    ).toThrow();
    expect(() =>
      card.setConfig({ type: "custom:sauna-card", layout: "compact" }),
    ).not.toThrow();
  });

  it("sizes the compact layout smaller", () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card", layout: "compact" });
    expect(card.getCardSize()).toBe(2);
  });

  it("accepts tile lists and rejects non-array tile config", () => {
    const card = new SaunaCard();
    expect(() =>
      card.setConfig({
        type: "custom:sauna-card",
        dashboard_tiles: ["humidity", "power"],
        hero_items: ["status"],
      }),
    ).not.toThrow();
    expect(() =>
      card.setConfig({
        type: "custom:sauna-card",
        dashboard_tiles: "humidity",
      }),
    ).toThrow();
  });

  it("renders tiles whose value is localized without losing `this`", () => {
    // Regression: _itemTile passes the card's _t as a callback; door/status
    // tiles call it, so _t must stay bound (arrow field), not a plain method.
    const entities = {
      "switch.p": {
        entity_id: "switch.p",
        platform: "harvia_sauna",
        translation_key: "power",
        device_id: "d1",
      },
      "binary_sensor.d": {
        entity_id: "binary_sensor.d",
        platform: "harvia_sauna",
        translation_key: "door",
        device_id: "d1",
      },
    };
    const states = {
      "switch.p": { entity_id: "switch.p", state: "on", attributes: {} },
      "binary_sensor.d": {
        entity_id: "binary_sensor.d",
        state: "off",
        attributes: {},
      },
    };
    const card = new SaunaCard();
    card.setConfig({
      type: "custom:sauna-card",
      dashboard_tiles: ["status", "door"],
    });
    card.hass = {
      states,
      entities,
      devices: { d1: { id: "d1", name: "Bastu" } },
    } as unknown as Hass;
    expect(() => card.render()).not.toThrow();
    expect(card.render()).toBeTruthy();
  });

  it("renders nothing without hass and a card when no device is found", () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    expect(card.render()).toBe(nothing);
    card.hass = { states: {}, entities: {}, devices: {} } as Hass;
    const out = card.render();
    expect(out).not.toBe(nothing);
    expect(out).toBeTruthy();
  });
});
