import { describe, expect, it } from "vitest";
import {
  advancedToggleData,
  advancedTogglePatch,
} from "../src/editor/advanced-toggles";

describe("advanced toggles", () => {
  it.each([
    [{}, { show_version: true, debug: false }],
    [{ show_version: false }, { show_version: false, debug: false }],
    [
      { show_version: true, debug: true },
      { show_version: true, debug: true },
    ],
  ])("shows %o as %o", (cfg, data) => {
    expect(advancedToggleData(cfg)).toEqual(data);
  });

  it.each([
    [
      { show_version: true, debug: false },
      { show_version: undefined, debug: undefined },
    ],
    [
      { show_version: false, debug: false },
      { show_version: false, debug: undefined },
    ],
    [
      { show_version: true, debug: true },
      { show_version: undefined, debug: true },
    ],
    [
      { show_version: false, debug: true },
      { show_version: false, debug: true },
    ],
  ])("stores only non-defaults for %o", (value, patch) => {
    expect(advancedTogglePatch(value)).toEqual(patch);
  });
});
