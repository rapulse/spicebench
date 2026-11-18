import { describe, it, expect } from "vitest";
import { DESKTOP_VERSION } from "../src/index";

describe("Desktop package stub", () => {
  it("should export desktop version", () => {
    expect(DESKTOP_VERSION).toBe("0.1.0");
  });
});
