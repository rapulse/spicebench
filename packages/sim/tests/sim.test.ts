import { describe, it, expect } from "vitest";
import { SIM_VERSION } from "../src/index";

describe("Sim package stub", () => {
  it("should export sim version", () => {
    expect(SIM_VERSION).toBe("0.1.0");
  });
});
