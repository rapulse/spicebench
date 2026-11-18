import { describe, it, expect } from "vitest";
import { MCP_VERSION } from "../src/index";

describe("MCP package stub", () => {
  it("should export mcp version", () => {
    expect(MCP_VERSION).toBe("0.1.0");
  });
});
