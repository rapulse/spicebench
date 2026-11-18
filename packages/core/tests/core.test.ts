import { describe, it, expect } from "vitest";
import { CORE_VERSION } from "../src/index";

describe("Core package stub", () => {
  it("should export core version", () => {
    expect(CORE_VERSION).toBe("0.1.0");
  });
});
