import { describe, it, expect, vi, afterEach } from "vitest";
import { logVersionBanner, dlog } from "../src/log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dlog", () => {
  it("is a no-op when disabled", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    dlog(false, "anything", { a: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs with the [sauna-card] prefix when enabled", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    dlog(true, "hello", 42);
    expect(spy).toHaveBeenCalledWith("[sauna-card]", "hello", 42);
  });
});

describe("logVersionBanner", () => {
  it("prints a styled banner carrying the build version", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logVersionBanner("Sauna Card");
    expect(spy).toHaveBeenCalledTimes(1);
    const [msg, style] = spy.mock.calls[0];
    expect(msg).toContain("%c");
    expect(msg).toContain("Sauna Card");
    expect(msg).toContain(__VERSION__);
    expect(typeof style).toBe("string");
  });
});
