import { describe, it, expect } from "vitest";
import { BADGE_ITEMS, BADGE_ITEM_KEYS, isBadgeItemKey } from "../src/status";
import type { SaunaState } from "../src/types";

// Identity translate: returns the key, so on/off assertions read "common.on".
const tr = (k: string): string => k;

const base: SaunaState = {
  integration: "harvia_sauna",
  deviceId: "d",
  available: true,
  status: "heating",
  entities: {},
};

describe("status item catalog", () => {
  it("has a definition for every advertised key, and no extras", () => {
    for (const k of BADGE_ITEM_KEYS) expect(BADGE_ITEMS[k]).toBeTruthy();
    expect(BADGE_ITEM_KEYS.length).toBe(Object.keys(BADGE_ITEMS).length);
  });

  it("hides items whose datum is absent (null value)", () => {
    expect(BADGE_ITEMS.humidity.value(base, tr)).toBeNull();
    expect(BADGE_ITEMS.light.value(base, tr)).toBeNull();
    expect(BADGE_ITEMS.aroma_level.value(base, tr)).toBeNull();
  });

  it("formats switch and boolean items as localized on/off", () => {
    const s: SaunaState = {
      ...base,
      switches: { light: true },
      heatingActive: false,
    };
    expect(BADGE_ITEMS.light.value(s, tr)).toEqual({ text: "common.on" });
    expect(BADGE_ITEMS.heating.value(s, tr)).toEqual({ text: "common.off" });
  });

  it("formats numeric items with their units", () => {
    const s: SaunaState = {
      ...base,
      targetHumidity: 35,
      wifiRssi: -56,
      power: 6800,
      energy: 1.25,
      sessionLength: 60,
      aromaLevel: 35,
    };
    expect(BADGE_ITEMS.aroma_level.value(s, tr)).toEqual({
      text: "35",
      unit: "%",
    });
    expect(BADGE_ITEMS.target_humidity.value(s, tr)).toEqual({
      text: "35",
      unit: "%",
    });
    expect(BADGE_ITEMS.wifi.value(s, tr)).toEqual({ text: "-56", unit: "dBm" });
    expect(BADGE_ITEMS.power.value(s, tr)).toEqual({ text: "6800", unit: "W" });
    expect(BADGE_ITEMS.energy.value(s, tr)).toEqual({
      text: "1.3",
      unit: "kWh",
    });
    expect(BADGE_ITEMS.session_length.value(s, tr)).toEqual({
      text: "60",
      unit: "min",
    });
  });

  it("signs the temperature trend and units it per minute", () => {
    expect(
      BADGE_ITEMS.temp_trend.value({ ...base, tempTrend: 1.4 }, tr),
    ).toEqual({ text: "+1.4", unit: "°/min" });
    expect(
      BADGE_ITEMS.temp_trend.value({ ...base, tempTrend: -0.5 }, tr),
    ).toEqual({ text: "-0.5", unit: "°/min" });
  });

  it("renders raw-string and diagnostic items", () => {
    const s: SaunaState = {
      ...base,
      statusCodes: "E1",
      totalHours: 1234,
      ph1RelayCounter: 5,
      safetyRelay: true,
    };
    expect(BADGE_ITEMS.status_codes.value(s, tr)).toEqual({ text: "E1" });
    expect(BADGE_ITEMS.total_hours.value(s, tr)).toEqual({
      text: "1234",
      unit: "h",
    });
    expect(BADGE_ITEMS.ph1_relay_counter.value(s, tr)).toEqual({ text: "5" });
    expect(BADGE_ITEMS.safety_relay.value(s, tr)).toEqual({
      text: "common.on",
    });
    // Empty string is treated as absent (item hides), not shown as blank.
    expect(
      BADGE_ITEMS.status_codes.value({ ...base, statusCodes: "" }, tr),
    ).toBeNull();
  });

  it("accepts new keys and rejects prototype props", () => {
    expect(isBadgeItemKey("auto_fan")).toBe(true);
    expect(isBadgeItemKey("eta")).toBe(true);
    expect(isBadgeItemKey("toString")).toBe(false);
    expect(isBadgeItemKey(undefined)).toBe(false);
  });
});
