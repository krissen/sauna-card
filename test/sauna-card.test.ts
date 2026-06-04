import { describe, it, expect } from "vitest";
// Importing the named export also evaluates the module and runs the
// @customElement side effect that registers the element.
import { SaunaCard } from "../src/sauna-card";

describe("sauna-card", () => {
  it("registers the custom element", () => {
    expect(customElements.get("sauna-card")).toBe(SaunaCard);
  });

  it("provides a stub config of the right type", () => {
    expect(SaunaCard.getStubConfig()).toEqual({ type: "custom:sauna-card" });
  });

  it("rejects an empty configuration", () => {
    const card = new SaunaCard();
    expect(() => card.setConfig(undefined)).toThrow();
  });

  it("accepts a valid configuration", () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    expect(card.getCardSize()).toBe(3);
  });
});
