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
