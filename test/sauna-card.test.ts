import { describe, it, expect } from "vitest";
import { SaunaCard } from "../src/sauna-card";
import "../src/sauna-card";

describe("sauna-card", () => {
  it("registers the custom element", () => {
    expect(customElements.get("sauna-card")).toBe(SaunaCard);
  });

  it("provides a stub config of the right type", () => {
    expect(SaunaCard.getStubConfig()).toEqual({ type: "custom:sauna-card" });
  });

  it("rejects an empty configuration", () => {
    const card = new SaunaCard();
    expect(() => card.setConfig(undefined as never)).toThrow();
  });

  it("accepts a valid configuration", () => {
    const card = new SaunaCard();
    card.setConfig({ type: "custom:sauna-card" });
    expect(card.getCardSize()).toBe(3);
  });
});
